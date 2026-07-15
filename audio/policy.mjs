// Audio policy is intentionally data-only. It keeps neural mode, musical style, and
// instrument palette independent so callers never duplicate ranges or fallback rules.

export const MODES = Object.freeze(['focus', 'relax']);
export const STYLES = Object.freeze(['ambient', 'classical', 'baroque']);
export const INSTRUMENTS = Object.freeze(['existing', 'piano', 'harpsichord']);

export const STORAGE_DEFAULTS = Object.freeze({
  focusHz: 16,
  relaxHz: 10,
  musicStyle: 'ambient',
  instrument: 'existing',
});

const MODE_POLICY = Object.freeze({
  focus: Object.freeze({
    rateRange: Object.freeze({ min: 12, max: 16 }),
    defaultHz: 16,
    depth: 0.5,
    icBand: Object.freeze({ lo: 2.4, hi: 3.4 }),
  }),
  relax: Object.freeze({
    rateRange: Object.freeze({ min: 8, max: 12 }),
    defaultHz: 10,
    depth: 0.4,
    icBand: Object.freeze({ lo: 2.0, hi: 3.2 }),
  }),
});

const STYLE_POLICY = Object.freeze({
  ambient: Object.freeze({
    focus: Object.freeze({
      bpm: 96,
      rootMidi: 50, // D3, D dorian
      scale: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
      chords: Object.freeze([
        Object.freeze([50, 53, 57, 64]),
        Object.freeze([55, 59, 62, 65]),
        Object.freeze([60, 64, 67, 71]),
        Object.freeze([57, 60, 64, 67]),
      ]),
      density: 0.56,
      groove: 0.42,
      brightness: 2200,
      pad: true,
      bassPattern: 'pulse',
    }),
    relax: Object.freeze({
      bpm: 72,
      rootMidi: 48, // C3, C major
      scale: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      chords: Object.freeze([
        Object.freeze([48, 52, 55, 59]),
        Object.freeze([53, 57, 60, 64]),
        Object.freeze([45, 48, 52, 55]),
        Object.freeze([55, 59, 62, 65]),
      ]),
      density: 0.34,
      groove: 0.16,
      brightness: 1450,
      pad: true,
      bassPattern: 'sustain',
    }),
  }),
  classical: Object.freeze({
    focus: Object.freeze({
      bpm: 88,
      rootMidi: 45, // A2, A natural minor
      scale: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
      chords: Object.freeze([
        Object.freeze([45, 48, 52]),
        Object.freeze([50, 53, 57]),
        Object.freeze([55, 59, 62]),
        Object.freeze([48, 52, 55]),
      ]),
      density: 0.46,
      groove: 0.12,
      brightness: 2600,
      pad: false,
      bassPattern: 'alberti',
    }),
    relax: Object.freeze({
      bpm: 68,
      rootMidi: 48, // C3, C major
      scale: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      chords: Object.freeze([
        Object.freeze([48, 52, 55]),
        Object.freeze([45, 48, 52]),
        Object.freeze([50, 53, 57]),
        Object.freeze([43, 47, 50]),
      ]),
      density: 0.3,
      groove: 0.06,
      brightness: 2100,
      pad: false,
      bassPattern: 'alberti',
    }),
  }),
  baroque: Object.freeze({
    focus: Object.freeze({
      bpm: 104,
      rootMidi: 50, // D3, D harmonic minor
      scale: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
      chords: Object.freeze([
        Object.freeze([50, 53, 57]),
        Object.freeze([43, 46, 50]),
        Object.freeze([45, 49, 52]),
        Object.freeze([50, 53, 57]),
      ]),
      density: 0.5,
      groove: 0.14,
      brightness: 3600,
      pad: false,
      bassPattern: 'walking',
    }),
    relax: Object.freeze({
      bpm: 76,
      rootMidi: 48, // C3, C major
      scale: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      chords: Object.freeze([
        Object.freeze([48, 52, 55]),
        Object.freeze([45, 48, 52]),
        Object.freeze([50, 53, 57]),
        Object.freeze([43, 47, 50]),
      ]),
      density: 0.34,
      groove: 0.08,
      brightness: 3000,
      pad: false,
      bassPattern: 'walking',
    }),
  }),
});

function clampNumber(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeAudioSettings(raw = {}) {
  return {
    focusHz: clampNumber(raw.focusHz, STORAGE_DEFAULTS.focusHz, MODE_POLICY.focus.rateRange),
    relaxHz: clampNumber(raw.relaxHz, STORAGE_DEFAULTS.relaxHz, MODE_POLICY.relax.rateRange),
    musicStyle: STYLES.includes(raw.musicStyle) ? raw.musicStyle : STORAGE_DEFAULTS.musicStyle,
    instrument: INSTRUMENTS.includes(raw.instrument) ? raw.instrument : STORAGE_DEFAULTS.instrument,
  };
}

export function profileFor(mode, rawSettings = {}) {
  if (!MODES.includes(mode)) throw new RangeError(`Unsupported neural mode: ${mode}`);
  const settings = normalizeAudioSettings(rawSettings);
  const neural = MODE_POLICY[mode];
  const composition = STYLE_POLICY[settings.musicStyle][mode];
  return {
    mode,
    style: settings.musicStyle,
    instrument: settings.instrument,
    modFreq: mode === 'focus' ? settings.focusHz : settings.relaxHz,
    depth: neural.depth,
    rateRange: { ...neural.rateRange },
    icBand: { ...neural.icBand },
    bpm: composition.bpm,
    rootMidi: composition.rootMidi,
    scale: [...composition.scale],
    chords: composition.chords.map((chord) => [...chord]),
    density: composition.density,
    groove: composition.groove,
    brightness: composition.brightness,
    pad: composition.pad,
    bassPattern: composition.bassPattern,
  };
}
