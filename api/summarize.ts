import type { VercelRequest, VercelResponse } from '@vercel/node';

// youtube-transcript ESM workaround
async function getTranscript(url: string) {
  const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');
  return YoutubeTranscript.fetchTranscript(url);
}

// Local extractive summarizer (no API needed)
function extractiveSummarize(text: string, maxSentences = 5): string {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  if (sentences.length <= maxSentences) return sentences.join(' ');

  const wordFreq: Record<string, number> = {};
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','it','its','this','that','these','those','i','you','he','she','we','they','me','him','her','us','them','my','your','his','our','their','and','but','or','so','if','then','than','to','of','in','for','on','with','at','by','from','as','into','about','not','no','up','out','just','also','very','much','more','most','all','any','each','every','some','such','only']);

  for (const w of words) {
    if (w.length > 2 && !stopWords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  const scored = sentences.map((s, idx) => {
    const sWords = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    const score = sWords.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (sWords.length || 1);
    return { s, score, idx };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences);
  top.sort((a, b) => a.idx - b.idx);
  return top.map(t => t.s).join(' ');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    // 1. Get transcript — extract clean video ID first
    let transcriptText = '';
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();

    try {
      const transcript = await getTranscript(videoId);
      transcriptText = (transcript as any[]).map(t => t.text).join(' ');
    } catch (error) {
      // Retry with full URL
      try {
        const transcript = await getTranscript(url);
        transcriptText = (transcript as any[]).map(t => t.text).join(' ');
      } catch (retryError) {
        return res.status(400).json({ error: 'Could not fetch transcript. The video may not have captions, or YouTube may be blocking requests from this server.' });
      }
    }

    if (!transcriptText) {
      return res.status(400).json({ error: 'Transcript is empty.' });
    }

    // 2. Try Gemini, fall back to local summarizer
    let summary = '';

    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

    // Fallback
    if (!summary) {
      summary = extractiveSummarize(transcriptText);
    }

    return res.status(200).json({ transcript: transcriptText, summary });
  } catch (error: any) {
    console.error('Summarization error:', error);
    return res.status(500).json({ error: error.message || 'An error occurred' });
  }
}
