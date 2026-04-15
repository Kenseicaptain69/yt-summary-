import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

interface CacheEntry {
  data: any;
  expiry: number;
  accessCount: number;
}

const transcriptCache = new Map<string, CacheEntry>();
const SUMMARY_CACHE_TTL = 1000 * 60 * 60;
const SUMMARY_CACHE_MAX = 100;

const conversationHistory = new Map<string, { role: string; content: string; timestamp: number }[]>();
const CONVERSATION_MAX_TURNS = 10;
const CONVERSATION_TTL = 1000 * 60 * 30;

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers = new Map<string, CircuitState>();
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_TIMEOUT = 30000;

const usageStats = {
  requests: 0,
  cacheHits: 0,
  errors: 0,
  startTime: Date.now(),
  byEndpoint: new Map<string, number>(),
  byModel: new Map<string, number>(),
};

function generateCacheKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

function getCircuitState(service: string): CircuitState {
  const state = circuitBreakers.get(service) || { failures: 0, lastFailure: 0, isOpen: false };
  if (state.isOpen && Date.now() - state.lastFailure > CIRCUIT_RESET_TIMEOUT) {
    state.isOpen = false;
    state.failures = 0;
  }
  circuitBreakers.set(service, state);
  return state;
}

function recordCircuitFailure(service: string): void {
  const state = getCircuitState(service);
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.isOpen = true;
    console.warn(`Circuit breaker opened for ${service}`);
  }
}

function recordCircuitSuccess(service: string): void {
  const state = getCircuitState(service);
  state.failures = 0;
  state.isOpen = false;
}

function cacheGet(key: string): any | null {
  const entry = transcriptCache.get(key);
  if (entry && entry.expiry > Date.now()) {
    entry.accessCount++;
    return entry.data;
  }
  transcriptCache.delete(key);
  return null;
}

function cacheSet(key: string, data: any): void {
  if (transcriptCache.size >= SUMMARY_CACHE_MAX) {
    let oldestKey = null;
    let oldestAge = Infinity;
    for (const [k, v] of transcriptCache) {
      const age = Date.now() - v.expiry;
      if (age < oldestAge) {
        oldestAge = age;
        oldestKey = k;
      }
    }
    if (oldestKey) transcriptCache.delete(oldestKey);
  }
  transcriptCache.set(key, { data, expiry: Date.now() + SUMMARY_CACHE_TTL, accessCount: 0 });
}

app.get('/api/health', (req, res) => {
  const uptime = Date.now() - usageStats.startTime;
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime / 1000),
    uptimeFormatted: `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m`,
    stats: {
      totalRequests: usageStats.requests,
      cacheHits: usageStats.cacheHits,
      cacheHitRate: usageStats.requests > 0 ? `${((usageStats.cacheHits / usageStats.requests) * 100).toFixed(1)}%` : '0%',
      errors: usageStats.errors,
      endpoints: Object.fromEntries(usageStats.byEndpoint),
      models: Object.fromEntries(usageStats.byModel),
    },
    cache: { size: transcriptCache.size, max: SUMMARY_CACHE_MAX },
    circuits: Object.fromEntries(circuitBreakers),
    version: '2.0.0',
  });
});

const requestCounts = new Map<string, { count: number; resetAt: number; tokens: number }>();
const RATE_LIMIT = 20;
const RATE_LIMIT_TOKENS = 50000;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string, tokensEstimate = 1000): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  let record = requestCounts.get(ip);
  
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + RATE_WINDOW_MS, tokens: tokensEstimate };
    requestCounts.set(ip, record);
    return { allowed: true, remaining: RATE_LIMIT - 1, resetIn: RATE_WINDOW_MS };
  }
  
  if (record.count >= RATE_LIMIT || record.tokens >= RATE_LIMIT_TOKENS) {
    return { allowed: false, remaining: Math.max(0, RATE_LIMIT - record.count), resetIn: record.resetAt - now };
  }
  
  record.count++;
  record.tokens += tokensEstimate;
  return { allowed: true, remaining: RATE_LIMIT - record.count, resetIn: record.resetAt - now };
}

