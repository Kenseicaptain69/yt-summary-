import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: "../.env" });

// youtube-transcript has a broken "main" vs "type":"module" config,
// so we import the ESM bundle directly via dynamic import
const { YoutubeTranscript } = await import("youtube-transcript/dist/youtube-transcript.esm.js");

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// POST /summarize  — body: { url: "https://youtube.com/watch?v=..." }
app.post("/summarize", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    // 1. Grab transcript
    const items = await YoutubeTranscript.fetchTranscript(url);
    const transcript = items.map((i) => i.text).join(" ");

    if (!transcript) {
      return res.status(400).json({ error: "Could not fetch transcript. The video may not have captions." });
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
    console.error(err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running → http://localhost:${PORT}`));
