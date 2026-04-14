import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Youtube, Link as LinkIcon, Loader2, FileText, Clock, AlertCircle, ArrowLeft,
  Copy, Download, Sparkles, Target, Settings2, MessageSquare, BookOpen,
  Search, ChevronLeft, ChevronRight, RotateCcw, Send, X, Play,
  CheckCircle2, FileDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============== Types ==============
type SummaryStyle = 'brief' | 'detailed' | 'bullets' | 'timestamped' | 'question' | 'actionable';
type SummaryLength = 'short' | 'medium' | 'detailed';
type ActiveTab = 'summary' | 'chat' | 'flashcards' | 'transcript';

interface Summary {
  id: string;
  url: string;
  summary: string;
  videoId: string;
  style: string;
  createdAt: number;
  conversationId?: string;
}

interface Flashcard {
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============== Styles Config ==============
const STYLES = [
  { value: 'brief', label: 'Brief', desc: '2-3 sentences' },
  { value: 'bullets', label: 'Bullets', desc: 'Key point list' },
  { value: 'detailed', label: 'Detailed', desc: 'Full coverage' },
  { value: 'timestamped', label: 'Timestamps', desc: 'By moments' },
  { value: 'actionable', label: 'Actionable', desc: 'Takeaways' },
  { value: 'question', label: 'Q&A', desc: 'Q&A format' },
];

const DIFFICULTY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  easy: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  medium: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  hard: { bg: 'rgba(255,59,92,0.1)', border: 'rgba(255,59,92,0.3)', text: '#ff3b5c' },
};

