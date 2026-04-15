import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Play, BookOpen, Clock, ChevronRight, FolderOpen, X, Sparkles } from 'lucide-react';

interface Notebook {
  id: string;
  name: string;
  description: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
}

export default function NotebookList() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('summify_notebooks');
      if (saved) setNotebooks(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const save = (nbs: Notebook[]) => {
    setNotebooks(nbs);
    localStorage.setItem('summify_notebooks', JSON.stringify(nbs));
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const nb: Notebook = {
      id: `nb_${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim(),
      videoIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    save([nb, ...notebooks]);
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
  };

  const handleDelete = (id: string) => {
    save(notebooks.filter(n => n.id !== id));
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>
      <div className="mesh-bg" />

      {/* Header */}
      <nav className="glass-strong" style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #ff3b5c, #e11d48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play style={{ width: 18, height: 18, color: 'white', fill: 'white' }} />
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>SummifyYT</span>
          </Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/app" className="btn-ghost" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles style={{ width: 16, height: 16 }} /> Quick Summary
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 4 }}>
              <span className="gradient-text">My Notebooks</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Create notebooks to organize and learn from multiple YouTube videos.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem' }}>
            <Plus style={{ width: 18, height: 18 }} /> New Notebook
          </button>
        </div>

        {/* Create modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
              }}
              onClick={() => setShowCreate(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="glass-strong"
                style={{ borderRadius: '1.5rem', padding: '2rem', width: '100%', maxWidth: 480 }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create Notebook</h2>
                  <button onClick={() => setShowCreate(false)} className="btn-ghost" style={{ padding: 6, borderRadius: 8 }}>
                    <X style={{ width: 18, height: 18 }} />
                  </button>
                </div>
                <input
                  type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Notebook name..." className="input-glass"
                  style={{ paddingLeft: 16, marginBottom: '1rem', height: 48 }}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <textarea
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)..."
                  style={{
                    width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', fontSize: '0.9rem',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', resize: 'none',
                    minHeight: 80, marginBottom: '1.25rem',
                  }}
                />
                <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary"
                  style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Plus style={{ width: 18, height: 18 }} /> Create Notebook
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notebooks grid */}
        {notebooks.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{
              width: 80, height: 80, margin: '0 auto 1.5rem', borderRadius: 24,
              background: 'linear-gradient(135deg, rgba(255,59,92,0.1), rgba(168,85,247,0.1))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FolderOpen style={{ width: 36, height: 36, color: 'var(--text-muted)' }} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>No notebooks yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Create your first notebook to start organizing YouTube videos.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary"
              style={{ padding: '0.75rem 2rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Plus style={{ width: 18, height: 18 }} /> Create First Notebook
            </button>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {notebooks.map((nb, i) => (
              <motion.div
                key={nb.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass border-gradient"
                style={{ borderRadius: '1.25rem', overflow: 'hidden', transition: 'transform 0.2s' }}
              >
                <Link to={`/notebook/${nb.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '1.5rem' }}>
                  {/* Color bar */}
                  <div style={{
                    height: 3, borderRadius: 2, marginBottom: '1rem',
                    background: `linear-gradient(90deg, #ff3b5c, #a855f7, #3b82f6)`,
                  }} />

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {nb.name}
                    <ChevronRight style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
                  </h3>
                  {nb.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                      {nb.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <BookOpen style={{ width: 14, height: 14 }} /> {nb.videoIds.length} source{nb.videoIds.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock style={{ width: 14, height: 14 }} /> {new Date(nb.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Video thumbnails */}
                  {nb.videoIds.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: '1rem' }}>
                      {nb.videoIds.slice(0, 4).map(vid => (
                        <div key={vid} style={{
                          width: 56, height: 32, borderRadius: 6, overflow: 'hidden',
                          border: '1px solid var(--glass-border)',
                        }}>
                          <img
                            src={`https://img.youtube.com/vi/${vid}/default.jpg`}
                            alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ))}
                      {nb.videoIds.length > 4 && (
                        <div style={{
                          width: 56, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                        }}>
                          +{nb.videoIds.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </Link>

                {/* Delete button */}
                <div style={{ padding: '0 1.5rem 1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => handleDelete(nb.id)} className="btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4, color: '#ff3b5c' }}>
                    <Trash2 style={{ width: 12, height: 12 }} /> Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
