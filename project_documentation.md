# SummifyYT - YouTube Summarizer
## Detailed Project Documentation

---

## Table of Contents

| Sr. No. | Section | Page |
|---------|---------|------|
| 1 | Abstract | 2 |
| 2 | Introduction | 4 |
| 3 | Features | 5 |
| 4 | Resources Used | 6 |
| 5 | Algorithm and Flowchart | 7-8 |
| 6 | Output | 9-11 |
| 7 | Conclusion | 12 |

---

## 1. Abstract

**SummifyYT** is a modern, full-stack web application that solves one of the biggest challenges of the digital age - the overwhelming volume of long-form video content available on YouTube. The platform allows any user to paste a YouTube video URL and receive a clean, concise, AI-generated written summary within seconds, eliminating the need to watch the entire video.

The system is built on a powerful dual-layer architecture. On the frontend, a **React 19** single-page application (SPA) - built with **Vite** and styled with **Tailwind CSS v4** - provides users with a minimalist, responsive, and animated interface. On the backend, an **Express.js** server (and a **Vercel Serverless Function** for production deployment) handles all transcript extraction and summarization logic.

The core intelligence of the application is powered by **Google Gemini AI** (models: gemini-2.0-flash-lite, gemini-1.5-flash, and gemini-2.0-flash). The application first attempts to summarize the video directly via the Gemini fileData API. If unavailable, it falls back to fetching the video transcript through multiple providers - the **Supadata API** and the **youtube-transcript** npm package - and passes it to Gemini for abstractive summarization.

A critical engineering achievement of this project is its **three-tier resilience model**. Should all external AI and transcript services be unavailable due to rate limits, network failures, or API key issues, the application automatically invokes a custom-built, local **extractive summarization algorithm** based on **Term Frequency (TF)** scoring. This guarantees the user always receives a meaningful output.

The application is deployed as a **serverless function on Vercel**, making it globally available, scalable, and cost-effective with zero server management overhead.

---

## 2. Introduction

### Background

The modern internet is dominated by video content. YouTube alone processes over 500 hours of new video every single minute. While this represents an incredible wealth of knowledge, tutorials, lectures, and entertainment, it comes with an inherent cost: **time**. Users are forced into a linear, time-consuming format to extract information. Watching a 45-minute lecture to find one key concept, or sitting through a 30-minute product review to make a purchasing decision, is deeply inefficient.

Existing solutions like reading comments, skimming auto-generated captions, or hoping the creator wrote a description are unreliable and incomplete. There was a clear need for a reliable, fast, and intelligent tool that could convert video content into readable text summaries on demand.

### Problem Statement

How can we allow a user to instantly understand the core content of any YouTube video, without watching it?

This project directly answers that question. SummifyYT bridges the gap between the video format and the written format - fetching the video closed-caption transcript and using state-of-the-art Large Language Models (LLMs) to synthesize that text into a coherent, concise paragraph.

### Project Scope

This project covers:
- A fully functional client-side React web application (Landing Page + Dashboard)
- A Node.js/Express backend API with rate limiting and CORS
- A Vercel-deployed serverless function (/api/summarize) for production
- Integration with Google Gemini AI for abstractive NLP summarization
- A custom-coded local extractive summarizer as a fallback
- Browser-based local-storage history for previously summarized videos

### Project Goal

To deliver a production-ready, publicly accessible web application that transforms YouTube video content into readable summaries in under 10 seconds, with a reliability guarantee through a multi-tier fallback mechanism.

---

## 3. Features

### 3.1 Core Functionality

| Feature | Description |
|---------|-------------|
| YouTube URL Input | Accepts any standard YouTube URL format: youtube.com/watch?v=, youtu.be/, embedded URLs, and playlist video links. |
| AI-Powered Abstractive Summary | Uses Google Gemini models to produce natural-language, human-quality paragraphs - not just copied sentences. |
| Full Transcript Extraction | Retrieves the raw closed-caption transcript of the video, available alongside the AI summary for transparency. |

### 3.2 Reliability and Resilience

