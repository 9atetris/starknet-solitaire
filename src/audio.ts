type AudioEngine = {
  unlock: () => void;
  playMove: () => void;
  playWin: () => void;
  playAmbient: () => boolean;
  stopAmbient: () => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

const createNoopEngine = (): AudioEngine => ({
  unlock: () => {},
  playMove: () => {},
  playWin: () => {},
  playAmbient: () => false,
  stopAmbient: () => {},
  setEnabled: () => {},
  dispose: () => {},
});

export const createAudioEngine = (): AudioEngine => {
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return createNoopEngine();
  }

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let enabled = true;
  let musicTimer: number | null = null;
  let musicActive = false;

  const ensureContext = () => {
    if (context) return;
    context = new AudioContextCtor();
    masterGain = context.createGain();
    sfxGain = context.createGain();
    musicGain = context.createGain();
    masterGain.gain.value = 0.55;
    sfxGain.gain.value = 0.6;
    musicGain.gain.value = 0.25;
    sfxGain.connect(masterGain!);
    musicGain.connect(masterGain!);
    masterGain.connect(context.destination);
  };

  const playMove = () => {
    if (!enabled) return;
    ensureContext();
    if (!context || !sfxGain || context.state !== 'running') return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 360;
    filter.Q.value = 0.7;

    gain.connect(filter);
    filter.connect(sfxGain);

    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);

    const shimmer = context.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(880, now);
    shimmer.frequency.exponentialRampToValueAtTime(520, now + 0.1);
    shimmer.connect(gain);
    shimmer.start(now);
    shimmer.stop(now + 0.15);
  };

  const playWin = () => {
    if (!enabled) return;
    ensureContext();
    if (!context || !sfxGain || context.state !== 'running') return;
    const now = context.currentTime;
    const melody = [
      { freq: 523.25, time: 0.0 },
      { freq: 659.25, time: 0.2 },
      { freq: 783.99, time: 0.38 },
      { freq: 987.77, time: 0.62 },
      { freq: 1174.66, time: 0.9 },
    ];
    melody.forEach(({ freq, time }) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      const start = now + time;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(sfxGain!);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  };

  const spawnAmbientChord = () => {
    if (!enabled) return;
    ensureContext();
    if (!context || !musicGain || context.state !== 'running') return;
    const now = context.currentTime;
    const freqs = [196, 233, 262, 294, 349, 392];
    const base = freqs[Math.floor(Math.random() * freqs.length)];
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = base;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.6);
    gain.gain.linearRampToValueAtTime(0.0001, now + 7.5);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + 8);
  };

  const playAmbient = () => {
    if (!enabled) return false;
    ensureContext();
    if (!context) return false;
    const startLoop = () => {
      if (musicActive) return;
      musicActive = true;
      spawnAmbientChord();
      musicTimer = window.setInterval(spawnAmbientChord, 6500);
      return true;
    };
    if (context.state === 'suspended') {
      void context
        .resume()
        .then(() => {
          if (!enabled) return false;
          return startLoop();
        })
        .catch(() => {});
      return false;
    }
    return startLoop() ?? false;
  };

  const stopAmbient = () => {
    musicActive = false;
    if (musicTimer != null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
    if (musicGain && context) {
      const now = context.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
    }
  };

  const unlock = () => {
    ensureContext();
    if (!context) return;
    if (context.state !== 'running') {
      context
        .resume()
        .then(() => {
          if (enabled) {
            playAmbient();
          }
        })
        .catch(() => {
          // Ignore resume errors; user can retry by interacting again.
        });
      return;
    }
    if (enabled) {
      playAmbient();
    }
  };

  const setEnabled = (next: boolean) => {
    enabled = next;
    if (!enabled) {
      stopAmbient();
    }
  };

  const dispose = () => {
    stopAmbient();
    if (context) {
      void context.close();
      context = null;
    }
  };

  return {
    unlock,
    playMove,
    playWin,
    playAmbient,
    stopAmbient,
    setEnabled,
    dispose,
  };
};
