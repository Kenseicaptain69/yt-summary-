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

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

interface CacheEntry {
  data: any;
  expiry: number;
}

const transcriptCache = new Map<string, CacheEntry>();
const SUMMARY_CACHE_TTL = 1000 * 60 * 60;
const SUMMARY_CACHE_MAX = 100;

function generateCacheKey(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

function cacheGet(key: string): any | null {
  const entry = transcriptCache.get(key);
  if (entry && entry.expiry > Date.now()) {
    return entry.data;
  }
  transcriptCache.delete(key);
  return null;
}

function cacheSet(key: string, data: any): void {
  if (transcriptCache.size >= SUMMARY_CACHE_MAX) {
    const oldestKey = transcriptCache.keys().next().value;
    if (oldestKey) transcriptCache.delete(oldestKey);
  }
  transcriptCache.set(key, { data, expiry: Date.now() + SUMMARY_CACHE_TTL });
}

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    uptime: process.uptime(),
    cache: { size: transcriptCache.size }
  });
});

const requestCounts = new Map<string, { count: number, resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type SummaryStyle = 'brief' | 'detailed' | 'bullets' | 'timestamped';

app.post('/api/summarize', async (req, res) => {
  try {
    const { url, style = 'brief', topics } = req.body as { url?: string; style?: SummaryStyle; topics?: string[] };
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();
    const cacheKey = generateCacheKey(`${videoId}:${style}:${topics?.join(',') || ''}`);
    
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log('Returning cached summary');
      return res.json({ ...cached, cached: true });
    }

    // Try Supadata first
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
          console.log(`Supadata transcript: ${transcript.length} chars`);
        }
      } catch (e: any) {
        console.warn(`Supadata fetch failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ 
        error: 'Could not fetch transcript. The video may not have captions available.',
        videoId,
        hint: 'Try a different video that has English subtitles.'
      });
    }

    const prompt = buildPrompt(transcript, style, topics);
    const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    let summary = '';

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: getSystemPrompt(style),
            temperature: style === 'brief' ? 0.3 : 0.7,
            maxOutputTokens: style === 'brief' ? 500 : 2000,
          }
        });
        summary = response.text || '';
        if (summary) break;
      } catch (err: any) {
        console.warn(`Gemini (${model}): ${err.message?.substring(0, 80)}`);
      }
    }

    if (!summary) {
      return res.status(500).json({ error: 'AI summarization failed. Please try again.' });
    }

    const result = {
      videoId,
      summary,
      style,
      timestamp: new Date().toISOString(),
    };

    cacheSet(cacheKey, result);
    res.json(result);

  } catch (error: any) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: error.message || 'An error occurred' });
  }
});

function buildPrompt(transcript: string, style: SummaryStyle, topics?: string[]): string {
  const baseStyle = {
    brief: 'Create a brief, one-paragraph summary (2-3 sentences)',
    detailed: 'Create a comprehensive summary with all key points covered in detail',
    bullets: 'List the key points as bullet points with clear headers',
    timestamped: 'Organize by key moments with approximate timestamps'
  }[style] || 'Create a brief summary';

  const topicFilter = topics?.length 
    ? `\n\nFocus especially on these topics: ${topics.join(', ')}` 
    : '';

  return `${baseStyle}. Transcript:\n\n${transcript.substring(0, 25000)}${topicFilter}`;
}

function getSystemPrompt(style: SummaryStyle): string {
  const prompts = {
    brief: 'You create concise, engaging video summaries. Keep it to 2-3 sentences highlighting the main insight.',
    detailed: 'You create comprehensive video summaries. Cover all key points, examples, and nuances from the content.',
    bullets: 'You create bullet-point summaries. Use clear categories like "Key Takeaways", " actionable Tips", "Important Concepts".',
    timestamped: 'You identify key moments in videos. Group content by topic with descriptive timestamps.'
  };
  return prompts[style] || prompts.brief;
}

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

    // Fetch transcript for analysis
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
        console.warn(`Supadata fetch failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript for analysis' });
    }

    const prompt = `Analyze this video transcript and provide:
1. **Topics** - Main topics covered (comma-separated)
2. **Sentiment** - Overall tone (positive/neutral/negative)
3. **Difficulty** - Beginner/Intermediate/Advanced
4. **Audience** - Who this is for
5. **Key Terms** - Important terminology used

Transcript: ${transcript.substring(0, 15000)}`;

    let analysis = '';
    const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 0.3 }
        });
        analysis = response.text || '';
        if (analysis) break;
      } catch (err: any) {
        console.warn(`Analysis failed (${model}): ${err.message?.substring(0, 80)}`);
      }
    }

    res.json({
      videoId,
      analysis: analysis || 'Analysis unavailable',
      timestamp: new Date().toISOString()
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

    // Fetch transcript
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
        console.warn(`Supadata fetch failed: ${e.message}`);
      }
    }

    if (!transcript) {
      return res.status(400).json({ error: 'Could not fetch transcript' });
    }

    // Use AI to find relevant sections
    const prompt = `Search for "${q}" in this transcript and provide the relevant context around each mention:

Transcript: ${transcript.substring(0, 20000)}`;

    let results = '';
    const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 0.2 }
        });
        results = response.text || '';
        if (results) break;
      } catch (err: any) {
        console.warn(`Search failed (${model}): ${err.message?.substring(0, 80)}`);
      }
    }

    res.json({
      videoId,
      query: q,
      results: results || 'No results found',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cache/clear', (req, res) => {
  transcriptCache.clear();
  res.json({ message: 'Cache cleared', size: 0 });
});

app.get('/api/cache', (req, res) => {
  res.json({ size: transcriptCache.size, entries: Array.from(transcriptCache.keys()) });
});

async function startServer() {
  try {
    if (process.env.NODE_ENV !== 'production') {
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
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📌 Endpoints:`);
      console.log(`   POST /api/summarize - Summarize video (url, style, topics)`);
      console.log(`   POST /api/analyze  - Analyze video content`);
      console.log(`   GET  /api/search  - Search in video (q, videoId)`);
      console.log(`   GET  /api/health  - Health check`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();