| Feature | Description |
|---------|-------------|
| Three-Tier Fallback System | Approach 1: Direct Gemini Video API; Approach 2: Transcript + Gemini Text API; Approach 3: Transcript + Local Extractive Summarizer. |
| Multi-Provider Transcript Fetching | Transcript is sourced from Supadata API first, then youtube-transcript npm package as a backup. |
| Graceful Error Handling | All API failures are caught and gracefully degraded; users see a friendly error message only if all three approaches fail. |

### 3.3 User Experience

| Feature | Description |
|---------|-------------|
| Animated Landing Page | A hero section with smooth Framer Motion entrance animations, feature cards, and a compelling call-to-action. |
| Responsive Dashboard UI | A two-column layout with the URL input + result panel on the left, and a sidebar history panel on the right. Collapses to single-column on mobile. |
| Local Summary History | All generated summaries are saved to localStorage and displayed in a sidebar panel. No account required. |
| Animated Loading State | A spinning Lucide Loader2 icon with the text "Summarizing..." provides real-time feedback during processing. |
| Inline Error Display | Form-level error messages are shown in a styled red alert box directly within the form. |

### 3.4 Security and Performance

| Feature | Description |
|---------|-------------|
| IP-Based Rate Limiting | The /api/ route is protected by a custom in-memory rate limiter (10 requests per IP per 60 seconds), preventing API abuse. |
| CORS Protection | Cross-Origin Resource Sharing headers are configured on the backend and the Vercel serverless function. |
| Environment Variable Security | API keys (GEMINI_API_KEY, SUPADATA_API_KEY) are stored in .env files and never exposed to the client. |
| Vite HMR in Dev | In development, Vite middleware is embedded directly into the Express server for instant hot-module replacement. |
| Static Asset Serving in Prod | In production, the server serves the pre-built Vite dist/ folder, optimizing bundle sizes with tree-shaking. |

---

## 4. Resources Used

### 4.1 Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^19.0.0 | Core UI library for building component-based, reactive interfaces. |
| React DOM | ^19.0.0 | DOM rendering layer for React. |
| React Router DOM | ^7.13.2 | Client-side routing between the Landing Page (/) and Dashboard (/app). |
| Vite | ^6.2.0 | Lightning-fast frontend build tool with native ESM support and HMR. |
| Tailwind CSS | ^4.1.14 | Utility-first CSS framework for building the responsive, styled UI. |
| @tailwindcss/vite | ^4.1.14 | Vite plugin for Tailwind CSS v4 integration. |
| Framer Motion | ^12.38.0 | Animation library providing entrance, scroll, and interactive motion effects. |
| Lucide React | ^0.546.0 | SVG icon set (Youtube, Loader2, FileText, Clock, etc.). |
| clsx | ^2.1.1 | Utility for conditionally constructing class names. |
| tailwind-merge | ^3.5.0 | Intelligently merges Tailwind class names without conflicts. |

### 4.2 Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | (runtime) | JavaScript runtime for the server-side application. |
| Express | ^4.22.1 | HTTP server framework handling API routes, middleware, rate limiting, and CORS. |
| TypeScript | ~5.8.2 | Statically-typed superset of JavaScript for safer, more maintainable code. |
| tsx | ^4.21.0 | TypeScript executor for running server.ts directly in development. |
| dotenv | ^17.2.3 | Loads environment variables from .env file into process.env. |
| cors | ^2.8.6 | CORS middleware for the Express server. |
| esbuild | ^0.24.0 | Ultra-fast JavaScript bundler for the production server build. |

### 4.3 AI and Data Services

| Service / Package | Version | Purpose |
|-------------------|---------|---------|
| @google/genai | ^1.29.0 | Official Google Generative AI SDK for interfacing with Gemini models. |
| Gemini 2.0 Flash Lite | API | Fastest, most cost-efficient Gemini model; tried first. |
| Gemini 1.5 Flash | API | Mid-tier Gemini model; fallback if 2.0 Flash Lite fails. |
| Gemini 2.0 Flash | API | Most capable of the three; last attempt in the AI chain. |
| Supadata API | External | Third-party REST API for reliably fetching YouTube transcripts by video ID. |
| youtubei.js | ^17.0.1 | Reverse-engineered YouTube Innertube API client for video metadata and transcript scraping. |
| youtube-transcript | npm | NPM library for fetching YouTube closed-caption transcripts. |
| @huggingface/inference | ^4.13.15 | Hugging Face Inference API included for future AI model integration. |