export default function Dashboard() {
  // ============== State ==============
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSummary, setCurrentSummary] = useState<any>(null);
  const [history, setHistory] = useState<Summary[]>([]);
  const [style, setStyle] = useState<SummaryStyle>('bullets');
  const [length, setLength] = useState<SummaryLength>('medium');
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const [copiedState, setCopiedState] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Flashcard state
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [flashcardLoading, setFlashcardLoading] = useState(false);

  // Transcript state
  const [transcript, setTranscript] = useState('');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptWordCount, setTranscriptWordCount] = useState(0);

  // ============== Effects ==============
  useEffect(() => {
    const saved = localStorage.getItem('summify_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ============== Helpers ==============
  const backendBase = (import.meta.env.VITE_BACKEND_URL || window.location.origin) as string;

  const saveHistory = (newHistory: Summary[]) => {
    setHistory(newHistory);
    localStorage.setItem('summify_history', JSON.stringify(newHistory.slice(0, 50)));
  };

  // ============== Summarize ==============
  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setCurrentSummary(null);
    setActiveTab('summary');
    setChatMessages([]);
    setFlashcards([]);
    setTranscript('');

    try {
      const response = await fetch(`${backendBase}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, style, length, language: 'en' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to summarize video');

      setCurrentSummary(data);

      const newSummary: Summary = {
        id: Date.now().toString(),
        url,
        summary: data.summary,
        videoId: data.videoId,
        style: data.style,
        createdAt: Date.now(),
        conversationId: data.conversationId,
      };

      saveHistory([newSummary, ...history]);
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // ============== Analyze ==============
  const handleAnalyze = async () => {
    if (!currentSummary?.videoId) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${backendBase}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://youtube.com/watch?v=${currentSummary.videoId}` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to analyze');
      setCurrentSummary((prev: any) => ({ ...prev, analysis: data }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============== Chat ==============
  const handleChat = async () => {
    if (!chatInput.trim() || !currentSummary?.conversationId) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const response = await fetch(`${backendBase}/api/conversation/${currentSummary.conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chat failed');
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ============== Flashcards ==============
  const handleFlashcards = async () => {
    if (!currentSummary?.videoId) return;
    setFlashcardLoading(true);
    setFlashcardIndex(0);
    setFlashcardFlipped(false);

    try {
      const response = await fetch(`${backendBase}/api/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://youtube.com/watch?v=${currentSummary.videoId}`, count: 8 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate flashcards');
      setFlashcards(data.flashcards || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFlashcardLoading(false);
    }
  };

  // ============== Transcript ==============
  const handleTranscript = async () => {
    if (!currentSummary?.videoId) return;
    setTranscriptLoading(true);

    try {
      const response = await fetch(`${backendBase}/api/transcript/${currentSummary.videoId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch transcript');
      setTranscript(data.transcript || '');
      setTranscriptWordCount(data.wordCount || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTranscriptLoading(false);
    }
  };

  // ============== Copy / Download ==============
  const copyToClipboard = () => {
    if (currentSummary?.summary) {
      navigator.clipboard.writeText(currentSummary.summary);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2000);
    }
  };

  const downloadAsTxt = () => {
    if (currentSummary?.summary) {
      const blob = new Blob([currentSummary.summary], { type: 'text/plain' });
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `summary-${currentSummary.videoId}.txt`;
      a.click();
      URL.revokeObjectURL(u);
    }
  };

  const downloadAsPdf = () => {
    if (!currentSummary?.summary) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>SummifyYT - Summary</title>
      <style>
        body { font-family: 'Segoe UI', Inter, sans-serif; padding: 40px; max-width: 700px; margin: 0 auto; color: #1a1a2e; }
        h1 { font-size: 24px; color: #e11d48; margin-bottom: 4px; }
        .meta { color: #888; font-size: 13px; margin-bottom: 24px; }
        .content { line-height: 1.8; font-size: 15px; white-space: pre-wrap; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #aaa; }
      </style></head><body>
      <h1>📺 SummifyYT Summary</h1>
      <div class="meta">Video ID: ${currentSummary.videoId} · Style: ${currentSummary.style} · ${new Date().toLocaleDateString()}</div>
      <div class="content">${currentSummary.summary}</div>
      <div class="footer">Generated by SummifyYT — AI YouTube Summarizer</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  // ============== Tab handling ==============
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'flashcards' && flashcards.length === 0 && !flashcardLoading) handleFlashcards();
    if (tab === 'transcript' && !transcript && !transcriptLoading) handleTranscript();
  };

  // ============== Highlight transcript ==============
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="highlight-match">{part}</mark> : part
    );
  };

  // ============== Render ==============
  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>
      <div className="mesh-bg" />

      {/* Header */}
      <header
        className="glass-strong"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #ff3b5c, #e11d48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play style={{ width: 16, height: 16, color: 'white', fill: 'white' }} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>SummifyYT</span>
          </Link>
          <Link to="/" className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Input Card */}
            <div className="glass" style={{ borderRadius: '1.5rem', padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Summarize a Video</h2>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="btn-ghost"
                  style={{ padding: 8, borderRadius: 10 }}
                >
                  <Settings2 style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Paste a YouTube URL to get an AI-generated summary.
              </p>

              {/* Settings Panel */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden', marginBottom: '1.25rem' }}
                  >
                    <div className="glass" style={{ borderRadius: '1rem', padding: '1.25rem' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Summary Style
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {STYLES.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => setStyle(s.value as SummaryStyle)}
                              style={{
                                padding: '0.6rem',
                                borderRadius: '0.6rem',
                                border: `1px solid ${style === s.value ? 'var(--accent-red)' : 'var(--glass-border)'}`,
                                background: style === s.value ? 'rgba(255,59,92,0.1)' : 'transparent',
                                color: style === s.value ? 'var(--accent-red)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s',
                              }}
                            >
                              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.label}</div>
                              <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2 }}>{s.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Length
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['short', 'medium', 'detailed'] as const).map((l) => (
                            <button
                              key={l}
                              onClick={() => setLength(l)}
                              style={{
                                flex: 1,
                                padding: '0.6rem',
                                borderRadius: '0.6rem',
                                border: `1px solid ${length === l ? 'var(--accent-red)' : 'var(--glass-border)'}`,
                                background: length === l ? 'rgba(255,59,92,0.1)' : 'transparent',
                                color: length === l ? 'var(--accent-red)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                textTransform: 'capitalize',
                                transition: 'all 0.2s',
                              }}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* URL Input */}
              <form onSubmit={handleSummarize}>
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <LinkIcon style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: 'var(--text-muted)' }} />
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="input-glass"
                    style={{ paddingLeft: 44, paddingRight: 16, height: 56, fontSize: '0.95rem' }}
                    id="url-input"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(255,59,92,0.08)',
                      border: '1px solid rgba(255,59,92,0.2)',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                      color: '#ff6b81',
                    }}
                  >
                    <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    {error}
                  </motion.div>
                )}

                <button type="submit" disabled={loading || !url} className="btn-primary" style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.95rem' }} id="summarize-btn">
                  {loading ? (
                    <><Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} /> Generating...</>
                  ) : (
                    <><Sparkles style={{ width: 20, height: 20 }} /> Generate Summary</>
                  )}
                </button>
              </form>
            </div>

            {/* Results Area */}
            {currentSummary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', padding: 4, borderRadius: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                  {[
                    { key: 'summary', icon: FileText, label: 'Summary' },
                    { key: 'chat', icon: MessageSquare, label: 'Chat' },
                    { key: 'flashcards', icon: BookOpen, label: 'Flashcards' },
                    { key: 'transcript', icon: Search, label: 'Transcript' },
                  ].map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => handleTabChange(key as ActiveTab)}
                      style={{
                        flex: 1,
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.75rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        background: activeTab === key ? 'rgba(255,59,92,0.12)' : 'transparent',
                        color: activeTab === key ? 'var(--accent-red)' : 'var(--text-muted)',
                      }}
                      id={`tab-${key}`}
                    >
                      <Icon style={{ width: 16, height: 16 }} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* ===================== SUMMARY TAB ===================== */}
                {activeTab === 'summary' && (
                  <div className="glass" style={{ borderRadius: '1.5rem', padding: '2rem' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText style={{ width: 20, height: 20, color: '#10b981' }} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Summary</h3>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currentSummary.style} • {currentSummary.transcriptLength?.toLocaleString()} chars</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={copyToClipboard} className="btn-ghost" style={{ padding: 8, borderRadius: 8, position: 'relative' }} title="Copy">
                          {copiedState ? <CheckCircle2 style={{ width: 18, height: 18, color: '#10b981' }} /> : <Copy style={{ width: 18, height: 18 }} />}
                        </button>
                        <button onClick={downloadAsTxt} className="btn-ghost" style={{ padding: 8, borderRadius: 8 }} title="Download TXT">
                          <Download style={{ width: 18, height: 18 }} />
                        </button>
                        <button onClick={downloadAsPdf} className="btn-ghost" style={{ padding: 8, borderRadius: 8 }} title="Download PDF">
                          <FileDown style={{ width: 18, height: 18 }} />
                        </button>
                      </div>
                    </div>

                    {/* Video Embed */}
                    <div style={{ marginBottom: '1.5rem', borderRadius: '1rem', overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${currentSummary.videoId}`}
                        title="Video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    </div>

                    {/* Summary Content */}
                    {currentSummary.style === 'bullets' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {currentSummary.summary.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{ width: 6, height: 6, marginTop: 8, borderRadius: '50%', background: 'var(--accent-red)', flexShrink: 0 }} />
                            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.92rem' }}>{line.replace(/^[•\-\s]+/, '')}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>
                        {currentSummary.summary}
                      </p>
                    )}

                    {/* Analyze Button */}
                    {!currentSummary.analysis && (
                      <button
                        onClick={handleAnalyze}
                        disabled={loading}
                        className="btn-ghost"
                        style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}
                      >
                        <Target style={{ width: 16, height: 16, color: 'var(--accent-purple)' }} />
                        Run Deep Analysis
                      </button>
                    )}

                    {/* Analysis Results */}
                    {currentSummary.analysis && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                          <Target style={{ width: 18, height: 18, color: 'var(--accent-purple)' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Deep Analysis</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            { label: 'Topics', value: currentSummary.analysis.topics?.join(', '), color: '#a855f7', bg: 'rgba(168,85,247,0.08)' },
                            { label: 'Difficulty', value: currentSummary.analysis.difficulty, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
                            { label: 'Audience', value: currentSummary.analysis.audience, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                            { label: 'Sentiment', value: currentSummary.analysis.sentiment, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                          ].map((item, i) => (
                            <div key={i} style={{ padding: '0.875rem', borderRadius: '0.875rem', background: item.bg, border: `1px solid ${item.color}22` }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{item.label}</div>
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Meta Info */}
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Video ID: {currentSummary.videoId}</span>
                      <span>•</span>
                      <span>Model: {currentSummary.model}</span>
                    </div>
                  </div>
                )}

                {/* ===================== CHAT TAB ===================== */}
                {activeTab === 'chat' && (
                  <div className="glass" style={{ borderRadius: '1.5rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MessageSquare style={{ width: 18, height: 18, color: '#a855f7' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Chat with this video</h3>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ask questions about the content</p>
                      </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1rem', paddingRight: 4 }}>
                      {chatMessages.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                          <MessageSquare style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
                          <p style={{ fontSize: '0.85rem' }}>Ask anything about this video</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
                            {['What are the main points?', 'Explain the key concepts', 'What did I miss?'].map((q, i) => (
                              <button
                                key={i}
                                onClick={() => { setChatInput(q); }}
                                className="btn-ghost"
                                style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: 20 }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {chatMessages.map((msg, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}
                          style={{
                            padding: '0.875rem 1rem',
                            maxWidth: '85%',
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                        </motion.div>
                      ))}

                      {chatLoading && (
                        <div className="chat-ai" style={{ padding: '0.875rem 1rem', alignSelf: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%' }} />
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%', animationDelay: '0.2s' }} />
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%', animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                        placeholder="Ask a question..."
                        className="input-glass"
                        style={{ paddingLeft: 16, height: 48 }}
                        id="chat-input"
                      />
                      <button
                        onClick={handleChat}
                        disabled={!chatInput.trim() || chatLoading}
                        className="btn-primary"
                        style={{ padding: '0 18px', borderRadius: '0.75rem', height: 48, flexShrink: 0 }}
                        id="chat-send-btn"
                      >
                        <Send style={{ width: 18, height: 18 }} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ===================== FLASHCARDS TAB ===================== */}
                {activeTab === 'flashcards' && (
                  <div className="glass" style={{ borderRadius: '1.5rem', padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <BookOpen style={{ width: 18, height: 18, color: '#3b82f6' }} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Study Flashcards</h3>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {flashcards.length > 0 ? `${flashcardIndex + 1} of ${flashcards.length}` : 'Generating...'}
                          </p>
                        </div>
                      </div>
                      <button onClick={handleFlashcards} disabled={flashcardLoading} className="btn-ghost" style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RotateCcw style={{ width: 14, height: 14 }} /> Regenerate
                      </button>
                    </div>

                    {flashcardLoading ? (
                      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                        <Loader2 style={{ width: 32, height: 32, margin: '0 auto', color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating flashcards...</p>
                      </div>
                    ) : flashcards.length > 0 ? (
                      <>
                        {/* Flashcard */}
                        <div className="flashcard-container" style={{ marginBottom: '1.5rem' }}>
                          <div
                            className={`flashcard ${flashcardFlipped ? 'flipped' : ''}`}
                            onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="flashcard-face flashcard-front">
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                QUESTION
                              </div>
                              <p style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.6 }}>
                                {flashcards[flashcardIndex]?.question}
                              </p>
                              <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                                <span style={{
                                  ...DIFFICULTY_COLORS[flashcards[flashcardIndex]?.difficulty || 'medium'],
                                  padding: '4px 12px',
                                  borderRadius: 20,
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  textTransform: 'capitalize',
                                  border: `1px solid ${DIFFICULTY_COLORS[flashcards[flashcardIndex]?.difficulty || 'medium'].border}`,
                                  background: DIFFICULTY_COLORS[flashcards[flashcardIndex]?.difficulty || 'medium'].bg,
                                  color: DIFFICULTY_COLORS[flashcards[flashcardIndex]?.difficulty || 'medium'].text,
                                }}>
                                  {flashcards[flashcardIndex]?.difficulty}
                                </span>
                              </div>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 10 }}>Click to reveal answer</p>
                            </div>
                            <div className="flashcard-face flashcard-back">
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                ANSWER
                              </div>
                              <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                                {flashcards[flashcardIndex]?.answer}
                              </p>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: 10 }}>Click to flip back</p>
                            </div>
                          </div>
                        </div>

                        {/* Navigation */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                          <button
                            onClick={() => { setFlashcardFlipped(false); setFlashcardIndex(Math.max(0, flashcardIndex - 1)); }}
                            disabled={flashcardIndex === 0}
                            className="btn-ghost"
                            style={{ padding: 10, borderRadius: 10 }}
                          >
                            <ChevronLeft style={{ width: 20, height: 20 }} />
                          </button>

                          <div style={{ display: 'flex', gap: 6 }}>
                            {flashcards.map((_, i) => (
                              <button
                                key={i}
                                onClick={() => { setFlashcardFlipped(false); setFlashcardIndex(i); }}
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  border: 'none',
                                  cursor: 'pointer',
                                  background: i === flashcardIndex ? 'var(--accent-blue)' : 'rgba(255,255,255,0.15)',
                                  transition: 'all 0.2s',
                                }}
                              />
                            ))}
                          </div>

                          <button
                            onClick={() => { setFlashcardFlipped(false); setFlashcardIndex(Math.min(flashcards.length - 1, flashcardIndex + 1)); }}
                            disabled={flashcardIndex === flashcards.length - 1}
                            className="btn-ghost"
                            style={{ padding: 10, borderRadius: 10 }}
                          >
                            <ChevronRight style={{ width: 20, height: 20 }} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <BookOpen style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ fontSize: '0.85rem' }}>No flashcards generated yet</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===================== TRANSCRIPT TAB ===================== */}
                {activeTab === 'transcript' && (
                  <div className="glass" style={{ borderRadius: '1.5rem', padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText style={{ width: 18, height: 18, color: '#06b6d4' }} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Transcript</h3>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {transcriptWordCount > 0 ? `${transcriptWordCount.toLocaleString()} words` : 'Loading...'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                      <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        placeholder="Search transcript..."
                        className="input-glass"
                        style={{ paddingLeft: 38, height: 42, fontSize: '0.85rem' }}
                        id="transcript-search"
                      />
                      {transcriptSearch && (
                        <button
                          onClick={() => setTranscriptSearch('')}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                          <X style={{ width: 16, height: 16 }} />
                        </button>
                      )}
                    </div>

                    {/* Transcript Content */}
                    {transcriptLoading ? (
                      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <Loader2 style={{ width: 32, height: 32, margin: '0 auto', color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading transcript...</p>
                      </div>
                    ) : transcript ? (
                      <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 8 }}>
                        <p style={{ fontSize: '0.85rem', lineHeight: 2, color: 'var(--text-secondary)' }}>
                          {highlightText(transcript, transcriptSearch)}
                        </p>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <FileText style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ fontSize: '0.85rem' }}>No transcript available</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* ===================== RIGHT SIDEBAR ===================== */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div className="glass" style={{ borderRadius: '1.5rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
                <Clock style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Recent</h3>
              </div>

              <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                {history.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No summaries yet.
                  </p>
                ) : (
                  history.slice(0, 20).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentSummary({ ...item, language: 'en' });
                        setActiveTab('summary');
                        setChatMessages([]);
                        setFlashcards([]);
                        setTranscript('');
                      }}
                      className="glass"
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '1rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                    >
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.url}>
                        {item.url}
                      </p>
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.5,
                      }}>
                        {item.summary}
                      </p>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: 'rgba(255,59,92,0.1)',
                          color: 'var(--accent-red)',
                          textTransform: 'capitalize',
                        }}>
                          {item.style}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Spin keyframe for loaders */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}