import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Plus, Trash2, ArrowLeft, Loader2, BookOpen, Mic, Brain, Zap,
  MessageSquare, FileText, Send, X, LinkIcon, AlertCircle, Globe,
  ChevronDown, Lightbulb, ClipboardList,
} from 'lucide-react';
import AudioOverview from '../components/AudioOverview';
import MindMap from '../components/MindMap';
import QuizMode from '../components/QuizMode';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext';

// ============== Types ==============
interface Notebook {
  id: string;
  name: string;
  description: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Concept {
  term: string;
  definition: string;
  category: string;
  importance: string;
}

type ActiveTab = 'guide' | 'audio' | 'chat' | 'mindmap' | 'quiz' | 'concepts' | 'briefing';

const TABS: { key: ActiveTab; icon: any; label: string }[] = [
  { key: 'guide', icon: BookOpen, label: 'Study Guide' },
  { key: 'audio', icon: Mic, label: 'Audio Overview' },
  { key: 'chat', icon: MessageSquare, label: 'Chat' },
  { key: 'mindmap', icon: Brain, label: 'Mind Map' },
  { key: 'quiz', icon: Zap, label: 'Quiz' },
  { key: 'concepts', icon: Lightbulb, label: 'Concepts' },
  { key: 'briefing', icon: ClipboardList, label: 'Briefing' },
];

const IMPORTANCE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  high: { bg: 'rgba(255,59,92,0.1)', border: 'rgba(255,59,92,0.3)', text: '#ff3b5c' },
  medium: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  low: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
};