### 4.4 Deployment and Infrastructure

| Platform / Tool | Purpose |
|-----------------|---------|
| Vercel | Serverless deployment platform hosting both the static frontend and /api/summarize serverless function. |
| vercel.json | Configuration file mapping the /api/summarize route to the serverless function handler. |
| Firebase | Included as a dependency; project configuration present for future backend persistence. |
| GitHub | Version control and source code management. |

### 4.5 Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript Compiler | Static type checking across the entire codebase. |
| .env / .env.example | Environment variable management; .env.example documents all required keys for contributors. |
| .gitignore | Prevents sensitive files (.env, node_modules, dist) from being committed. |

---

## 5. Algorithm and Flowchart

### 5.1 Step-by-Step Algorithm

The summarization pipeline follows a strict, prioritized sequence of attempts. Each step executes only when all preceding steps have failed.

**Step 1 - Input and Validation**
- User submits a YouTube video URL string via the web form.
- The frontend performs basic validation (non-empty field, URL format check).
- The URL is sent via HTTP POST to /api/summarize with body { url: string }.

**Step 2 - Video ID Extraction (Sanitization)**
- The backend receives the URL.
- A regular expression extracts the precise 11-character YouTube Video ID.
- A canonical URL is constructed: https://www.youtube.com/watch?v={videoId}
- This sanitization eliminates tracking parameters, timestamps, and playlist context.

**Step 3 - Primary Summarization: Direct Gemini Video API (Approach 1)**
- Condition: GEMINI_API_KEY is present in the environment.
- Gemini is called with the canonical YouTube URL as a fileData part alongside the instruction: "Summarize this YouTube video in a clear, concise paragraph."
- Three Gemini models are tried in sequence: gemini-2.0-flash-lite, gemini-1.5-flash, gemini-2.0-flash.
- If any model returns a non-empty response, the summary is captured and the pipeline exits.
- If all three fail, proceed to Approach 2.

**Step 4 - Transcript Acquisition**
- Sub-step 4a: Supadata API - HTTP GET to https://api.supadata.ai/v1/youtube/transcript with the SUPADATA_API_KEY header. Text objects are joined into a single string.
- Sub-step 4b: youtube-transcript npm - If Supadata fails, YoutubeTranscript.fetchTranscript(videoId) is called and timed text objects are mapped and joined into a plain string.
- Sub-step 4c: youtubei.js - A tertiary attempt using Innertube.create() to fetch video metadata.

**Step 5 - Secondary Summarization: Transcript + Gemini Text (Approach 2)**
- Condition: A transcript string was obtained AND GEMINI_API_KEY is present.
- The transcript is embedded into a prompt: "Summarize the following YouTube video transcript in a clear, concise paragraph: {transcript}"
- The same three Gemini models are tried in sequence.
- If a non-empty summary is returned, the pipeline exits successfully.

**Step 6 - Tertiary Summarization: Local Extractive Algorithm (Approach 3)**
- Condition: All AI-based approaches have failed; transcript text is available.
- The custom extractiveSummarize(text, maxSentences=5) function is invoked:
  a. Sentence Segmentation: The transcript is split into sentences using a lookbehind regex. Sentences shorter than 20 characters are discarded.
  b. Stop-Word Removal: A hardcoded set of ~80 English stop words is used to filter out non-informative words.
  c. Term Frequency (TF) Scoring: The frequency of every remaining content word is counted into a wordFreq dictionary.
  d. Sentence Scoring: Each sentence receives a score equal to the average TF value of its non-stop words:
     score(sentence) = Sum of wordFreq[word] / numWords(sentence)
  e. Top-K Selection: Sentences are sorted in descending order of score. The top 5 are selected.
  f. Chronological Reconstruction: The top 5 sentences are re-sorted to their original document order by index.
  g. Output: The ordered sentences are joined with a space and returned as the summary.

