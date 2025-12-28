import { useEffect, useMemo, useState } from 'react';

const OVERRIDE_KEY = 'orientation_override_landscape_v1';

const isPortraitMobile = () => {
  const isNarrow = window.innerWidth <= 900;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  return isNarrow && isPortrait;
};

export default function OrientationOverlay() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const override = localStorage.getItem(OVERRIDE_KEY) === '1';
    return !override && isPortraitMobile();
  });

  useEffect(() => {
    const update = () => {
      const override = localStorage.getItem(OVERRIDE_KEY) === '1';
      setEnabled(!override && isPortraitMobile());
    };

    const media = window.matchMedia('(orientation: portrait)');
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleOverride = () => {
    localStorage.setItem(OVERRIDE_KEY, '1');
    setEnabled(false);
  };

  const shouldRender = useMemo(() => enabled, [enabled]);

  if (!shouldRender) return null;

  return (
    <div className="orientation-overlay" aria-live="polite" role="dialog" aria-modal="true">
      <div className="orientation-card">
        <div className="orientation-icon" aria-hidden="true">
          <div className="phone" />
          <div className="rotate" />
        </div>
        <h2>Rotate your phone</h2>
        <p>横画面にしてプレイしてね</p>
        <span className="orientation-sub">For best experience, play in landscape.</span>
      </div>
      <button className="orientation-skip" type="button" onClick={handleOverride}>
        Continue anyway (portrait may break layout)
      </button>
    </div>
  );
}
