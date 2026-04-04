import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SummifyYT backend is running" });
});

// Helper: extract video ID from any YouTube URL format
function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?/\s]{11})/);
  return match ? match[1] : null;
}

// POST /summarize — body: { url: "https://youtube.com/watch?v=..." }
app.post("/summarize", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    if (!process.env.SUPADATA_API_KEY) {
      return res.status(500).json({ error: "SUPADATA_API_KEY is not configured" });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // 1. Fetch transcript via Supadata (works from any server IP)
    let transcript = "";
    try {
      const transcriptRes = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
        {
          headers: {
            "x-api-key": process.env.SUPADATA_API_KEY,
          },
        }
      );

      if (transcriptRes.ok) {
        const transcriptData = await transcriptRes.json();
        // Supadata returns { content: "full transcript text" } when text=true
        transcript = transcriptData.content || "";
      } else {
        const errData = await transcriptRes.json();
        console.warn("Supadata error:", errData);
      }
    } catch (transcriptErr) {
      console.warn("Transcript fetch failed:", transcriptErr.message);
    }

    if (!transcript) {
      return res.status(400).json({
        error: "Could not fetch transcript. The video may not have captions enabled.",
      });
    }

    // 2. Summarize with Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Summarize the following YouTube video transcript in a clear, concise paragraph:\n\n${transcript}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const summary = response.text;
    return res.json({ summary });
  } catch (err) {
    console.error("Summarize error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running → http://localhost:${PORT}`));