**Step 7 - Response and Error**
- If a summary was generated by any approach, the API returns HTTP 200 OK with the summary, transcript, and timestamp.
- If no approach produced a summary, the API returns HTTP 400 Bad Request with an error message.

### 5.2 Logical Flowchart

The flowchart below describes the complete summarization decision logic:

Start
-> User submits YouTube URL via Web Form
-> POST to /api/summarize
-> Extract 11-char Video ID via Regex
-> Build Canonical YouTube URL
-> [Decision] GEMINI_API_KEY present?
   YES -> Approach 1: Gemini fileData API with YouTube URL
          -> [Decision] Gemini returns valid summary?
             YES -> Return 200 OK (Summary delivered)
             NO  -> Fetch Transcript via Supadata API
   NO  -> Fetch Transcript via Supadata API
-> [Decision] Transcript obtained from Supadata?
   YES -> Jump to AI summarization
   NO  -> Fallback: youtube-transcript npm
-> [Decision] Transcript obtained from npm?
   YES -> Jump to AI summarization
   NO  -> Fallback: youtubei.js Innertube
-> [Decision] Transcript obtained from youtubei.js?
   YES -> Jump to AI summarization
   NO  -> Return 400 Error to Frontend (END)
-> [Decision] GEMINI_API_KEY present?
   YES -> Approach 2: Feed Transcript to Gemini Text API
          -> [Decision] Gemini returns valid summary?
             YES -> Return 200 OK (Summary delivered)
             NO  -> Approach 3: Local Extractive Summarizer
   NO  -> Approach 3: Local Extractive Summarizer
-> Split into sentences, remove stop-words
-> Count TF word frequencies across transcript
-> Score and rank sentences by average TF score
-> Select top 5, restore chronological order
-> Return 200 OK with summary and transcript
-> Frontend displays Summary Card

---

## 6. Output

### 6.1 Output View - Landing Page (Route: /)

When a user first visits the application, they are presented with the Landing Page. The page uses a clean zinc-50 (near-white) background with sharp zinc-900 dark text, creating a modern, high-contrast aesthetic.

Key UI Components:
- Navigation Bar: Sticky top bar with the SummifyYT brand logo (red YouTube icon + bold text) and an "Open App" pill button routing to /app.
- Hero Section: A large centered heading "Turn hours of video into minutes of reading." with the second phrase highlighted in YouTube red. A subtitle describes the product, followed by a prominent "Start Summarizing" CTA button in red.
- Entrance Animation: All hero content animates in with a smooth opacity (0 to 1) and y-offset (20px to 0) Framer Motion transition on page load.
- Feature Cards Section: Three cards in a 3-column grid:
  - Any YouTube Video: Works with any public video with closed captions.
  - Lightning Fast: AI-powered summaries delivered in seconds.
  - Clean Summaries: Well-structured, concise prose.
  - Cards animate in with staggered whileInView scroll-triggered transitions.

### 6.2 Output View - Dashboard / App Page (Route: /app)

The Dashboard is the core functional page, accessed after clicking "Open App" or the CTA.

Responsive Layout:
- Desktop: Two-column grid (2/3 width for main content, 1/3 width for history sidebar).
- Mobile: Single-column, stacked layout.

Key UI Components:

a) Sticky Header
- Brand logo on the left.
- Back to Home link on the right.

b) URL Input Section (Main Column)
- A white, pill-rounded card with title "Summarize a Video" and a subtitle.
- A URL input field with a link icon prefix and red focus ring.
- "Generate Summary" button with dark background. While loading, shows spinner + "Summarizing..." text.
- A red-background inline error alert box appears beneath the input if the API returns a failure.

c) Summary Result Card (Main Column)
- Appears below the input with a Framer Motion fade-up animation after a successful API response.
- Green icon header labelled "Summary".
- The full AI summary paragraph in clean, readable prose with relaxed line height.

