import { useEffect, useMemo, useState } from 'react';

type VictoryStats = {
  moves: number;
  timeMs: number;
  seed: number;
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
        <p className="victory-eyebrow">Klondike Complete</p>
        <h2 className="victory-title">VICTORY!</h2>
        <div className="victory-stats">
          <div>
            <span className="label">Moves</span>
            <span className="value">{stats.moves}</span>
          </div>
          <div>
            <span className="label">Time</span>
            <span className="value">{formatTime(stats.timeMs)}</span>
          </div>
          <div>
            <span className="label">Seed</span>
            <span className="value">{stats.seed}</span>
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
