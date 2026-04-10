import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Youtube, Link as LinkIcon, Loader2, FileText, Clock, AlertCircle, ArrowLeft, Copy, Download, File, Sparkles, Target, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

type SummaryStyle = 'brief' | 'detailed' | 'bullets' | 'timestamped' | 'question' | 'actionable';
type SummaryLength = 'short' | 'medium' | 'detailed';

interface Summary {
  id: string;
  url: string;
  summary: string;
  videoId: string;
  style: string;
  createdAt: number;
  topics?: string[];
  title?: string;
}

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSummary, setCurrentSummary] = useState<any>(null);
  const [history, setHistory] = useState<Summary[]>([]);
  const [style, setStyle] = useState<SummaryStyle>('bullets');
  const [length, setLength] = useState<SummaryLength>('medium');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('summify_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history');
      }
    }
  }, []);

  const saveHistory = (newHistory: Summary[]) => {
    setHistory(newHistory);
    localStorage.setItem('summify_history', JSON.stringify(newHistory));
  };

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setCurrentSummary(null);

    try {
      const backendBase = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const apiUrl = `${backendBase}/api/summarize`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, style, language: 'en' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to summarize video');
      }

      setCurrentSummary(data);

      const newSummary: Summary = {
        id: Date.now().toString(),
        url,
        summary: data.summary,
        videoId: data.videoId,
        style: data.style,
        createdAt: Date.now(),
        topics: data.topics,
      };

      saveHistory([newSummary, ...history]);
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url) return;
    
    setLoading(true);
    setError('');

    try {
      const backendBase = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const apiUrl = `${backendBase}/api/analyze`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze video');
      }

      setCurrentSummary((prev: any) => ({
        ...prev,
        analysis: data,
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (currentSummary?.summary) {
      navigator.clipboard.writeText(currentSummary.summary);
    }
  };

  const downloadAsTxt = () => {
    if (currentSummary?.summary) {
      const blob = new Blob([currentSummary.summary], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `summary-${currentSummary.videoId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatSummary = (summary: string, style: string) => {
    if (style === 'bullets') {
      const lines = summary.split('\n').filter(l => l.trim());
      return lines.map(line => {
        if (line.startsWith('•') || line.startsWith('-') || line.startsWith('- ')) {
          return <li className="ml-4 mb-2">{line.replace(/^[•\-]\s*/, '')}</li>;
        }
        return <p className="mb-2">{line}</p>;
      });
    }
    return summary;
  };

  const STYLES = [
    { value: 'brief', label: 'Brief', desc: '2-3 sentence summary' },
    { value: 'bullets', label: 'Bullet Points', desc: 'Key points in list format' },
    { value: 'detailed', label: 'Detailed', desc: 'Comprehensive coverage' },
    { value: 'timestamped', label: 'Timestamps', desc: 'Organized by moments' },
    { value: 'actionable', label: 'Actionable', desc: 'Practical takeaways' },
    { value: 'question', label: 'Q&A', desc: 'Question-Answer format' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Youtube className="w-8 h-8 text-red-600" />
            <span className="text-xl font-bold tracking-tight">SummifyYT</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold">Summarize a Video</h2>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <Settings2 className="w-5 h-5 text-zinc-600" />
                </button>
              </div>
              <p className="text-zinc-500 mb-6">Paste a YouTube URL below to get an AI-generated summary.</p>

              {showSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-6 p-4 bg-zinc-50 rounded-xl space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Summary Style</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {STYLES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setStyle(s.value as SummaryStyle)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            style === s.value 
                              ? 'border-red-500 bg-red-50 text-red-700' 
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-xs text-zinc-500">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Summary Length</label>
                    <div className="flex gap-2">
                      {['short', 'medium', 'detailed'].map((l) => (
                        <button
                          key={l}
                          onClick={() => setLength(l as SummaryLength)}
                          className={`flex-1 py-2 px-4 rounded-lg border capitalize transition-all ${
                            length === l
                              ? 'border-red-500 bg-red-50 text-red-700'
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <form onSubmit={handleSummarize} className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LinkIcon className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="block w-full pl-11 pr-4 py-4 border border-zinc-200 rounded-2xl focus:ring-red-500 focus:border-red-500 bg-zinc-50 text-lg transition-colors"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={loading || !url}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-4 px-8 border border-transparent rounded-2xl shadow-sm text-base font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Summary
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {currentSummary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Summary</h3>
                      <p className="text-sm text-zinc-500">{currentSummary.style} • {currentSummary.language}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={copyToClipboard}
                      className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-5 h-5 text-zinc-600" />
                    </button>
                    <button 
                      onClick={downloadAsTxt}
                      className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Download as TXT"
                    >
                      <Download className="w-5 h-5 text-zinc-600" />
                    </button>
                  </div>
                </div>

                {currentSummary.style === 'bullets' ? (
                  <div className="space-y-4">
                    {currentSummary.summary.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="w-2 h-2 mt-2 rounded-full bg-red-500 flex-shrink-0" />
                        <p className="text-zinc-700 leading-relaxed">{line.replace(/^[•\-\s]+/, '')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="prose prose-zinc max-w-none">
                    <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">
                      {currentSummary.summary}
                    </p>
                  </div>
                )}

                {currentSummary.analysis && (
                  <div className="mt-8 pt-6 border-t border-zinc-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-purple-600" />
                      <h4 className="text-lg font-bold">Video Analysis</h4>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-purple-50 rounded-xl">
                        <p className="text-xs text-purple-600 font-medium mb-1">Topics</p>
                        <p className="text-sm text-zinc-700">{currentSummary.analysis.topics?.join(', ')}</p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-xl">
                        <p className="text-xs text-blue-600 font-medium mb-1">Difficulty</p>
                        <p className="text-sm text-zinc-700">{currentSummary.analysis.difficulty}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-xl">
                        <p className="text-xs text-green-600 font-medium mb-1">Audience</p>
                        <p className="text-sm text-zinc-700">{currentSummary.analysis.audience}</p>
                      </div>
                      <div className="p-4 bg-amber-50 rounded-xl">
                        <p className="text-xs text-amber-600 font-medium mb-1">Sentiment</p>
                        <p className="text-sm text-zinc-700">{currentSummary.analysis.sentiment}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-3 text-xs text-zinc-500">
                  <span>Video ID: {currentSummary.videoId}</span>
                  <span>•</span>
                  <span>{currentSummary.transcriptLength} chars processed</span>
                </div>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-100 sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-zinc-400" />
                <h3 className="text-lg font-bold">Recent Summaries</h3>
              </div>

              <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                {history.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-8">No summaries yet.</p>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-colors cursor-pointer"
                      onClick={() => setCurrentSummary({ ...item, language: 'en' })}
                    >
                      <p className="text-xs text-zinc-500 mb-2 truncate" title={item.url}>
                        {item.url}
                      </p>
                      <p className="text-sm text-zinc-700 line-clamp-3">
                        {item.summary}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <span className="text-xs px-2 py-1 bg-zinc-200 rounded-full capitalize">{item.style}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}