d) History Sidebar (Right Column)
- Sticky white card titled "Recent Summaries" with a Clock icon header.
- Scrollable list of previously summarized URLs with a 3-line preview excerpt.
- Clicking any past summary immediately re-displays it without making another API call.
- All data persists in localStorage (key: summify_history) across browser sessions.

### 6.3 Output View - Generated Summary Result

The primary value delivered to the user is the AI-generated summary.

API Response Payload:
- summary: AI-generated (abstractive or extractive) paragraph - the main user-facing output.
- transcript: Raw joined transcript text from closed captions.
- timestamp: ISO 8601 datetime of when the summary was generated.

User-Visible Output:
- The summary text is rendered in a white, rounded card with relaxed line height for maximum readability.
- The URL and its summary are automatically saved to the localStorage history panel after successful generation.

Example Interaction Flow:
1. User pastes a YouTube URL into the input field.
2. Clicks "Generate Summary".
3. Button switches to spinner + "Summarizing...".
4. API call is made; Gemini processes the transcript.
5. 3-8 seconds later, a new card fades in with the summary paragraph.
6. The URL and summary are automatically saved to the history sidebar.

Example Summary Output (Illustrative):
"This video explains the core concepts of machine learning, beginning with the definition of supervised learning and the role of labeled training data. The presenter walks through gradient descent, describing how loss functions quantify prediction error and how backpropagation propagates gradients to update model weights. Key ideas covered include the bias-variance tradeoff, overfitting prevention through validation sets, and the practical differences between batch, mini-batch, and stochastic gradient descent."

---

## 7. Conclusion

### 7.1 Summary of Achievement

The SummifyYT project successfully delivers a polished, production-grade web application that converts YouTube video content into concise, readable summaries. The system is deployed globally on Vercel, requiring no login, no account creation, and no configuration from the end user - making it immediately accessible to anyone with a YouTube URL.

### 7.2 Notable Technical Achievements

- Fault-Tolerant Architecture: The three-tier resilience model (Direct Gemini -> Transcript + Gemini -> Local Extractive) ensures the user always receives output even when external APIs fail.
- Custom NLP Algorithm: A TF-based extractive summarizer built entirely from scratch, without any external NLP library, demonstrates applied understanding of Natural Language Processing.
- Full-Stack TypeScript: All layers (React frontend, Express backend, Vercel serverless function) are written in TypeScript, yielding type-safe, maintainable, and scalable code.
- Zero-Login, Privacy-First Design: No authentication required; all history is stored locally in the user's browser.
- Dual Deployment Model: The same codebase supports both a monolithic Express dev server with embedded Vite middleware and a Vercel serverless function for production.

### 7.3 Limitations

| Limitation | Description |
|------------|-------------|
| Transcript dependency | Videos with disabled or unavailable captions may fail if the Gemini direct-video approach also does not support them. |
| Gemini rate limits | Free-tier Gemini API keys have strict request quotas; heavy usage may trigger the extractive fallback. |
| Language support | The extractive fallback stop-word list is English-only; non-English videos may get lower-quality summaries. |
| History persistence | localStorage is device- and browser-specific; history does not sync across devices or browsers. |

### 7.4 Future Enhancements

| Enhancement | Description |
|-------------|-------------|
| Multi-language summaries | Translate output into the user's chosen language using Gemini's multilingual capabilities. |
| Summary length control | A user-facing slider for short, medium, or detailed summary length. |
| Chapter-based summarization | Generate separate summaries for each timestamped chapter in long videos. |
| Cloud sync via Firebase | Persist and sync summary history across devices using Firestore for authenticated users. |
| Browser extension | A Chrome/Firefox extension adding a Summarize button directly on YouTube video pages. |
| Export to PDF or Markdown | Allow users to download generated summaries as formatted documents. |
| Playlist batch processing | Accept a YouTube playlist URL and summarize all videos within it sequentially. |

---

Documentation prepared for the SummifyYT YouTube Summarizer project.
Stack: React 19, Vite, Tailwind CSS v4, Framer Motion, Node.js, Express, Google Gemini AI, Vercel
