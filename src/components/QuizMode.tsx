import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Clock, Trophy, RotateCcw, ArrowRight, HelpCircle, Zap } from 'lucide-react';

interface QuizQuestion {
  type: 'multiple_choice' | 'true_false';
  question: string;
  options?: string[];
  correctAnswer: number | boolean;
  explanation: string;
  difficulty: string;
}

interface QuizModeProps {
  questions: QuizQuestion[];
  loading: boolean;
  onGenerate: (difficulty: string) => void;
}

const DIFFICULTY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  easy: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  medium: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  hard: { bg: 'rgba(255,59,92,0.1)', border: 'rgba(255,59,92,0.3)', text: '#ff3b5c' },
  mixed: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
};

function getGrade(pct: number): { letter: string; color: string; label: string } {
  if (pct >= 90) return { letter: 'A+', color: '#10b981', label: 'Excellent!' };
  if (pct >= 80) return { letter: 'A', color: '#10b981', label: 'Great job!' };
  if (pct >= 70) return { letter: 'B', color: '#3b82f6', label: 'Good work!' };
  if (pct >= 60) return { letter: 'C', color: '#f59e0b', label: 'Not bad!' };
  if (pct >= 50) return { letter: 'D', color: '#f97316', label: 'Keep trying!' };
  return { letter: 'F', color: '#ff3b5c', label: 'Study more!' };
}

