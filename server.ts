import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// API Routes
app.post('/api/summarize', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // 1. Get Transcript
    let transcriptText = '';

    // Extract clean video ID from any YouTube URL format
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcript.map((t: any) => t.text).join(' ');
    } catch (error: any) {
      console.error('Error fetching transcript:', error?.message || error);

      // Retry once with the full URL if video ID didn't work
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        transcriptText = transcript.map((t: any) => t.text).join(' ');
      } catch (retryError: any) {
        console.error('Retry also failed:', retryError?.message || retryError);
        return res.status(400).json({
          error: 'Could not fetch transcript for this video. It might not have closed captions, or YouTube may be blocking requests from this server.'
        });
      }
    }

    if (!transcriptText) {
      return res.status(400).json({ error: 'Transcript is empty.' });
    }

    // 2. Summarize — try Gemini first, fall back to local extractive summarizer
    let summary = '';

    if (process.env.GEMINI_API_KEY) {
      const prompt = `Summarize the following YouTube video transcript in a clear, concise paragraph:\n\n${transcriptText}`;
      const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];

      for (const model of models) {
        try {
          const response = await ai.models.generateContent({ model, contents: prompt });
          summary = response.text || '';
          if (summary) break;
        } catch (err: any) {
          console.warn(`Model ${model} failed: ${err.message?.substring(0, 80)}`);
        }
      }
    }

    // Fallback: local extractive summarizer (no API needed)
    if (!summary) {
      console.log('Using local extractive summarizer (Gemini quota exhausted or key missing)');
      summary = extractiveSummarize(transcriptText);
    }

    res.json({
      transcript: transcriptText,
      summary: summary
    });

  } catch (error: any) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: error.message || 'An error occurred during summarization' });
  }
});

// Simple extractive summarizer — picks the most important sentences
function extractiveSummarize(text: string, maxSentences = 5): string {
  // Split into sentences
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  if (sentences.length <= maxSentences) return sentences.join(' ');

  // Score sentences by word frequency
  const wordFreq: Record<string, number> = {};
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','it','its','this','that','these','those','i','you','he','she','we','they','me','him','her','us','them','my','your','his','our','their','and','but','or','so','if','then','than','to','of','in','for','on','with','at','by','from','as','into','about','not','no','up','out','just','also','very','much','more','most','all','any','each','every','some','such','only']);

  for (const w of words) {
    if (w.length > 2 && !stopWords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  // Score each sentence
  const scored = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    const score = sWords.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (sWords.length || 1);
    return { s, score, idx };
  });

  // Pick top sentences, keep original order
  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences);
  top.sort((a, b) => a.idx - b.idx);

  return top.map(t => t.s).join(' ');
}

async function startServer() {
  try {
    // Vite middleware for development
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
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer();
