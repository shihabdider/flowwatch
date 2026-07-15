// Audio policy is intentionally data-only. Each musical style owns its voice so
// callers never duplicate rate bounds, style fallbacks, or instrument pairings.

export const MODES = Object.freeze(['focus', 'relax']);
export const STYLES = Object.freeze(['ambient', 'classical', 'baroque']);
export const VOICES = Object.freeze(['synth', 'piano', 'harpsichord']);
export const STYLE_VOICES = Object.freeze({
  ambient: 'synth',
  classical: 'piano',
  baroque: 'harpsichord',
});

export const STORAGE_DEFAULTS = Object.freeze({
  focusHz: 12,
  relaxHz: 8,
  musicStyle: 'ambient',
});

const MODE_POLICY = Object.freeze({
  focus: Object.freeze({
    rateRange: Object.freeze({ min: 12, max: 16 }),
    defaultHz: 12,
    depth: 0.5,
    icBand: Object.freeze({ lo: 2.4, hi: 3.4 }),
  }),
  relax: Object.freeze({
    rateRange: Object.freeze({ min: 8, max: 12 }),
    defaultHz: 8,
    depth: 0.4,
    icBand: Object.freeze({ lo: 2.0, hi: 3.2 }),
  }),
});

const NEARBY_KEY_OFFSETS = Object.freeze([-5, -3, -2, 0, 2, 3, 5]);

const STYLE_POLICY = Object.freeze({
  ambient: Object.freeze({
    keyOffsets: NEARBY_KEY_OFFSETS,
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
      room: Object.freeze({ delaySeconds: 0.32, feedback: 0.22, wet: 0.24 }),
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
      room: Object.freeze({ delaySeconds: 0.32, feedback: 0.22, wet: 0.24 }),
      pad: true,
      bassPattern: 'sustain',
    }),
  }),
  classical: Object.freeze({
    keyOffsets: NEARBY_KEY_OFFSETS,
    focus: Object.freeze({
      bpm: 88,
      rootMidi: 45, // A2, A harmonic minor
      scale: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
      chords: Object.freeze([
        Object.freeze([45, 48, 52]),
        Object.freeze([50, 53, 57]),
        Object.freeze([52, 56, 59]),
        Object.freeze([45, 48, 52]),
      ]),
      density: 0.46,
      groove: 0.12,
      brightness: 10000,
      room: Object.freeze({ delaySeconds: 0.045, feedback: 0.05, wet: 0.08 }),
      pad: false,
      bassPattern: 'alberti',
    }),
    relax: Object.freeze({
      bpm: 68,
      rootMidi: 48, // C3, C major
      scale: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      chords: Object.freeze([
        Object.freeze([48, 52, 55]),
        Object.freeze([53, 57, 60]),
        Object.freeze([55, 59, 62]),
        Object.freeze([48, 52, 55]),
      ]),
      density: 0.3,
      groove: 0.06,
      brightness: 8500,
      room: Object.freeze({ delaySeconds: 0.06, feedback: 0.04, wet: 0.08 }),
      pad: false,
      bassPattern: 'alberti',
    }),
  }),
  baroque: Object.freeze({
    keyOffsets: NEARBY_KEY_OFFSETS,
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
      brightness: 12000,
      room: Object.freeze({ delaySeconds: 0.035, feedback: 0.04, wet: 0.07 }),
      pad: false,
      bassPattern: 'walking',
    }),
    relax: Object.freeze({
      bpm: 76,
      rootMidi: 48, // C3, C major
      scale: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
      chords: Object.freeze([
        Object.freeze([48, 52, 55]),
        Object.freeze([53, 57, 60]),
        Object.freeze([55, 59, 62]),
        Object.freeze([48, 52, 55]),
      ]),
      density: 0.34,
      groove: 0.08,
      brightness: 10500,
      room: Object.freeze({ delaySeconds: 0.05, feedback: 0.035, wet: 0.07 }),
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
  };
}

export function profileFor(mode, rawSettings = {}) {
  if (!MODES.includes(mode)) throw new RangeError(`Unsupported neural mode: ${mode}`);
  const settings = normalizeAudioSettings(rawSettings);
  const neural = MODE_POLICY[mode];
  const style = STYLE_POLICY[settings.musicStyle];
  const composition = style[mode];
  return {
    mode,
    style: settings.musicStyle,
    voice: STYLE_VOICES[settings.musicStyle],
    modFreq: mode === 'focus' ? settings.focusHz : settings.relaxHz,
    depth: neural.depth,
    rateRange: { ...neural.rateRange },
    icBand: { ...neural.icBand },
    keyOffsets: [...style.keyOffsets],
    bpm: composition.bpm,
    rootMidi: composition.rootMidi,
    scale: [...composition.scale],
    chords: composition.chords.map((chord) => [...chord]),
    density: composition.density,
    groove: composition.groove,
    brightness: composition.brightness,
    room: { ...composition.room },
    pad: composition.pad,
    bassPattern: composition.bassPattern,
  };
}