export default function QuizMode({ questions, loading, onGenerate }: QuizModeProps) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<boolean[]>([]);
  const [quizDone, setQuizDone] = useState(false);
  const [timer, setTimer] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [difficulty, setDifficulty] = useState('mixed');

  useEffect(() => {
    if (!timerActive || timer <= 0) return;
    const t = setInterval(() => setTimer(p => { if (p <= 1) { clearInterval(t); handleTimeUp(); return 0; } return p - 1; }), 1000);
    return () => clearInterval(t);
  }, [timerActive, timer]);

  useEffect(() => {
    if (questions.length > 0) {
      setCurrentQ(0);
      setScore(0);
      setAnswered([]);
      setQuizDone(false);
      setTimer(30);
      setTimerActive(true);
      setSelectedAnswer(null);
      setShowExplanation(false);
    }
  }, [questions]);

  const handleTimeUp = useCallback(() => {
    setTimerActive(false);
    setShowExplanation(true);
    setAnswered(prev => [...prev, false]);
  }, []);

  const handleAnswer = (answer: number | boolean) => {
    if (showExplanation) return;
    setSelectedAnswer(answer);
    setTimerActive(false);
    setShowExplanation(true);

    const q = questions[currentQ];
    const isCorrect = answer === q.correctAnswer;
    if (isCorrect) setScore(s => s + 1);
    setAnswered(prev => [...prev, isCorrect]);
  };

  const handleNext = () => {
    if (currentQ + 1 >= questions.length) {
      setQuizDone(true);
    } else {
      setCurrentQ(q => q + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setTimer(30);
      setTimerActive(true);
    }
  };

  // Start screen
  if (questions.length === 0 && !loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 1.5rem', borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(255,59,92,0.15))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap style={{ width: 32, height: 32, color: '#f59e0b' }} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 8 }}>Quiz Mode</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 380, margin: '0 auto 1.5rem' }}>
          Test your knowledge with AI-generated questions. Choose your difficulty:
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['easy', 'medium', 'hard', 'mixed'].map(d => (
            <button key={d} onClick={() => setDifficulty(d)}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: 20, cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' as const,
                border: `1px solid ${difficulty === d ? DIFFICULTY_COLORS[d].border : 'var(--glass-border)'}`,
                background: difficulty === d ? DIFFICULTY_COLORS[d].bg : 'transparent',
                color: difficulty === d ? DIFFICULTY_COLORS[d].text : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={() => onGenerate(difficulty)} disabled={loading} className="btn-primary"
          style={{ padding: '0.75rem 2rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Zap style={{ width: 18, height: 18 }} /> Start Quiz
        </button>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Loader2 style={{ width: 32, height: 32, color: '#f59e0b', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Generating quiz questions...</p>
      </div>
    );
  }

  // Results screen
  if (quizDone) {
    const pct = Math.round((score / questions.length) * 100);
    const grade = getGrade(pct);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <div style={{
          width: 100, height: 100, margin: '0 auto 1.5rem', borderRadius: '50%',
          background: `linear-gradient(135deg, ${grade.color}22, ${grade.color}44)`,
          border: `3px solid ${grade.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{ fontSize: '1.8rem', fontWeight: 900, color: grade.color }}>{grade.letter}</span>
        </div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 4 }}>{grade.label}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '1.5rem' }}>
          You scored <strong style={{ color: grade.color }}>{score}/{questions.length}</strong> ({pct}%)
        </p>

        {/* Question review */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {answered.map((correct, i) => (
            <div key={i} style={{
              width: 28, height: 28, borderRadius: 8,
              background: correct ? 'rgba(16,185,129,0.15)' : 'rgba(255,59,92,0.15)',
              border: `1px solid ${correct ? 'rgba(16,185,129,0.3)' : 'rgba(255,59,92,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 700, color: correct ? '#10b981' : '#ff3b5c',
            }}>
              {i + 1}
            </div>
          ))}
        </div>

        <button onClick={() => { setQuizDone(false); onGenerate(difficulty); }} className="btn-primary"
          style={{ padding: '0.75rem 2rem', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <RotateCcw style={{ width: 16, height: 16 }} /> Try Again
        </button>
      </motion.div>
    );
  }

  // Quiz question
  const q = questions[currentQ];
  const timerColor = timer > 20 ? '#10b981' : timer > 10 ? '#f59e0b' : '#ff3b5c';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            Q{currentQ + 1}/{questions.length}
          </span>
          <span style={{
            padding: '2px 10px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 600,
            textTransform: 'capitalize' as const,
            background: DIFFICULTY_COLORS[q.difficulty]?.bg || DIFFICULTY_COLORS.medium.bg,
            color: DIFFICULTY_COLORS[q.difficulty]?.text || DIFFICULTY_COLORS.medium.text,
            border: `1px solid ${DIFFICULTY_COLORS[q.difficulty]?.border || DIFFICULTY_COLORS.medium.border}`,
          }}>
            {q.difficulty}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timerColor, fontWeight: 700, fontSize: '0.9rem' }}>
          <Clock style={{ width: 16, height: 16 }} /> {timer}s
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: '1.5rem', overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${(timer / 30) * 100}%` }}
          style={{ height: '100%', borderRadius: 2, background: timerColor }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div style={{
            padding: '1.25rem', borderRadius: '1rem', marginBottom: '1.25rem',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <HelpCircle style={{ width: 20, height: 20, color: 'var(--accent-amber)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.6 }}>{q.question}</p>
            </div>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.type === 'multiple_choice' && q.options ? (
              q.options.map((opt, i) => {
                const isSelected = selectedAnswer === i;
                const isCorrect = i === q.correctAnswer;
                const showResult = showExplanation;
                let bg = 'rgba(255,255,255,0.03)';
                let bdColor = 'var(--glass-border)';
                if (showResult && isCorrect) { bg = 'rgba(16,185,129,0.1)'; bdColor = 'rgba(16,185,129,0.4)'; }
                else if (showResult && isSelected && !isCorrect) { bg = 'rgba(255,59,92,0.1)'; bdColor = 'rgba(255,59,92,0.4)'; }
                else if (isSelected) { bg = 'rgba(168,85,247,0.1)'; bdColor = 'rgba(168,85,247,0.3)'; }

                return (
                  <button key={i} onClick={() => handleAnswer(i)} disabled={showExplanation}
                    style={{
                      padding: '0.875rem 1rem', borderRadius: '0.875rem', textAlign: 'left',
                      background: bg, border: `1px solid ${bdColor}`, cursor: showExplanation ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                      color: 'var(--text-primary)', fontSize: '0.9rem',
                    }}>
                    {showResult && isCorrect && <CheckCircle2 style={{ width: 18, height: 18, color: '#10b981', flexShrink: 0 }} />}
                    {showResult && isSelected && !isCorrect && <XCircle style={{ width: 18, height: 18, color: '#ff3b5c', flexShrink: 0 }} />}
                    {!showResult && <span style={{
                      width: 24, height: 24, borderRadius: 6, border: `1px solid ${isSelected ? '#a855f7' : 'var(--glass-border)'}`,
                      background: isSelected ? 'rgba(168,85,247,0.2)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                    }}>{String.fromCharCode(65 + i)}</span>}
                    <span>{opt}</span>
                  </button>
                );
              })
            ) : (
              ['True', 'False'].map((opt, i) => {
                const val = i === 0;
                const isSelected = selectedAnswer === val;
                const isCorrect = val === q.correctAnswer;
                const showResult = showExplanation;
                let bg = 'rgba(255,255,255,0.03)';
                let bdColor = 'var(--glass-border)';
                if (showResult && isCorrect) { bg = 'rgba(16,185,129,0.1)'; bdColor = 'rgba(16,185,129,0.4)'; }
                else if (showResult && isSelected && !isCorrect) { bg = 'rgba(255,59,92,0.1)'; bdColor = 'rgba(255,59,92,0.4)'; }

                return (
                  <button key={opt} onClick={() => handleAnswer(val)} disabled={showExplanation}
                    style={{
                      padding: '0.875rem 1rem', borderRadius: '0.875rem', textAlign: 'left',
                      background: bg, border: `1px solid ${bdColor}`, cursor: showExplanation ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                      color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600,
                    }}>
                    {showResult && isCorrect && <CheckCircle2 style={{ width: 18, height: 18, color: '#10b981' }} />}
                    {showResult && isSelected && !isCorrect && <XCircle style={{ width: 18, height: 18, color: '#ff3b5c' }} />}
                    {opt}
                  </button>
                );
              })
            )}
          </div>

          {/* Explanation */}
          {showExplanation && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{
              marginTop: '1rem', padding: '1rem', borderRadius: '0.875rem',
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
            }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>Explanation</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{q.explanation}</p>
            </motion.div>
          )}

          {/* Next button */}
          {showExplanation && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={handleNext}
              className="btn-primary" style={{
                marginTop: '1rem', width: '100%', height: 48, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {currentQ + 1 >= questions.length ? <><Trophy style={{ width: 18, height: 18 }} /> See Results</> :
                <>Next Question <ArrowRight style={{ width: 18, height: 18 }} /></>}
            </motion.button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: '1.5rem' }}>
        {questions.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%', transition: 'all 0.2s',
            background: i < answered.length
              ? (answered[i] ? '#10b981' : '#ff3b5c')
              : i === currentQ ? 'var(--accent-amber)' : 'rgba(255,255,255,0.1)',
          }} />
        ))}
      </div>
    </div>
  );
}
