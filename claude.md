# SummifyYT Backend

## Stack
- Express + Node.js (ESM)
- Groq SDK (llama-3.3-70b-versatile)
- Supadata for transcripts
- .env has GROQ_API_KEY and SUPADATA_API_KEY

## Rules
- Never change the Groq model
- Always use ESM imports (not require)
- Keep all routes in server.js for now
- Transcript cache is a Map keyed by videoId