import { useEffect, useMemo, useState } from 'react';

type VictoryStats = {
  moves: number;
  timeMs: number;
  score: number;
};

type VictoryOverlayProps = {
  open: boolean;
  stats: VictoryStats;
  onClose: () => void;
  onNewGame: () => void;
  onSubmit?: () => void;
  submitStatus?: 'idle' | 'submitting' | 'success' | 'error';
  submitTx?: string | null;
  submitError?: string | null;
  submitEnabled?: boolean;
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatScore = (value: number) => new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));

export default function VictoryOverlay({
  open,
  stats,
  onClose,
  onNewGame,
  onSubmit,
  submitStatus = 'idle',
  submitTx,
  submitError,
  submitEnabled = false,
}: VictoryOverlayProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const particles = useMemo(
    () =>
      Array.from({ length: 36 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.8 + Math.random() * 1.6,
      })),
    [open]
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        onNewGame();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, onNewGame]);

  if (!open) return null;

  return (
    <div className="victory-overlay" role="dialog" aria-modal="true" aria-label="Victory">
      <div className="victory-backdrop" />
      {!reducedMotion ? (
        <div className="victory-particles" aria-hidden="true">
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="victory-particle"
              style={{
                left: `${particle.left}%`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="victory-card">
        <div className="victory-head">
          <div className="victory-copy">
            <p className="victory-eyebrow">Klondike Complete</p>
            <h2 className="victory-title">Clean Finish</h2>
            <p className="victory-sub">Keep the rhythm or lock the score on-chain.</p>
          </div>
          <div className="victory-score">
            <span className="label">Score</span>
            <span className="value">{formatScore(stats.score)}</span>
          </div>
        </div>
        <div className="victory-metrics">
          <div className="victory-metric">
            <span className="label">Time</span>
            <span className="value">{formatTime(stats.timeMs)}</span>
          </div>
          <div className="victory-metric">
            <span className="label">Steps</span>
            <span className="value">{stats.moves}</span>
          </div>
        </div>
        <div className="victory-actions">
          <button className="primary" onClick={onNewGame}>
            New Game
          </button>
          {onSubmit ? (
            <button
              className="ghost"
              onClick={onSubmit}
              disabled={!submitEnabled || submitStatus === 'submitting'}
            >
              {submitStatus === 'submitting'
                ? 'Submitting...'
                : submitStatus === 'success'
                  ? 'Submitted'
                  : 'Submit Score'}
            </button>
          ) : null}
          <button className="ghost" onClick={onClose}>
            Keep Playing
          </button>
        </div>
        {submitTx ? (
          <p className="victory-hint">Tx: {submitTx}</p>
        ) : submitError ? (
          <p className="victory-error">Submit failed: {submitError}</p>
        ) : null}
      </div>
    </div>
  );
}
