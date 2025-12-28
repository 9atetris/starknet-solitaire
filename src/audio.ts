type AudioEngine = {
  unlock: () => void;
  playMove: () => void;
  playWin: () => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

type Chord = {
  notes: number[];
  duration: number;
};

const CHORDS: Chord[] = [
  { notes: [293.66, 349.23, 440.0, 523.25, 659.25], duration: 6.4 }, // Dm9
  { notes: [196.0, 246.94, 293.66, 349.23, 659.25], duration: 6.4 }, // G13
  { notes: [261.63, 329.63, 392.0, 493.88, 587.33], duration: 6.8 }, // Cmaj9
  { notes: [220.0, 277.18, 329.63, 392.0, 466.16], duration: 6.8 }, // A7b9
];

const createNoopEngine = (): AudioEngine => ({
  unlock: () => {},
  playMove: () => {},
  playWin: () => {},
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
  let bgmGain: GainNode | null = null;
  let enabled = true;
  let unlocked = false;
  let bgmTimer: number | null = null;
  let bgmIndex = 0;

  const ensureContext = () => {
    if (context) return;
    context = new AudioContextCtor();
    masterGain = context.createGain();
    sfxGain = context.createGain();
    bgmGain = context.createGain();
    masterGain.gain.value = 0.55;
    sfxGain.gain.value = 0.6;
    bgmGain.gain.value = 0.18;
    sfxGain.connect(masterGain);
    bgmGain.connect(masterGain);
    masterGain.connect(context.destination);
  };

  const stopBgm = () => {
    if (bgmTimer != null) {
      window.clearTimeout(bgmTimer);
      bgmTimer = null;
    }
    bgmIndex = 0;
  };

  const playChord = (notes: number[], duration: number) => {
    if (!context || !bgmGain) return;
    const now = context.currentTime;
    const chordGain = context.createGain();
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.exponentialRampToValueAtTime(0.08, now + 0.9);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.6;

    chordGain.connect(filter);
    filter.connect(bgmGain);

    notes.forEach((freq, index) => {
      const osc = context!.createOscillator();
      osc.type = index % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      osc.detune.value = index % 2 === 0 ? -4 : 4;
      osc.connect(chordGain);
      osc.start(now);
      osc.stop(now + duration + 0.1);
    });

    const bass = context.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = notes[0] / 2;
    bass.connect(chordGain);
    bass.start(now);
    bass.stop(now + duration + 0.1);
  };

  const scheduleBgm = () => {
    if (!context || !bgmGain || !enabled) return;
    if (context.state !== 'running') return;
    if (bgmTimer != null) return;

    const loop = () => {
      if (!context || !bgmGain || !enabled) {
        stopBgm();
        return;
      }
      if (context.state !== 'running') {
        stopBgm();
        return;
      }
      const chord = CHORDS[bgmIndex];
      playChord(chord.notes, chord.duration);
      bgmIndex = (bgmIndex + 1) % CHORDS.length;
      bgmTimer = window.setTimeout(loop, Math.max(4000, chord.duration * 1000 - 200));
    };

    loop();
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

  const unlock = () => {
    ensureContext();
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume();
    }
    unlocked = true;
    if (enabled) {
      scheduleBgm();
    }
  };

  const setEnabled = (next: boolean) => {
    enabled = next;
    if (!enabled) {
      stopBgm();
    } else if (unlocked) {
      scheduleBgm();
    }
  };

  const dispose = () => {
    stopBgm();
    if (context) {
      void context.close();
      context = null;
    }
  };

  return {
    unlock,
    playMove,
    playWin,
    setEnabled,
    dispose,
  };
};
