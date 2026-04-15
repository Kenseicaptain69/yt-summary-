import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, Download, Brain } from 'lucide-react';

interface MindMapProps {
  mermaidCode: string;
  loading: boolean;
  onGenerate: () => void;
}

export default function MindMap({ mermaidCode, loading, onGenerate }: MindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;
    setError('');
    setRendered(false);

    const renderDiagram = async () => {
      try {
        // Dynamically import mermaid
        // @ts-ignore - Dynamic CDN import works at runtime
        const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#a855f7',
            primaryTextColor: '#f0f0f5',
            primaryBorderColor: '#a855f7',
            lineColor: '#5a5a72',
            secondaryColor: '#1e1e2e',
            tertiaryColor: '#12121a',
            fontFamily: 'Inter, sans-serif',
          },
        });

        const id = `mermaid-${Date.now()}`;
        containerRef.current!.innerHTML = '';
        const { svg } = await mermaid.render(id, mermaidCode);
        containerRef.current!.innerHTML = svg;
        setRendered(true);

        // Style the SVG
        const svgEl = containerRef.current!.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
          svgEl.style.minHeight = '300px';
        }
      } catch (e: any) {
        console.error('Mermaid render error:', e);
        setError('Could not render mind map. Trying fallback...');
        // Fallback: show as styled text
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8; padding: 1rem;">${mermaidCode}</pre>`;
          setRendered(true);
        }
      }
    };

    renderDiagram();
  }, [mermaidCode]);

  const handleExport = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mindmap.svg';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (!mermaidCode) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 1.5rem', borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.15))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain style={{ width: 32, height: 32, color: '#06b6d4' }} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 8 }}>Mind Map</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 380, margin: '0 auto 1.5rem' }}>
          Visualize connections between concepts from your video sources.
        </p>
        <button onClick={onGenerate} disabled={loading} className="btn-primary"
          style={{ padding: '0.75rem 2rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {loading ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> Generating...</> :
            <><Brain style={{ width: 18, height: 18 }} /> Generate Mind Map</>}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.min(z + 0.2, 2))} className="btn-ghost" style={{ padding: 6, borderRadius: 8 }}>
            <ZoomIn style={{ width: 16, height: 16 }} />
          </button>
          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} className="btn-ghost" style={{ padding: 6, borderRadius: 8 }}>
            <ZoomOut style={{ width: 16, height: 16 }} />
          </button>
          <button onClick={() => setZoom(1)} className="btn-ghost" style={{ padding: 6, borderRadius: 8 }}>
            <RotateCcw style={{ width: 16, height: 16 }} />
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 4 }}>{Math.round(zoom * 100)}%</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleExport} className="btn-ghost" style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download style={{ width: 14, height: 14 }} /> SVG
          </button>
          <button onClick={onGenerate} disabled={loading} className="btn-ghost" style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw style={{ width: 14, height: 14 }} /> Regenerate
          </button>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginBottom: 8 }}>{error}</p>
      )}

      {/* Mind Map Container */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--glass-border)',
        borderRadius: '1rem',
        padding: '1.5rem',
        overflow: 'auto',
        minHeight: 350,
        maxHeight: 550,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {loading && !rendered ? (
          <div style={{ textAlign: 'center' }}>
            <Loader2 style={{ width: 32, height: 32, color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating mind map...</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.3s ease', width: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
