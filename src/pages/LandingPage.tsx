import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Youtube, FileText, Zap, ArrowRight, MessageSquare, BookOpen, Search, Sparkles, Play, Star } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI Summaries',
    desc: '6 unique summary styles — from quick briefs to Q&A format — powered by Gemini AI.',
    color: '#ff3b5c',
    bg: 'rgba(255, 59, 92, 0.08)',
  },
  {
    icon: MessageSquare,
    title: 'Chat with Video',
    desc: 'Ask follow-up questions and get answers directly from the video content.',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.08)',
  },
  {
    icon: BookOpen,
    title: 'Study Flashcards',
    desc: 'Auto-generate flashcards for quick revision with interactive flip animations.',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.08)',
  },
  {
    icon: FileText,
    title: 'Transcript Viewer',
    desc: 'Browse the full transcript with search highlighting to find exactly what you need.',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.08)',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    desc: 'Intelligent caching, circuit breakers, and model fallback for reliable performance.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
  },
  {
    icon: Search,
    title: 'Deep Analysis',
    desc: 'Get topics, sentiment, difficulty level, and key terms extracted automatically.',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.08)',
  },
];

const STATS = [
  { value: '6+', label: 'Summary Styles' },
  { value: '8+', label: 'Languages' },
  { value: '<10s', label: 'Avg Response' },
  { value: '∞', label: 'Videos Supported' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)' }}>
      {/* Animated mesh background */}
      <div className="mesh-bg" />

      {/* Floating orbs */}
      <div
        style={{
          position: 'fixed',
          top: '10%',
          left: '15%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,59,92,0.06) 0%, transparent 70%)',
          animation: 'float-orb 15s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '60%',
          right: '10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 70%)',
          animation: 'float-orb 20s ease-in-out infinite reverse',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Navigation */}
      <nav
        className="glass-strong"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #ff3b5c, #e11d48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play style={{ width: 18, height: 18, color: 'white', fill: 'white' }} />
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>SummifyYT</span>
          </div>
          <Link
            to="/app"
            className="btn-primary"
            style={{ padding: '0.625rem 1.5rem', fontSize: '0.875rem', borderRadius: '0.75rem' }}
          >
            Open App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '6rem 1.5rem 4rem', textAlign: 'center' }}>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.1 } },
            }}
          >
            {/* Badge */}
            <motion.div variants={fadeUp} custom={0} style={{ marginBottom: '1.5rem' }}>
              <span
                className="glass"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.5rem 1.25rem',
                  borderRadius: '2rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--accent-red)',
                  letterSpacing: '0.03em',
                }}
              >
                <Star style={{ width: 14, height: 14, fill: 'var(--accent-red)' }} />
                Now with AI Chat & Flashcards
              </span>
            </motion.div>

            {/* Heading */}
            <motion.h1
              variants={fadeUp}
              custom={1}
              style={{
                fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                maxWidth: 800,
                margin: '0 auto 1.5rem',
                color: 'var(--text-primary)',
              }}
            >
              Turn hours of video into{' '}
              <span className="gradient-text">minutes of reading.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={fadeUp}
              custom={2}
              style={{
                fontSize: 'clamp(1rem, 2vw, 1.2rem)',
                color: 'var(--text-secondary)',
                maxWidth: 600,
                margin: '0 auto 2.5rem',
                lineHeight: 1.7,
              }}
            >
              Paste any YouTube URL and get AI-powered summaries, interactive flashcards,
              and a chat interface to ask questions about the video.
            </motion.p>

            {/* CTA */}
            <motion.div variants={fadeUp} custom={3} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
              <Link
                to="/app"
                className="btn-primary glow-red"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '1rem 2.5rem',
                  fontSize: '1.05rem',
                  borderRadius: '1rem',
                }}
              >
                Start Summarizing
                <ArrowRight style={{ width: 20, height: 20 }} />
              </Link>
              <a
                href="#features"
                className="btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '1rem 2rem', fontSize: '1rem' }}
              >
                See Features
              </a>
            </motion.div>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem',
              maxWidth: 700,
              margin: '5rem auto 0',
            }}
          >
            {STATS.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Features Grid */}
        <section id="features" style={{ maxWidth: 1200, margin: '0 auto', padding: '4rem 1.5rem 6rem' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: '3rem' }}
          >
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              Everything you need
            </h2>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
              A complete toolkit for extracting knowledge from YouTube videos.
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="glass border-gradient"
                style={{
                  padding: '2rem',
                  borderRadius: '1.5rem',
                  cursor: 'default',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                }}
                whileHover={{ y: -4, boxShadow: `0 20px 40px rgba(0,0,0,0.3)` }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: f.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  <f.icon style={{ width: 22, height: 22, color: f.color }} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Banner */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem 6rem' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            style={{
              background: 'linear-gradient(135deg, rgba(255,59,92,0.1) 0%, rgba(168,85,247,0.08) 50%, rgba(59,130,246,0.1) 100%)',
              border: '1px solid rgba(255,59,92,0.15)',
              borderRadius: '2rem',
              padding: '4rem 2rem',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'radial-gradient(circle at 50% 80%, rgba(255,59,92,0.06) 0%, transparent 50%)',
                pointerEvents: 'none',
              }}
            />
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: '1rem', position: 'relative' }}>
              Ready to save hours of your time?
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.05rem', position: 'relative' }}>
              Start summarizing YouTube videos — completely free. No sign-up required.
            </p>
            <Link
              to="/app"
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '1rem 2.5rem',
                fontSize: '1.05rem',
                position: 'relative',
              }}
            >
              Get Started Free
              <ArrowRight style={{ width: 20, height: 20 }} />
            </Link>
          </motion.div>
        </section>

        {/* Footer */}
        <footer
          style={{
            borderTop: '1px solid var(--glass-border)',
            padding: '2rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #ff3b5c, #e11d48)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play style={{ width: 12, height: 12, color: 'white', fill: 'white' }} />
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              SummifyYT — Built with Gemini AI
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
