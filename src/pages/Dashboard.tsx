import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Youtube, Link as LinkIcon, Loader2, FileText, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface Summary {
  id: string;
  url: string;
  summary: string;
  createdAt: number;
}

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSummary, setCurrentSummary] = useState('');
  const [history, setHistory] = useState<Summary[]>([]);

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
    setCurrentSummary('');

    try {
      // Use Render backend URL in production, fallback to same-origin /api/summarize for local dev
      const backendBase = import.meta.env.https://yt-summary-jwnb.onrender.com || window.location.origin;
      const apiUrl = `${backendBase}/summarize`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to summarize video');
      }

      setCurrentSummary(data.summary);

      const newSummary: Summary = {
        id: Date.now().toString(),
        url,
        summary: data.summary,
        createdAt: Date.now(),
      };

      saveHistory([newSummary, ...history]);
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Youtube className="w-8 h-8 text-red-600" />
            <span className="text-xl font-bold tracking-tight">SummifyYT</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            {/* Input Section */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100">
              <h2 className="text-2xl font-bold mb-2">Summarize a Video</h2>
              <p className="text-zinc-500 mb-6">Paste a YouTube URL below to get an AI-generated summary.</p>
              
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

                <button
                  type="submit"
                  disabled={loading || !url}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 py-4 px-8 border border-transparent rounded-2xl shadow-sm text-base font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Summarizing...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Generate Summary
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Current Summary Result */}
            {currentSummary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold">Summary</h3>
                </div>
                <div className="prose prose-zinc max-w-none">
                  <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">
                    {currentSummary}
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Sidebar - History */}
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
                    <div key={item.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-colors cursor-pointer" onClick={() => setCurrentSummary(item.summary)}>
                      <p className="text-xs text-zinc-500 mb-2 truncate" title={item.url}>
                        {item.url}
                      </p>
                      <p className="text-sm text-zinc-700 line-clamp-3">
                        {item.summary}
                      </p>
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