app.use('/api/', (req, res, next) => {
  usageStats.requests++;
  const endpoint = req.path.split('/').pop() || 'unknown';
  usageStats.byEndpoint.set(endpoint, (usageStats.byEndpoint.get(endpoint) || 0) + 1);
  
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = checkRateLimit(ip);
  
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT));
  res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(limit.resetIn / 1000)));
  
  if (!limit.allowed) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil(limit.resetIn / 1000),
    });
  }
  next();
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type SummaryStyle = 'brief' | 'detailed' | 'bullets' | 'timestamped' | 'question' | 'actionable';
type SummaryLength = 'short' | 'medium' | 'detailed';
type Language = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'ko' | 'zh';
type Model = 'gemini-2.0-flash-lite' | 'gemini-1.5-flash' | 'gemini-2.0-flash' | 'gemini-2.5-pro';

const MODELS: Model[] = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];

const LENGTH_CONFIGS = {
  short: { multiplier: 0.5 },
  medium: { multiplier: 1.0 },
  detailed: { multiplier: 1.5 },
};

const STYLE_CONFIGS = {
  brief: { temperature: 0.3, maxTokens: 500, system: 'Create concise, engaging summaries in 2-3 sentences.' },
  detailed: { temperature: 0.7, maxTokens: 2000, system: 'Create comprehensive summaries covering all key points with examples.' },
  bullets: { temperature: 0.5, maxTokens: 1500, system: 'Use clear categories: Key Takeaways, Important Concepts, Action Items. Start each point with •' },
  timestamped: { temperature: 0.5, maxTokens: 2000, system: 'Organize by key moments with timestamps in [MM:SS] format.' },
  question: { temperature: 0.3, maxTokens: 1000, system: 'Format as Q&A based on the content.' },
  actionable: { temperature: 0.6, maxTokens: 1200, system: 'Focus on actionable insights and practical steps users can take.' },
};

const LANGUAGE_PROMPTS: Record<Language, string> = {
  en: 'Provide the summary in English.',
  es: 'Provide the summary in Spanish.',
  fr: 'Provide the summary in French.',
  de: 'Provide the summary in German.',
  pt: 'Provide the summary in Portuguese.',
  ja: 'Provide the summary in Japanese.',
  ko: 'Provide the summary in Korean.',
  zh: 'Provide the summary in Chinese.',
};

