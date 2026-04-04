import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

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

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
    }

    if (!process.env.SUPADATA_API_KEY) {
      return res.status(500).json({ error: "SUPADATA_API_KEY is not configured" });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // 1. Fetch transcript via Supadata
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

    // 2. Summarize with Groq (llama-3.3-70b — fast and free)
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes YouTube video transcripts clearly and concisely.",
        },
        {
          role: "user",
          content: `Summarize the following YouTube video transcript in a clear, concise paragraph:\n\n${transcript}`,
        },
      ],
      max_tokens: 512,
      temperature: 0.5,
    });

    const summary = completion.choices[0]?.message?.content || "Could not generate summary.";
    return res.json({ summary });

  } catch (err) {
    console.error("Summarize error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running → http://localhost:${PORT}`));