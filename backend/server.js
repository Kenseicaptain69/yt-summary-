import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// In local dev, load from ../.env; on Render, env vars are injected by the platform
dotenv.config(); // or just remove it entirely — Render injects vars automatically

// youtube-transcript has a broken "main" vs "type":"module" config,
// so we import the ESM bundle directly via dynamic import
const { YoutubeTranscript } = await import("youtube-transcript/dist/youtube-transcript.esm.js");

const app = express();

// Allow requests from any origin (required for Vercel frontend → Render backend)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

// Health check endpoint — Render pings this to keep the service warm
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SummifyYT backend is running" });
});

// POST /summarize  — body: { url: "https://youtube.com/watch?v=..." }
app.post("/summarize", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 1. Grab transcript
    let transcript = "";
    try {
      const items = await YoutubeTranscript.fetchTranscript(url);
      transcript = items.map((i) => i.text).join(" ");
    } catch (transcriptErr) {
      console.warn("Transcript fetch failed:", transcriptErr.message);
    }

    if (!transcript) {
      return res.status(400).json({
        error: "Could not fetch transcript. The video may not have captions enabled.",
      });
    }

    // 2. Summarize with Gemini
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