app.post('/api/summarize', async (req, res) => {
  try {
    const { 
      url, 
      style = 'brief',
      length = 'medium',
      topics,
      language = 'en',
      model,
      stream = false,
      conversationId,
    } = req.body as {
      url?: string;
      style?: SummaryStyle;
      length?: SummaryLength;
      topics?: string[];
      language?: Language;
      model?: Model;
      stream?: boolean;
      conversationId?: string;
    };
    
    if (!url) {
      usageStats.errors++;
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();
    const cacheKey = generateCacheKey(`${videoId}:${style}:${length}:${language}:${topics?.join(',') || ''}`);
    
    const cached = cacheGet(cacheKey);
    if (cached) {
      usageStats.cacheHits++;
      console.log('Cache hit for', videoId);
      return res.json({ ...cached, cached: true });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      const circuit = getCircuitState('supadata');
      if (!circuit.isOpen) {
        try {
          const transcriptRes = await fetch(
            `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
            {
              headers: { 
                "x-api-key": process.env.SUPADATA_API_KEY,
                "Content-Type": "application/json"
              }
            }
          );
          
          if (!transcriptRes.ok) {
            throw new Error(`Supadata error: ${transcriptRes.status}`);
          }
          
          const transcriptData = await transcriptRes.json();
          if (transcriptData.content) {
            transcript = transcriptData.content.map((c: any) => c.text).join(' ');
            console.log(`Supadata transcript: ${transcript.length} chars`);
            recordCircuitSuccess('supadata');
          }
        } catch (e: any) {
          console.warn(`Supadata fetch failed: ${e.message}`);
          recordCircuitFailure('supadata');
        }
      } else {
        console.warn('Supadata circuit open, skipping');
      }
    }

    if (!transcript) {
      usageStats.errors++;
      return res.status(400).json({ 
        error: 'Could not fetch transcript',
        videoId,
        hint: 'Video may not have captions or Supadata API key may be invalid.',
      });
    }

    const selectedModel = model || MODELS[0];
    usageStats.byModel.set(selectedModel, (usageStats.byModel.get(selectedModel) || 0) + 1);
    
    const config = STYLE_CONFIGS[style] || STYLE_CONFIGS.brief;
    const lengthConfig = LENGTH_CONFIGS[length] || LENGTH_CONFIGS.medium;
    const langPrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.en;
    const topicFilter = topics?.length ? `\n\nFocus on: ${topics.join(', ')}` : '';
    const lengthInstruction = length === 'short' ? 'Keep it very brief.' : length === 'detailed' ? 'Provide extensive detail.' : '';
    
    const maxTokens = Math.round(config.maxTokens * lengthConfig.multiplier);
    let fullPrompt = `${config.system} ${langPrompt} ${lengthInstruction}${topicFilter}\n\nTranscript:\n\n${transcript.substring(0, 25000)}`;
    
    let summary = '';
    let success = false;
    
    const modelsToTry = selectedModel === selectedModel ? [selectedModel] : MODELS;
    
    for (const m of modelsToTry) {
      const circuit = getCircuitState(m);
      if (circuit.isOpen) continue;
      
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: fullPrompt,
          config: {
            temperature: config.temperature,
            maxOutputTokens: maxTokens,
            systemInstruction: config.system,
          }
        });
        
        summary = response.text || '';
        if (summary) {
          recordCircuitSuccess(m);
          success = true;
          break;
        }
      } catch (err: any) {
        console.warn(`Gemini (${m}): ${err.message?.substring(0, 80)}`);
        recordCircuitFailure(m);
      }
    }

    if (!summary) {
      usageStats.errors++;
      return res.status(500).json({ error: 'AI summarization failed' });
    }

    const convId = `conv_${videoId}_${Date.now()}`;
    
    const result = {
      videoId,
      summary,
      style,
      length,
      language,
      model: selectedModel,
      transcriptLength: transcript.length,
      timestamp: new Date().toISOString(),
      conversationId: convId,
    };

    // Seed conversation history with the summary context
    conversationHistory.set(convId, [{
      role: 'assistant',
      content: `Here is the summary of the video:\n\n${summary}`,
      timestamp: Date.now(),
    }]);

    cacheSet(cacheKey, result);
    res.json(result);

  } catch (error: any) {
    usageStats.errors++;
    console.error('Summarization error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/summarize/stream', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { url, style = 'brief', language = 'en' } = req.body as {
      url?: string;
      style?: SummaryStyle;
      language?: Language;
    };
    
    if (!url) {
      res.write('data: {"error": "YouTube URL is required"}\n\n');
      res.end();
      return;
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      res.write(`data: ${JSON.stringify({ error: 'Could not fetch transcript' })}\n\n`);
      res.end();
      return;
    }

    const config = STYLE_CONFIGS[style] || STYLE_CONFIGS.brief;
    const langPrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.en;
    const prompt = `${config.system} ${langPrompt}\n\nTranscript:\n\n${transcript.substring(0, 25000)}`;

    res.write(`data: ${JSON.stringify({ status: 'generating', videoId })}\n\n`);

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    });

    for await (const chunk of response) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.post('/api/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, action = 'ask' } = req.body as { message?: string; action?: 'ask' | 'clarify' | 'expand' };
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let history = conversationHistory.get(conversationId) || [];
    const now = Date.now();
    history = history.filter(h => now - h.timestamp < CONVERSATION_TTL);
    
    history.push({ role: 'user', content: message, timestamp: now });
    
    const systemPrompt = action === 'clarify' 
      ? 'Ask clarifying questions about the video content.' 
      : action === 'expand'
      ? 'Expand on the key points with more details and examples.'
      : 'Answer the question based on the video content.';
    
    const context = history.slice(-CONVERSATION_MAX_TURNS).map(h => `${h.role}: ${h.content}`).join('\n');
    
    const prompt = `${systemPrompt}\n\nConversation:\n${context}\n\n assistant:`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.7, maxOutputTokens: 1000 },
    });
    
    const answer = response.text || '';
    history.push({ role: 'assistant', content: answer, timestamp: Date.now() });
    
    conversationHistory.set(conversationId, history.slice(-CONVERSATION_MAX_TURNS));
    
    res.json({
      conversationId,
      message: answer,
      history: history.slice(-5).map(h => ({ role: h.role, content: h.content.substring(0, 200) })),
    });

  } catch (error: any) {
    console.error('Conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversation/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const history = conversationHistory.get(conversationId) || [];
  res.json({ conversationId, turns: history.length, history });
});

app.delete('/api/conversation/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  conversationHistory.delete(conversationId);
  res.json({ message: 'Conversation cleared', conversationId });
});

app.post('/api/batch', async (req, res) => {
  try {
    const { urls, style = 'brief', language = 'en' } = req.body as {
      urls?: string[];
      style?: SummaryStyle;
      language?: Language;
    };
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'Array of URLs required' });
    }

    if (urls.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 URLs per batch' });
    }

    const results = await Promise.allSettled(
      urls.slice(0, 10).map(async (url, index) => {
        try {
          const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
          const videoId = videoIdMatch?.[1] || `video_${index}`;
          
          let transcript = '';
          if (process.env.SUPADATA_API_KEY) {
            const transcriptRes = await fetch(
              `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
              {
                headers: { 
                  "x-api-key": process.env.SUPADATA_API_KEY,
                  "Content-Type": "application/json"
                }
              }
            );
            const transcriptData = await transcriptRes.json();
            if (transcriptData.content) {
              transcript = transcriptData.content.map((c: any) => c.text).join(' ');
            }
          }

          if (!transcript) {
            return { videoId, url, status: 'failed', error: 'No transcript' };
          }

          const config = STYLE_CONFIGS[style] || STYLE_CONFIGS.brief;
          const langPrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.en;
          const prompt = `${config.system} ${langPrompt}\n\nTranscript:\n\n${transcript.substring(0, 15000)}`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
            config: { temperature: config.temperature, maxOutputTokens: config.maxTokens },
          });

          return {
            videoId,
            url,
            status: 'success',
            summary: response.text || '',
          };
        } catch (e: any) {
          return { url, status: 'error', error: e.message };
        }
      })
    );

    const summaries = results.map((r, i) => 
      r.status === 'fulfilled' ? r.value : { url: urls[i], status: 'error', error: 'Request failed' }
    );

    res.json({
      total: urls.length,
      successful: summaries.filter(s => s.status === 'success').length,
      failed: summaries.filter(s => s.status === 'failed').length,
      results: summaries,
    });

  } catch (error: any) {
    console.error('Batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhook/register', (req, res) => {
  const { url, events } = req.body as { url?: string; events?: string[] };
  
  if (!url) {
    return res.status(400).json({ error: 'Webhook URL required' });
  }
  
  console.log(`Webhook registered: ${url} for events: ${events?.join(', ') || 'all'}`);
  res.json({ message: 'Webhook registered', url, events });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const prompt = `Analyze this video and provide structured output:
- **Topics**: Main topics (comma-separated)
- **Sentiment**: Overall tone
- **Difficulty**: Beginner/Intermediate/Advanced
- **Audience**: Who this is for
- **Key Terms**: Important terminology
- **Summary**: Brief overview (2-3 sentences)

Transcript: ${transcript.substring(0, 10000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
      config: { temperature: 0.3 }
    });

    const analysisText = response.text || '';
    
    const extractField = (text: string, field: string) => {
      const match = text.match(new RegExp(`\\*\\*${field}\\*\\*:?\\s*(.+?)(?=\\*\\*|$)`, 'i'));
      return match?.[1]?.trim() || 'N/A';
    };

    res.json({
      videoId,
      topics: extractField(analysisText, 'Topics').split(',').map(t => t.trim()),
      sentiment: extractField(analysisText, 'Sentiment'),
      difficulty: extractField(analysisText, 'Difficulty'),
      audience: extractField(analysisText, 'Audience'),
      keyTerms: extractField(analysisText, 'Key Terms').split(',').map(t => t.trim()),
      summary: extractField(analysisText, 'Summary'),
      fullAnalysis: analysisText,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q, videoId } = req.query as { q?: string; videoId?: string };
    
    if (!q || !videoId) {
      return res.status(400).json({ error: 'Query (q) and videoId required' });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const prompt = `Search for "${q}" in this transcript. Provide relevant context around each mention:

Transcript: ${transcript.substring(0, 15000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
      config: { temperature: 0.2 }
    });

    res.json({
      videoId,
      query: q,
      results: response.text || 'No results found',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chapters', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const prompt = `Generate chapter markers for this video. Format as a list with timestamps and titles:

Transcript: ${transcript.substring(0, 15000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 1500 }
    });

    const chaptersText = response.text || '';
    const chapters = chaptersText.split('\n').filter(line => line.match(/^\d|:\d/)).slice(0, 10);

    res.json({
      videoId,
      chapters: chapters.map(c => ({ title: c.trim(), timestamp: '00:00' })),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Chapters error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/title', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const prompt = `Generate an engaging, click-worthy title for this video based on the transcript. 
    Keep it concise (under 60 characters). Make it descriptive and intriguing.
    
    Transcript excerpt: ${transcript.substring(0, 5000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.8, maxOutputTokens: 100 }
    });

    const title = response.text?.trim()?.replace(/^["']|["']$/g, '') || 'Video Summary';

    res.json({
      videoId,
      title,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Title generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NEW: Generate Flashcards from Video
// ============================================================
app.post('/api/flashcards', async (req, res) => {
  try {
    const { url, count = 8 } = req.body as { url?: string; count?: number };
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const cacheKey = generateCacheKey(`flashcards:${videoId}:${count}`);
    const cached = cacheGet(cacheKey);
    if (cached) {
      usageStats.cacheHits++;
      return res.json({ ...cached, cached: true });
    }

    let transcript = '';
    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          transcript = transcriptData.content.map((c: any) => c.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const prompt = `Based on this video transcript, generate exactly ${Math.min(count, 15)} study flashcards.

For each flashcard, provide:
- A clear, focused question
- A concise but complete answer
- A difficulty level (easy, medium, hard)

Format your response ONLY as a valid JSON array like this, with no other text:
[
  {"question": "...", "answer": "...", "difficulty": "easy"},
  {"question": "...", "answer": "...", "difficulty": "medium"}
]

Transcript: ${transcript.substring(0, 15000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.4, maxOutputTokens: 3000 }
    });

    let flashcards = [];
    try {
      const text = response.text || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      flashcards = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (parseErr) {
      console.warn('Failed to parse flashcards JSON, attempting line-by-line');
      flashcards = [{ question: 'Could not generate flashcards', answer: response.text || '', difficulty: 'medium' }];
    }

    const result = {
      videoId,
      flashcards,
      count: flashcards.length,
      timestamp: new Date().toISOString(),
    };

    cacheSet(cacheKey, result);
    res.json(result);

  } catch (error: any) {
    console.error('Flashcard generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NEW: Get Raw Transcript for Viewer
// ============================================================
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId || videoId.length !== 11) {
      return res.status(400).json({ error: 'Valid video ID required' });
    }

    const cacheKey = generateCacheKey(`transcript:${videoId}`);
    const cached = cacheGet(cacheKey);
    if (cached) {
      usageStats.cacheHits++;
      return res.json({ ...cached, cached: true });
    }

    let segments: { text: string; offset?: number }[] = [];
    let fullText = '';

    if (process.env.SUPADATA_API_KEY) {
      try {
        const transcriptRes = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          {
            headers: { 
              "x-api-key": process.env.SUPADATA_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const transcriptData = await transcriptRes.json();
        if (transcriptData.content) {
          segments = transcriptData.content.map((c: any) => ({
            text: c.text,
            offset: c.offset || 0,
          }));
          fullText = segments.map(s => s.text).join(' ');
        }
      } catch (e: any) {
        console.warn(`Supadata failed: ${e.message}`);
      }
    }

    if (!fullText) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    const result = {
      videoId,
      transcript: fullText,
      segments,
      wordCount: fullText.split(/\s+/).length,
      characterCount: fullText.length,
      timestamp: new Date().toISOString(),
    };

    cacheSet(cacheKey, result);
    res.json(result);

  } catch (error: any) {
    console.error('Transcript fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clear', (req, res) => {
  transcriptCache.clear();
  res.json({ message: 'Cache cleared', size: 0 });
});

app.get('/api/cache', (req, res) => {
  const entries = Array.from(transcriptCache.entries()).slice(0, 10).map(([k, v]) => ({
    key: k,
    age: Math.floor((Date.now() - v.expiry) / 1000),
    accesses: v.accessCount,
  }));
  res.json({ size: transcriptCache.size, max: SUMMARY_CACHE_MAX, entries });
});

app.get('/api/stats', (req, res) => {
  res.json({
    ...usageStats,
    circuits: Object.fromEntries(circuitBreakers),
  });
});

app.delete('/api/cache/:key', (req, res) => {
  const { key } = req.params;
  const deleted = transcriptCache.delete(key);
  res.json({ deleted, key });
});

// ============================================================
// NOTEBOOK HELPER: Fetch transcripts for multiple videos
// ============================================================
async function fetchMultipleTranscripts(videoIds: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (!process.env.SUPADATA_API_KEY) return results;

  await Promise.allSettled(
    videoIds.map(async (videoId) => {
      const cacheKey = generateCacheKey(`transcript:${videoId}`);
      const cached = cacheGet(cacheKey);
      if (cached?.transcript) {
        results.set(videoId, cached.transcript);
        return;
      }
      try {
        const res = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`,
          { headers: { 'x-api-key': process.env.SUPADATA_API_KEY!, 'Content-Type': 'application/json' } }
        );
        const data = await res.json();
        if (data.content) {
          const text = data.content.map((c: any) => c.text).join(' ');
          results.set(videoId, text);
        }
      } catch (e: any) {
        console.warn(`Transcript fetch failed for ${videoId}: ${e.message}`);
      }
    })
  );
  return results;
}

// ============================================================
// NOTEBOOK: Generate Study Guide from multiple sources
// ============================================================
app.post('/api/notebook/study-guide', async (req, res) => {
  try {
    const { videoIds, language = 'en' } = req.body as { videoIds?: string[]; language?: string };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.entries())
      .map(([id, t]) => `[Video ${id}]:\n${t.substring(0, 8000)}`)
      .join('\n\n---\n\n');

    const langInstruction = language !== 'en' ? `Respond in ${language} language.` : '';

    const prompt = `You are an expert educator. Create a comprehensive study guide from these video transcripts. ${langInstruction}

Structure the guide as:
# Study Guide
## Overview (2-3 sentence introduction)
## Key Concepts (numbered list with explanations)
## Important Details (bullet points of crucial information)
## Connections Between Topics (how concepts relate)
## Summary (concise wrap-up)
## Review Questions (5 questions to test understanding)

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.5, maxOutputTokens: 4000 }
    });

    res.json({
      studyGuide: response.text || '',
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Study guide error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Generate Mind Map (Mermaid syntax)
// ============================================================
app.post('/api/notebook/mind-map', async (req, res) => {
  try {
    const { videoIds, language = 'en' } = req.body as { videoIds?: string[]; language?: string };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.values()).map(t => t.substring(0, 6000)).join('\n\n');
    const langInstruction = language !== 'en' ? `Use ${language} language for all labels.` : '';

    const prompt = `Analyze these video transcripts and generate a mind map in Mermaid.js mindmap syntax. ${langInstruction}

Rules:
- Use the "mindmap" diagram type
- Create a central topic node
- Add 4-6 main branches
- Each branch should have 2-4 sub-topics
- Keep labels short (2-5 words)
- Do NOT use special characters in labels (no parentheses, brackets, quotes)
- Output ONLY the mermaid code block, nothing else

Example format:
mindmap
  root((Main Topic))
    Branch One
      Sub topic A
      Sub topic B
    Branch Two
      Sub topic C

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.4, maxOutputTokens: 1500 }
    });

    let mermaidCode = response.text || '';
    const match = mermaidCode.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
    if (match) mermaidCode = match[1].trim();
    if (!mermaidCode.startsWith('mindmap')) mermaidCode = 'mindmap\n  root((Topics))\n    No data available';

    res.json({
      mindMap: mermaidCode,
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Mind map error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Generate Quiz with scoring
// ============================================================
app.post('/api/notebook/quiz', async (req, res) => {
  try {
    const { videoIds, difficulty = 'mixed', count = 10, language = 'en' } = req.body as {
      videoIds?: string[]; difficulty?: string; count?: number; language?: string;
    };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.values()).map(t => t.substring(0, 8000)).join('\n\n');
    const langInstruction = language !== 'en' ? `Write all questions and answers in ${language} language.` : '';
    const diffInstruction = difficulty === 'mixed' ? 'Mix easy, medium, and hard questions.' : `Make all questions ${difficulty} difficulty.`;

    const prompt = `Generate exactly ${Math.min(count, 20)} quiz questions from these video transcripts. ${langInstruction} ${diffInstruction}

Format as a valid JSON array ONLY (no other text):
[
  {
    "type": "multiple_choice",
    "question": "Question text?",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctAnswer": 0,
    "explanation": "Why this is correct",
    "difficulty": "easy"
  },
  {
    "type": "true_false",
    "question": "Statement to evaluate",
    "correctAnswer": true,
    "explanation": "Why true/false",
    "difficulty": "medium"
  }
]

Mix multiple_choice and true_false types. Make ~70% multiple choice and ~30% true/false.

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.5, maxOutputTokens: 5000 }
    });

    let quiz: any[] = [];
    try {
      const text = response.text || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      quiz = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      quiz = [{ type: 'multiple_choice', question: 'Quiz generation failed', options: ['N/A'], correctAnswer: 0, explanation: '', difficulty: 'easy' }];
    }

    res.json({
      quiz,
      count: quiz.length,
      difficulty,
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Quiz error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Extract Key Concepts
// ============================================================
app.post('/api/notebook/concepts', async (req, res) => {
  try {
    const { videoIds, language = 'en' } = req.body as { videoIds?: string[]; language?: string };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.values()).map(t => t.substring(0, 8000)).join('\n\n');
    const langInstruction = language !== 'en' ? `Respond in ${language} language.` : '';

    const prompt = `Extract key concepts from these video transcripts. ${langInstruction}

Return ONLY a valid JSON array:
[
  {
    "term": "Concept Name",
    "definition": "Clear 1-2 sentence definition",
    "category": "Category name",
    "importance": "high"
  }
]

importance can be: "high", "medium", or "low"
Extract 10-15 concepts, ordered by importance.

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 3000 }
    });

    let concepts: any[] = [];
    try {
      const text = response.text || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      concepts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      concepts = [];
    }

    res.json({
      concepts,
      count: concepts.length,
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Concepts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Generate AI Audio Script (Podcast-style)
// ============================================================
app.post('/api/notebook/audio-script', async (req, res) => {
  try {
    const { videoIds, language = 'en' } = req.body as { videoIds?: string[]; language?: string };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.values()).map(t => t.substring(0, 6000)).join('\n\n');
    const langInstruction = language !== 'en' ? `Write the entire conversation in ${language} language.` : '';

    const prompt = `Create an engaging podcast-style conversation between two hosts discussing the content from these video transcripts. ${langInstruction}

Host A is "Alex" - enthusiastic and asks great questions.
Host B is "Sam" - knowledgeable and gives insightful answers.

Rules:
- Write 8-12 exchanges (back and forth)
- Make it conversational and natural
- Cover the key points from the videos
- Add some humor and personality
- Format each line as: "Alex: ..." or "Sam: ..."
- Start with an introduction and end with a wrap-up
- Each response should be 2-4 sentences max

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.8, maxOutputTokens: 3000 }
    });

    const scriptText = response.text || '';
    const lines = scriptText.split('\n').filter(l => l.trim());
    const segments = lines.map(line => {
      const alexMatch = line.match(/^(?:\*\*)?Alex(?:\*\*)?:\s*(.*)/i);
      const samMatch = line.match(/^(?:\*\*)?Sam(?:\*\*)?:\s*(.*)/i);
      if (alexMatch) return { speaker: 'Alex', text: alexMatch[1].trim() };
      if (samMatch) return { speaker: 'Sam', text: samMatch[1].trim() };
      return null;
    }).filter(Boolean);

    res.json({
      script: scriptText,
      segments,
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Audio script error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Generate Briefing Document
// ============================================================
app.post('/api/notebook/briefing', async (req, res) => {
  try {
    const { videoIds, language = 'en' } = req.body as { videoIds?: string[]; language?: string };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const combined = Array.from(transcripts.entries())
      .map(([id, t]) => `[Source: ${id}]:\n${t.substring(0, 6000)}`)
      .join('\n\n---\n\n');
    const langInstruction = language !== 'en' ? `Write the entire briefing in ${language} language.` : '';

    const prompt = `Create a professional briefing document from these video transcripts. ${langInstruction}

Format:
# Briefing Document
**Date:** ${new Date().toLocaleDateString()}
**Sources:** ${transcripts.size} video(s)

## Executive Summary
(3-4 sentence overview)

## Key Findings
(Numbered list of 5-8 key findings)

## Detailed Analysis
(2-3 paragraphs covering major themes)

## Action Items
(Bullet list of recommended next steps)

## Conclusion
(Brief closing statement)

Transcripts:
${combined}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.5, maxOutputTokens: 4000 }
    });

    res.json({
      briefing: response.text || '',
      sourceCount: transcripts.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Briefing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTEBOOK: Multi-source Chat
// ============================================================
app.post('/api/notebook/chat', async (req, res) => {
  try {
    const { videoIds, message, conversationId, language = 'en' } = req.body as {
      videoIds?: string[]; message?: string; conversationId?: string; language?: string;
    };
    if (!videoIds?.length) return res.status(400).json({ error: 'videoIds array required' });
    if (!message) return res.status(400).json({ error: 'message required' });

    const transcripts = await fetchMultipleTranscripts(videoIds);
    if (transcripts.size === 0) return res.status(400).json({ error: 'Could not fetch any transcripts' });

    const convId = conversationId || `nb_${Date.now()}`;
    let history = conversationHistory.get(convId) || [];
    const now = Date.now();
    history = history.filter(h => now - h.timestamp < CONVERSATION_TTL);
    history.push({ role: 'user', content: message, timestamp: now });

    const combined = Array.from(transcripts.values()).map(t => t.substring(0, 5000)).join('\n\n');
    const langInstruction = language !== 'en' ? `Respond in ${language} language.` : '';
    const context = history.slice(-CONVERSATION_MAX_TURNS).map(h => `${h.role}: ${h.content}`).join('\n');

    const prompt = `You are an AI assistant with knowledge of these video transcripts. Answer the user's question based on the content. ${langInstruction}

Video Content:
${combined.substring(0, 15000)}

Conversation:
${context}

assistant:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { temperature: 0.7, maxOutputTokens: 1500 }
    });

    const answer = response.text || '';
    history.push({ role: 'assistant', content: answer, timestamp: Date.now() });
    conversationHistory.set(convId, history.slice(-CONVERSATION_MAX_TURNS));

    res.json({
      conversationId: convId,
      message: answer,
      sourceCount: transcripts.size,
    });
  } catch (error: any) {
    console.error('Notebook chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  try {
    if (NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📺 SummifyYT API v3.0 — AI Video Learning Lab               ║
║  🚀 Server running on http://localhost:${PORT}                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Core Endpoints:                                              ║
║  POST /api/summarize          - Summarize video               ║
║  POST /api/conversation/:id   - Multi-turn chat               ║
║  POST /api/analyze            - Video content analysis        ║
║  POST /api/flashcards         - Generate study flashcards     ║
║  GET  /api/transcript/:id     - Get raw transcript            ║
╠═══════════════════════════════════════════════════════════════╣
║  Notebook Endpoints:                                          ║
║  POST /api/notebook/study-guide  - Study guide generation     ║
║  POST /api/notebook/audio-script - AI podcast script          ║
║  POST /api/notebook/mind-map     - Mind map (Mermaid)         ║
║  POST /api/notebook/quiz         - Quiz with scoring          ║
║  POST /api/notebook/concepts     - Key concept extraction     ║
║  POST /api/notebook/briefing     - Briefing document          ║
║  POST /api/notebook/chat         - Multi-source chat          ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();