import type { VercelRequest, VercelResponse } from '@vercel/node';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    // Extract video ID
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch?.[1] || url.trim();
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    let summary = '';
    let transcript = '';

    // === APPROACH 1: Gemini direct YouTube video summarization ===
    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];

      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Summarize this YouTube video in a clear, concise paragraph. Only return the summary, nothing else.' },
                  { fileData: { fileUri: canonicalUrl, mimeType: 'video/mp4' } }
                ]
              }
            ]
          });
          summary = response.text || '';
          if (summary) break;
        } catch (err: any) {
          console.warn(`Gemini direct (${model}): ${err.message?.substring(0, 100)}`);
        }
      }

      // === APPROACH 2: Transcript + Gemini text ===
      if (!summary) {
        try {
          const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');
          try {
            const items = await YoutubeTranscript.fetchTranscript(videoId);
            transcript = items.map((t: any) => t.text).join(' ');
          } catch {
            const items = await YoutubeTranscript.fetchTranscript(url);
            transcript = items.map((t: any) => t.text).join(' ');
          }
        } catch {
          console.warn('transcript fetch failed');
        }

        if (transcript) {
          const prompt = `Summarize the following YouTube video transcript in a clear, concise paragraph:\n\n${transcript}`;
          for (const model of models) {
            try {
              const response = await ai.models.generateContent({ model, contents: prompt });
              summary = response.text || '';
              if (summary) break;
            } catch {}
          }
        }
      }
    }

    // === APPROACH 3: Transcript + local extractive ===
    if (!summary) {
      if (!transcript) {
        try {
          const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');
          const items = await YoutubeTranscript.fetchTranscript(videoId);
          transcript = items.map((t: any) => t.text).join(' ');
        } catch {}
      }
      if (transcript) {
        summary = extractiveSummarize(transcript);
      }
    }

    if (!summary) {
      return res.status(400).json({ error: 'Could not summarize this video. Please check the URL and try again later.' });
    }

    return res.status(200).json({ transcript: transcript || '(processed directly by AI)', summary });
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message || 'An error occurred' });
  }
}