export default function NotebookView() {
  const { id } = useParams<{ id: string }>();
  const { language, setLanguage, languageCode } = useLanguage();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('guide');
  const [showAddSource, setShowAddSource] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');
  const [showLangPicker, setShowLangPicker] = useState(false);

  // Content states
  const [studyGuide, setStudyGuide] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [audioSegments, setAudioSegments] = useState<any[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [mindMapCode, setMindMapCode] = useState('');
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(false);
  const [briefing, setBriefing] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);

  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvId, setChatConvId] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const backendBase = (import.meta.env.VITE_BACKEND_URL || window.location.origin) as string;

  // Load notebook
  useEffect(() => {
    try {
      const saved = localStorage.getItem('summify_notebooks');
      if (saved) {
        const nbs: Notebook[] = JSON.parse(saved);
        const found = nbs.find(n => n.id === id);
        if (found) setNotebook(found);
      }
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const saveNotebook = (nb: Notebook) => {
    setNotebook(nb);
    try {
      const saved = localStorage.getItem('summify_notebooks');
      const nbs: Notebook[] = saved ? JSON.parse(saved) : [];
      const idx = nbs.findIndex(n => n.id === nb.id);
      if (idx >= 0) nbs[idx] = nb; else nbs.unshift(nb);
      localStorage.setItem('summify_notebooks', JSON.stringify(nbs));
    } catch { /* ignore */ }
  };

  const extractVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return match?.[1] || null;
  };

  const handleAddSource = () => {
    if (!notebook || !newUrl.trim()) return;
    const videoId = extractVideoId(newUrl.trim());
    if (!videoId) { setError('Invalid YouTube URL'); return; }
    if (notebook.videoIds.includes(videoId)) { setError('Video already added'); return; }

    const updated = { ...notebook, videoIds: [...notebook.videoIds, videoId], updatedAt: Date.now() };
    saveNotebook(updated);
    setNewUrl('');
    setShowAddSource(false);
    setError('');
  };

  const handleRemoveSource = (videoId: string) => {
    if (!notebook) return;
    const updated = { ...notebook, videoIds: notebook.videoIds.filter(v => v !== videoId), updatedAt: Date.now() };
    saveNotebook(updated);
  };

  // ============== API Calls ==============
  const fetchStudyGuide = async () => {
    if (!notebook?.videoIds.length) return;
    setGuideLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/study-guide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStudyGuide(data.studyGuide);
    } catch (e: any) { setError(e.message); }
    finally { setGuideLoading(false); }
  };

  const fetchAudioScript = async () => {
    if (!notebook?.videoIds.length) return;
    setAudioLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/audio-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAudioSegments(data.segments || []);
    } catch (e: any) { setError(e.message); }
    finally { setAudioLoading(false); }
  };

  const fetchMindMap = async () => {
    if (!notebook?.videoIds.length) return;
    setMindMapLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/mind-map`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMindMapCode(data.mindMap);
    } catch (e: any) { setError(e.message); }
    finally { setMindMapLoading(false); }
  };

  const fetchQuiz = async (difficulty: string) => {
    if (!notebook?.videoIds.length) return;
    setQuizLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/quiz`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, difficulty, count: 10, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuizQuestions(data.quiz || []);
    } catch (e: any) { setError(e.message); }
    finally { setQuizLoading(false); }
  };

  const fetchConcepts = async () => {
    if (!notebook?.videoIds.length) return;
    setConceptsLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/concepts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConcepts(data.concepts || []);
    } catch (e: any) { setError(e.message); }
    finally { setConceptsLoading(false); }
  };

  const fetchBriefing = async () => {
    if (!notebook?.videoIds.length) return;
    setBriefingLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/briefing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: notebook.videoIds, language: languageCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBriefing(data.briefing);
    } catch (e: any) { setError(e.message); }
    finally { setBriefingLoading(false); }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !notebook?.videoIds.length) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${backendBase}/api/notebook/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoIds: notebook.videoIds, message: msg,
          conversationId: chatConvId || undefined, language: languageCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChatConvId(data.conversationId);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
  };

  // Tab auto-fetch
  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'guide' && !studyGuide && !guideLoading) fetchStudyGuide();
    if (tab === 'concepts' && concepts.length === 0 && !conceptsLoading) fetchConcepts();
  };

  // ============== Render helpers ==============
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h2 key={i} style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{line.replace(/^#+ /, '')}</h2>;
      if (line.startsWith('## ')) return <h3 key={i} style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{line.replace(/^#+ /, '')}</h3>;
      if (line.startsWith('### ')) return <h4 key={i} style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '1rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>{line.replace(/^#+ /, '')}</h4>;
      if (line.match(/^[-•*]\s/)) return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-red)', marginTop: 8, flexShrink: 0 }} />
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.88rem' }}>{line.replace(/^[-•*]\s/, '')}</p>
        </div>
      );
      if (line.match(/^\d+\.\s/)) return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'var(--accent-red)', fontWeight: 700, fontSize: '0.85rem', minWidth: 18 }}>{line.match(/^(\d+)\./)?.[1]}.</span>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.88rem' }}>{line.replace(/^\d+\.\s/, '')}</p>
        </div>
      );
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{line.replace(/\*\*/g, '')}</p>;
      if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
      return <p key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.88rem', marginBottom: 4 }}>{line}</p>;
    });
  };

  if (!notebook) {
    return (
      <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="mesh-bg" />
        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Notebook not found</p>
          <Link to="/notebooks" className="btn-primary" style={{ padding: '0.75rem 2rem' }}>Back to Notebooks</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>
      <div className="mesh-bg" />

      {/* Header */}
      <nav className="glass-strong" style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/notebooks" className="btn-ghost" style={{ padding: 8, borderRadius: 8 }}>
              <ArrowLeft style={{ width: 18, height: 18 }} />
            </Link>
            <div>
              <h1 style={{ fontSize: '1rem', fontWeight: 700 }}>{notebook.name}</h1>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {notebook.videoIds.length} source{notebook.videoIds.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Language picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowLangPicker(!showLangPicker)} className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
              <Globe style={{ width: 16, height: 16 }} />
              {language.flag} {language.name}
              <ChevronDown style={{ width: 14, height: 14 }} />
            </button>
            <AnimatePresence>
              {showLangPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="glass-strong"
                  style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 4,
                    borderRadius: '0.75rem', padding: '0.5rem', width: 220, maxHeight: 320,
                    overflowY: 'auto', zIndex: 60,
                  }}
                >
                  {LANGUAGES.map(lang => (
                    <button key={lang.code} onClick={() => { setLanguage(lang); setShowLangPicker(false); }}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem',
                        background: languageCode === lang.code ? 'rgba(255,59,92,0.1)' : 'transparent',
                        color: languageCode === lang.code ? 'var(--accent-red)' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: '1.1rem' }}>{lang.flag}</span>
                      {lang.name}
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lang.nativeName}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* ===== LEFT: Sources Panel ===== */}
          <div className="glass" style={{ borderRadius: '1.25rem', padding: '1.25rem', position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Sources</h3>
              <button onClick={() => setShowAddSource(true)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus style={{ width: 14, height: 14 }} /> Add
              </button>
            </div>

            {/* Add source input */}
            <AnimatePresence>
              {showAddSource && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <LinkIcon style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)}
                        placeholder="YouTube URL..." className="input-glass"
                        style={{ paddingLeft: 28, height: 36, fontSize: '0.75rem' }}
                        onKeyDown={e => e.key === 'Enter' && handleAddSource()} />
                    </div>
                    <button onClick={handleAddSource} className="btn-primary" style={{ padding: '0 12px', height: 36, fontSize: '0.7rem', borderRadius: '0.5rem' }}>
                      Add
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Source list */}
            {notebook.videoIds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0.5rem' }}>
                <Play style={{ width: 28, height: 28, color: 'var(--text-muted)', margin: '0 auto 10px', opacity: 0.4 }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Add YouTube videos to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notebook.videoIds.map(vid => (
                  <div key={vid} style={{
                    borderRadius: '0.75rem', overflow: 'hidden',
                    border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)',
                  }}>
                    <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
                      alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    <div style={{ padding: '0.5rem 0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{vid}</span>
                      <button onClick={() => handleRemoveSource(vid)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        color: 'var(--text-muted)', transition: 'color 0.2s',
                      }}>
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===== RIGHT: Main Content ===== */}
          <div>
            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.2)',
                  borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', color: '#ff6b81',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle style={{ width: 16, height: 16 }} /> {error}
                </div>
                <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b81' }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </motion.div>
            )}

            {/* Tabs */}
            <div style={{
              display: 'flex', gap: 2, marginBottom: '1rem', padding: 4, borderRadius: '1rem',
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
              overflowX: 'auto',
            }}>
              {TABS.map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => handleTabChange(key)}
                  style={{
                    padding: '0.55rem 0.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600,
                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                    background: activeTab === key ? 'rgba(255,59,92,0.12)' : 'transparent',
                    color: activeTab === key ? 'var(--accent-red)' : 'var(--text-muted)',
                  }}>
                  <Icon style={{ width: 15, height: 15 }} /> {label}
                </button>
              ))}
            </div>

            {/* No sources warning */}
            {notebook.videoIds.length === 0 ? (
              <div className="glass" style={{ borderRadius: '1.25rem', padding: '3rem', textAlign: 'center' }}>
                <Play style={{ width: 40, height: 40, margin: '0 auto 1rem', color: 'var(--text-muted)', opacity: 0.4 }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Add sources to get started</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Add YouTube videos to your notebook, then use the tools above to learn from them.</p>
              </div>
            ) : (
              <div className="glass" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>

                {/* ===== STUDY GUIDE TAB ===== */}
                {activeTab === 'guide' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <BookOpen style={{ width: 18, height: 18, color: '#10b981' }} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Study Guide</h3>
                      </div>
                      <button onClick={fetchStudyGuide} disabled={guideLoading} className="btn-ghost"
                        style={{ padding: '4px 12px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {guideLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '🔄'} Generate
                      </button>
                    </div>
                    {guideLoading ? (
                      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <Loader2 style={{ width: 32, height: 32, color: '#10b981', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating study guide...</p>
                      </div>
                    ) : studyGuide ? (
                      <div>{renderMarkdown(studyGuide)}</div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <BookOpen style={{ width: 32, height: 32, margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.4 }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click "Generate" to create a study guide from your sources.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== AUDIO TAB ===== */}
                {activeTab === 'audio' && (
                  <AudioOverview segments={audioSegments} loading={audioLoading} onGenerate={fetchAudioScript} />
                )}

                {/* ===== CHAT TAB ===== */}
                {activeTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MessageSquare style={{ width: 18, height: 18, color: '#a855f7' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Chat with Sources</h3>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ask questions across all {notebook.videoIds.length} videos</p>
                      </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1rem', paddingRight: 4 }}>
                      {chatMessages.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                          <MessageSquare style={{ width: 32, height: 32, margin: '0 auto 12px', opacity: 0.3 }} />
                          <p style={{ fontSize: '0.85rem' }}>Ask anything about your videos</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
                            {['What are the main themes?', 'Compare the key ideas', 'Give me a summary'].map((q, i) => (
                              <button key={i} onClick={() => setChatInput(q)} className="btn-ghost"
                                style={{ fontSize: '0.72rem', padding: '5px 12px', borderRadius: 16 }}>
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {chatMessages.map((msg, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}
                          style={{ padding: '0.75rem 1rem', maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                          <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                        </motion.div>
                      ))}

                      {chatLoading && (
                        <div className="chat-ai" style={{ padding: '0.75rem 1rem', alignSelf: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%' }} />
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%', animationDelay: '0.2s' }} />
                            <span className="shimmer" style={{ width: 8, height: 8, borderRadius: '50%', animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleChat()}
                        placeholder="Ask a question..." className="input-glass"
                        style={{ paddingLeft: 16, height: 48 }} />
                      <button onClick={handleChat} disabled={!chatInput.trim() || chatLoading} className="btn-primary"
                        style={{ padding: '0 18px', borderRadius: '0.75rem', height: 48, flexShrink: 0 }}>
                        <Send style={{ width: 18, height: 18 }} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== MIND MAP TAB ===== */}
                {activeTab === 'mindmap' && (
                  <MindMap mermaidCode={mindMapCode} loading={mindMapLoading} onGenerate={fetchMindMap} />
                )}

                {/* ===== QUIZ TAB ===== */}
                {activeTab === 'quiz' && (
                  <QuizMode questions={quizQuestions} loading={quizLoading} onGenerate={fetchQuiz} />
                )}

                {/* ===== CONCEPTS TAB ===== */}
                {activeTab === 'concepts' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Lightbulb style={{ width: 18, height: 18, color: '#f59e0b' }} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Key Concepts</h3>
                      </div>
                      <button onClick={fetchConcepts} disabled={conceptsLoading} className="btn-ghost"
                        style={{ padding: '4px 12px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {conceptsLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '🔄'} Refresh
                      </button>
                    </div>
                    {conceptsLoading ? (
                      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <Loader2 style={{ width: 32, height: 32, color: '#f59e0b', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Extracting concepts...</p>
                      </div>
                    ) : concepts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {concepts.map((c, i) => {
                          const colors = IMPORTANCE_COLORS[c.importance] || IMPORTANCE_COLORS.medium;
                          return (
                            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                              style={{
                                padding: '1rem', borderRadius: '0.875rem',
                                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
                              }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, flex: 1 }}>{c.term}</h4>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 12, fontSize: '0.6rem', fontWeight: 600,
                                  textTransform: 'uppercase' as const, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
                                }}>{c.importance}</span>
                                {c.category && (
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 12, fontSize: '0.6rem', fontWeight: 600,
                                    background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.2)',
                                  }}>{c.category}</span>
                                )}
                              </div>
                              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.definition}</p>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <Lightbulb style={{ width: 32, height: 32, margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.4 }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Key concepts will appear here.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== BRIEFING TAB ===== */}
                {activeTab === 'briefing' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ClipboardList style={{ width: 18, height: 18, color: '#06b6d4' }} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Briefing Document</h3>
                      </div>
                      <button onClick={fetchBriefing} disabled={briefingLoading} className="btn-ghost"
                        style={{ padding: '4px 12px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {briefingLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '🔄'} Generate
                      </button>
                    </div>
                    {briefingLoading ? (
                      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <Loader2 style={{ width: 32, height: 32, color: '#06b6d4', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating briefing...</p>
                      </div>
                    ) : briefing ? (
                      <div>{renderMarkdown(briefing)}</div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                        <ClipboardList style={{ width: 32, height: 32, margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.4 }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click "Generate" to create a briefing document.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
