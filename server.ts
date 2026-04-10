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

    const result = {
      videoId,
      summary,
      style,
      length,
      language,
      model: selectedModel,
      transcriptLength: transcript.length,
      timestamp: new Date().toISOString(),
    };

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
      generateStreamingContent: true,
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
║  📺 YouTube Summarizer API v2.0                              ║
║  🚀 Server running on http://localhost:${PORT}                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                 ║
║  POST /api/summarize     - Summarize video (url, style, lang)  ║
║  POST /api/summarize/stream - Stream summary as it's generated     ║
║  POST /api/conversation/:id - Multi-turn chat about video       ║
║  POST /api/batch        - Batch process multiple URLs        ║
║  POST /api/analyze     - Video content analysis            ║
║  POST /api/chapters    - Generate chapter markers         ║
║  GET  /api/search     - Search within video             ║
║  GET  /api/health    - Health & stats                   ║
║  GET  /api/stats     - Usage statistics                   ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();