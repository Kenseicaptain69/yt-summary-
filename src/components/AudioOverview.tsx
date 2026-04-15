import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Loader2, Mic } from 'lucide-react';
import { motion } from 'framer-motion';

interface AudioSegment {
  speaker: string;
  text: string;
}

interface AudioOverviewProps {
  segments: AudioSegment[];
  loading: boolean;
  onGenerate: () => void;
}

export default function AudioOverview({ segments, loading, onGenerate }: AudioOverviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = synthRef.current.getVoices();
      if (v.length) setVoices(v);
    };
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
    return () => { synthRef.current.cancel(); };
  }, []);

  const getVoiceForSpeaker = useCallback((speaker: string) => {
    if (!voices.length) return undefined;
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    if (speaker === 'Alex') {
      return enVoices.find(v => v.name.includes('Male') || v.name.includes('David') || v.name.includes('James')) || enVoices[0] || voices[0];
    }
    return enVoices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha')) || enVoices[1] || enVoices[0] || voices[0];
  }, [voices]);

  const speakSegment = useCallback((index: number) => {
    if (index >= segments.length) {
      setIsPlaying(false);
      setCurrentIndex(0);
      setProgress(0);
      return;
    }

    synthRef.current.cancel();
    const seg = segments[index];
    const utt = new SpeechSynthesisUtterance(seg.text);
    const voice = getVoiceForSpeaker(seg.speaker);
    if (voice) utt.voice = voice;
    utt.rate = 1.05;
    utt.pitch = seg.speaker === 'Alex' ? 1.1 : 0.95;
    utt.volume = muted ? 0 : 1;

    utt.onend = () => {
      const next = index + 1;
      setCurrentIndex(next);
      setProgress((next / segments.length) * 100);
      if (next < segments.length) {
        setTimeout(() => speakSegment(next), 400);
      } else {
        setIsPlaying(false);
        setProgress(100);
      }
    };

    utteranceRef.current = utt;
    setCurrentIndex(index);
    setProgress((index / segments.length) * 100);
    synthRef.current.speak(utt);
  }, [segments, muted, getVoiceForSpeaker]);

  const handlePlayPause = () => {
    if (isPlaying) {
      synthRef.current.cancel();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      speakSegment(currentIndex);
    }
  };

  const handleSkipForward = () => {
    synthRef.current.cancel();
    const next = Math.min(currentIndex + 1, segments.length - 1);
    setCurrentIndex(next);
    if (isPlaying) speakSegment(next);
  };

  const handleSkipBack = () => {
    synthRef.current.cancel();
    const prev = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prev);
    if (isPlaying) speakSegment(prev);
  };

  if (segments.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 1.5rem', borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(255,59,92,0.15))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Mic style={{ width: 32, height: 32, color: '#a855f7' }} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 8 }}>AI Audio Overview</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: 380, margin: '0 auto 1.5rem' }}>
          Generate a podcast-style discussion between two AI hosts about your video content.
        </p>
        <button onClick={onGenerate} disabled={loading} className="btn-primary"
          style={{ padding: '0.75rem 2rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {loading ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> Generating...</> :
            <><Mic style={{ width: 18, height: 18 }} /> Generate Audio Overview</>}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Waveform-style Player */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(255,59,92,0.08))',
        border: '1px solid rgba(168,85,247,0.15)',
        borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.25rem',
      }}>
        {/* Progress bar */}
        <div style={{
          height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: '1rem', overflow: 'hidden',
        }}>
          <motion.div
            animate={{ width: `${progress}%` }}
            style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #a855f7, #ff3b5c)' }}
          />
        </div>

        {/* Waveform visualization */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 40, marginBottom: '1rem', justifyContent: 'center' }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                height: isPlaying ? [8, 12 + Math.random() * 28, 8] : 8,
                opacity: isPlaying ? [0.3, 0.8, 0.3] : 0.2,
              }}
              transition={{
                duration: 0.4 + Math.random() * 0.4,
                repeat: isPlaying ? Infinity : 0,
                delay: i * 0.02,
              }}
              style={{
                width: 3, borderRadius: 2, minHeight: 4,
                background: i / 40 < progress / 100 ? 'var(--accent-purple)' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button onClick={handleSkipBack} className="btn-ghost" style={{ padding: 8, borderRadius: 10 }}>
            <SkipBack style={{ width: 18, height: 18 }} />
          </button>
          <button onClick={handlePlayPause} style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #a855f7, #ff3b5c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
            transition: 'transform 0.2s',
          }}>
            {isPlaying ?
              <Pause style={{ width: 22, height: 22, color: 'white' }} /> :
              <Play style={{ width: 22, height: 22, color: 'white', marginLeft: 2 }} />
            }
          </button>
          <button onClick={handleSkipForward} className="btn-ghost" style={{ padding: 8, borderRadius: 10 }}>
            <SkipForward style={{ width: 18, height: 18 }} />
          </button>
          <button onClick={() => setMuted(!muted)} className="btn-ghost" style={{ padding: 8, borderRadius: 10 }}>
            {muted ? <VolumeX style={{ width: 18, height: 18 }} /> : <Volume2 style={{ width: 18, height: 18 }} />}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
          {currentIndex + 1} / {segments.length} segments
        </p>
      </div>

      {/* Script display */}
      <div style={{ maxHeight: 350, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {segments.map((seg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: i === currentIndex ? 1 : 0.5, scale: i === currentIndex ? 1.01 : 1 }}
            style={{
              padding: '0.875rem 1rem',
              borderRadius: '0.875rem',
              background: i === currentIndex
                ? (seg.speaker === 'Alex' ? 'rgba(255,59,92,0.1)' : 'rgba(168,85,247,0.1)')
                : 'rgba(255,255,255,0.02)',
              border: `1px solid ${i === currentIndex
                ? (seg.speaker === 'Alex' ? 'rgba(255,59,92,0.2)' : 'rgba(168,85,247,0.2)')
                : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onClick={() => { setCurrentIndex(i); if (isPlaying) { synthRef.current.cancel(); speakSegment(i); } }}
          >
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
              color: seg.speaker === 'Alex' ? '#ff3b5c' : '#a855f7',
            }}>
              {seg.speaker}
            </span>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>
              {seg.text}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
