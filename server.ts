import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

let hf: HfInference | null = null;
function getHf() {
  if (!hf) {
    hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');
  }
  return hf;
}

// API Routes
app.post('/api/summarize', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // 1. Get Transcript
    let transcriptText = '';
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      transcriptText = transcript.map(t => t.text).join(' ');
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return res.status(400).json({ error: 'Could not fetch transcript for this video. It might not have closed captions.' });
    }

    if (!transcriptText) {
      return res.status(400).json({ error: 'Transcript is empty.' });
    }

    // 2. Summarize using Hugging Face
    const maxInputLength = 1024 * 4; 
    const textToSummarize = transcriptText.substring(0, maxInputLength);

    if (!process.env.HUGGINGFACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key is not configured.' });
    }

    const hfClient = getHf();
    const summaryResponse = await hfClient.summarization({
      model: 'facebook/bart-large-cnn',
      inputs: textToSummarize,
      parameters: {
        max_length: 250,
        min_length: 50,
      }
    });

    res.json({
      transcript: transcriptText,
      summary: summaryResponse.summary_text
    });

  } catch (error: any) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: error.message || 'An error occurred during summarization' });
  }
});

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
