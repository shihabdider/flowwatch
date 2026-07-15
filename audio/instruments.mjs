// Local voice rendering. Style-to-voice policy stays in policy.mjs; this module
// owns sample zones, decoding/cache behavior, and Web Audio note sources.

const MIN_GAIN = 0.0001;
const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const optionalRoot = (rootMidi) => (Number.isFinite(rootMidi) ? { rootMidi } : {});
const optionalSourcePath = (sourcePath) => (sourcePath ? { sourcePath } : {});
const freezeLayer = (path, velocityMax = 1, gain = 1, rootMidi = null, sourcePath = null) => Object.freeze({
  path,
  velocityMax,
  gain,
  ...optionalRoot(rootMidi),
  ...optionalSourcePath(sourcePath),
});
const freezeRelease = (path, gain = 1, rootMidi = null, sourcePath = null) => Object.freeze({
  path,
  gain,
  ...optionalRoot(rootMidi),
  ...optionalSourcePath(sourcePath),
});
const freezeZone = (rootMidi, layers, { gain = 1, release = null } = {}) => Object.freeze({
  rootMidi,
  gain,
  layers: Object.freeze(layers),
  ...(release ? { release } : {}),
});
const freezeBank = (zones) => Object.freeze({
  kind: 'sample',
  zones: Object.freeze(zones),
});

const PIANO_ZONE_NOTES = Object.freeze([
  ['Fs1', 30], ['A1', 33], ['C2', 36], ['Ds2', 39], ['Fs2', 42], ['A2', 45],
  ['C3', 48], ['Ds3', 51], ['Fs3', 54], ['A3', 57], ['C4', 60], ['Ds4', 63],
  ['Fs4', 66], ['A4', 69], ['C5', 72], ['Ds5', 75], ['Fs5', 78], ['A5', 81],
  ['C6', 84],
]);

const HARPSICHORD_ZONE_NOTES = Object.freeze([
  ['Fs1', 30, 'F#0'], ['Gs1', 32, 'G#0'], ['As1', 34, 'A#0'],
  ['Cs2', 37, 'C#1'], ['Ds2', 39, 'D#1'], ['Fs2', 42, 'F#1'], ['Gs2', 44, 'G#1'], ['As2', 46, 'A#1'],
  ['Cs3', 49, 'C#2'], ['Ds3', 51, 'D#2'], ['Fs3', 54, 'F#2'], ['Gs3', 56, 'G#2'], ['As3', 58, 'A#2'],
  ['Cs4', 61, 'C#3'], ['Ds4', 63, 'D#3'], ['Fs4', 66, 'F#3'], ['Gs4', 68, 'G#3'], ['As4', 70, 'A#3'],
  ['Cs5', 73, 'C#4'], ['Ds5', 75, 'D#4'], ['Fs5', 78, 'F#4'], ['Gs5', 80, 'G#4'], ['As5', 82, 'A#4', 'B5', 83, 'B4'],
]);

const pianoZone = ([name, rootMidi]) => {
  const sourceName = name.replace('s', '#');
  return freezeZone(rootMidi, [
    freezeLayer(`./samples/piano/${name}-v05.mp3`, 0.62, 1, rootMidi, `Samples/${sourceName}v5.flac`),
    freezeLayer(`./samples/piano/${name}-v13.mp3`, 1, 1, rootMidi, `Samples/${sourceName}v13.flac`),
  ], { gain: 0.9 });
};

const VCSL_ITALIAN_HARPSICHORD_BASE = 'Chordophones/Zithers/Harpsichord, Italian';
const vcslItalianHarpsichordPath = (kind, note) => {
  if (kind === 'sustain') {
    return `${VCSL_ITALIAN_HARPSICHORD_BASE}/Sustains/stop1/Harpsichord_stop1_${note}_1.wav`;
  }
  return `${VCSL_ITALIAN_HARPSICHORD_BASE}/Releases/stop1/Harpsichord_stop1-rel_${note}_1.wav`;
};

const harpsichordZone = ([name, rootMidi, sustainSourceNote, releaseName = name, releaseRootMidi = rootMidi, releaseSourceNote = sustainSourceNote]) => freezeZone(rootMidi, [
  freezeLayer(
    `./samples/harpsichord/${name}-sus.mp3`,
    1,
    1,
    rootMidi,
    vcslItalianHarpsichordPath('sustain', sustainSourceNote),
  ),
], {
  gain: 0.82,
  release: freezeRelease(
    `./samples/harpsichord/${releaseName}-rel.mp3`,
    0.22,
    releaseRootMidi,
    vcslItalianHarpsichordPath('release', releaseSourceNote),
  ),
});

export const SAMPLE_BANKS = Object.freeze({
  piano: freezeBank(PIANO_ZONE_NOTES.map(pianoZone)),
  harpsichord: freezeBank(HARPSICHORD_ZONE_NOTES.map(harpsichordZone)),
});

const zoneAssets = (voice, zone) => [
  ...zone.layers.map((layer) => ({
    voice,
    kind: 'sustain',
    path: layer.path,
    rootMidi: layer.rootMidi ?? zone.rootMidi,
    zoneRootMidi: zone.rootMidi,
    sourcePath: layer.sourcePath ?? null,
  })),
  ...(zone.release ? [{
    voice,
    kind: 'release',
    path: zone.release.path,
    rootMidi: zone.release.rootMidi ?? zone.rootMidi,
    zoneRootMidi: zone.rootMidi,
    sourcePath: zone.release.sourcePath ?? null,
  }] : []),
];

export function sampleAssets(voice) {
  if (voice !== undefined) {
    const bank = SAMPLE_BANKS[voice];
    if (!bank) throw new RangeError(`Voice has no sample bank: ${voice}`);
    return bank.zones.flatMap((zone) => zoneAssets(voice, zone));
  }
  return Object.entries(SAMPLE_BANKS).flatMap(([bankVoice, bank]) => bank.zones.flatMap((zone) => zoneAssets(bankVoice, zone)));
}

export function samplePaths(voice) {
  return sampleAssets(voice).map((asset) => asset.path);
}

function nearestZone(zones, midi) {
  return zones.reduce((nearest, zone) => (
    Math.abs(zone.rootMidi - midi) < Math.abs(nearest.rootMidi - midi) ? zone : nearest
  ));
}

export function nearestSampleZone(voice, midi) {
  if (!Number.isFinite(midi)) throw new RangeError('MIDI pitch must be finite');
  const bank = SAMPLE_BANKS[voice];
  if (!bank) throw new RangeError(`Voice has no sample bank: ${voice}`);
  return nearestZone(bank.zones, midi);
}

export function selectSampleLayer(zone, velocity = 1) {
  const boundedVelocity = clamp(Number.isFinite(velocity) ? velocity : 1, 0, 1);
  return zone.layers.find((layer) => boundedVelocity <= layer.velocityMax) ?? zone.layers.at(-1);
}

function roleLevel(role) {
  if (role === 'bass') return 0.13;
  if (role === 'pad') return 0.085;
  if (role === 'accompaniment') return 0.1;
  if (role === 'counter') return 0.075;
  if (role === 'ornament') return 0.105;
  if (role === 'harmony') return 0.115;
  return 0.145;
}

function oscillatorEnvelope(voice, role, duration) {
  const level = roleLevel(role);
  if (voice === 'piano') {
    return { attack: 0.008, decay: 0.8, sustain: 0.1, release: 0.35, level: level * 1.05 };
  }
  if (voice === 'harpsichord') {
    return { attack: 0.003, decay: Math.min(0.55, duration * 0.55), sustain: 0.025, release: 0.08, level: level * 0.85 };
  }
  if (role === 'pad') {
    return { attack: 0.75, decay: 0.5, sustain: 0.72, release: 1.25, level };
  }
  return { attack: 0.025, decay: 0.35, sustain: 0.34, release: 0.5, level };
}

function oscillatorPartials(voice, role) {
  if (voice === 'piano') {
    return [
      { ratio: 1, type: 'triangle', gain: 0.62 },
      { ratio: 2, type: 'sine', gain: 0.24 },
      { ratio: 3, type: 'sine', gain: 0.1 },
      { ratio: 4, type: 'sine', gain: 0.04 },
    ];
  }
  if (voice === 'harpsichord') {
    return [
      { ratio: 1, type: 'sawtooth', gain: 0.5 },
      { ratio: 2, type: 'square', gain: 0.17 },
      { ratio: 3, type: 'sine', gain: 0.1 },
      { ratio: 4, type: 'sine', gain: 0.06 },
    ];
  }
  if (role === 'pad') {
    return [
      { ratio: 1, type: 'sine', gain: 0.45, detune: -6 },
      { ratio: 1, type: 'sine', gain: 0.45, detune: 6 },
      { ratio: 2, type: 'sine', gain: 0.1 },
    ];
  }
  return [
    { ratio: 1, type: 'sine', gain: 0.82 },
    { ratio: role === 'bass' ? 2 : 3, type: 'triangle', gain: 0.18 },
  ];
}

function scheduleGainEnvelope(param, start, duration, envelope, peak) {
  const attackEnd = start + Math.min(envelope.attack, duration * 0.3);
  const decayEnd = Math.min(start + duration * 0.7, attackEnd + envelope.decay);
  const releaseStart = Math.max(decayEnd, start + duration);
  const stopAt = releaseStart + envelope.release;
  param.setValueAtTime(MIN_GAIN, start);
  param.linearRampToValueAtTime(peak, attackEnd);
  param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * envelope.sustain), decayEnd);
  param.setValueAtTime(Math.max(MIN_GAIN, peak * envelope.sustain), releaseStart);
  param.exponentialRampToValueAtTime(MIN_GAIN, stopAt);
  return stopAt;
}

function sampleVelocityLevel(voice, velocity) {
  const boundedVelocity = clamp(Number.isFinite(velocity) ? velocity : 1, 0.05, 1);
  if (voice === 'piano') return 0.42 + boundedVelocity * 0.72;
  return 0.72 + boundedVelocity * 0.28;
}

function keyboardPan(midi) {
  return clamp((midi - 60) / 48, -0.32, 0.32);
}

function connectKeyboardSource(context, source, gain, destination, pitch) {
  if (typeof context.createStereoPanner !== 'function') {
    source.connect(gain).connect(destination);
    return { connectedNodes: [gain], panner: null };
  }
  const panner = context.createStereoPanner();
  panner.pan.setValueAtTime(keyboardPan(pitch), context.currentTime);
  source.connect(gain).connect(panner).connect(destination);
  return { connectedNodes: [gain, panner], panner };
}

function samplePlayDuration(buffer, playbackRate, fallback) {
  const bufferDuration = Number(buffer?.duration);
  if (!Number.isFinite(bufferDuration) || bufferDuration <= 0) return fallback;
  return bufferDuration / Math.max(0.01, playbackRate);
}

function startSampleGain(param, start, peak) {
  param.setValueAtTime(MIN_GAIN, start);
  param.linearRampToValueAtTime(peak, start + 0.002);
}

function finishSampleGain(param, start, stopAt, peak) {
  const fadeStart = Math.max(start + 0.006, stopAt - 0.035);
  param.setValueAtTime(peak, fadeStart);
  param.linearRampToValueAtTime(MIN_GAIN, stopAt);
}

function dampPianoGain(param, releaseStart, stopAt, peak) {
  param.setValueAtTime(peak, releaseStart);
  param.exponentialRampToValueAtTime(MIN_GAIN, stopAt);
}

/** Imperative Web Audio voice adapter with context-local decoded sample caches. */
export class InstrumentRenderer {
  constructor(
    fetchFn = globalThis.fetch?.bind(globalThis),
    warnFn = globalThis.console?.warn?.bind(globalThis.console),
  ) {
    this.fetchFn = fetchFn;
    this.warnFn = warnFn;
    this.context = null;
    this.prepared = new Map();
    this.sources = new Set();
    this.connectedNodes = new Map();
  }

  async prepare(context, voice) {
    if (!context) throw new TypeError('AudioContext is required');
    if (this.context !== context) {
      this.release();
      this.context = context;
      this.prepared.clear();
    }
    for (const cachedVoice of this.prepared.keys()) {
      if (cachedVoice !== voice) this.prepared.delete(cachedVoice);
    }
    if (this.prepared.has(voice)) return this.prepared.get(voice);

    const preparation = this.prepareUncached(context, voice);
    this.prepared.set(voice, preparation);
    const prepared = await preparation;
    if (prepared.kind === 'synth-fallback' && this.prepared.get(voice) === preparation) {
      this.prepared.delete(voice);
    }
    return prepared;
  }

  async prepareUncached(context, voice) {
    if (voice === 'synth') return { kind: 'synth', voice, context };
    const bank = SAMPLE_BANKS[voice];
    if (!bank) throw new RangeError(`Unsupported voice: ${voice}`);
    try {
      if (typeof this.fetchFn !== 'function') throw new Error('Sample fetch is unavailable');
      const failures = [];
      const decodeAsset = async (asset) => {
        try {
          const url = new URL(asset.path, import.meta.url);
          const response = await this.fetchFn(url);
          if (!response?.ok) throw new Error(`Could not load local sample ${asset.path}`);
          const encoded = await response.arrayBuffer();
          const buffer = await context.decodeAudioData(encoded);
          return Object.freeze({ ...asset, buffer });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
          return null;
        }
      };
      const decodedZones = await Promise.all(bank.zones.map(async (zone) => {
        const layers = (await Promise.all(zone.layers.map(decodeAsset))).filter(Boolean);
        const release = zone.release ? await decodeAsset(zone.release) : null;
        if (layers.length === 0) return null;
        return Object.freeze({
          rootMidi: zone.rootMidi,
          gain: zone.gain,
          layers: Object.freeze(layers),
          ...(release ? { release } : {}),
        });
      }));
      const zones = decodedZones.filter(Boolean);
      if (zones.length === 0) throw new Error(failures[0] ?? `Could not decode ${voice} sample bank`);
      if (failures.length > 0 && typeof this.warnFn === 'function') {
        this.warnFn(`FlowWatch is using a degraded ${voice} sample bank after ${failures.length} asset decode failure${failures.length === 1 ? '' : 's'}.`);
      }
      return {
        kind: 'sample',
        voice,
        context,
        zones: Object.freeze(zones),
        degradedAssetCount: failures.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof this.warnFn === 'function') {
        this.warnFn(`FlowWatch ${voice} sample decode failed; using oscillator fallback: ${message}`);
      }
      return {
        kind: 'synth-fallback',
        voice,
        context,
        error: message,
      };
    }
  }

  schedule(prepared, musicalEvent, destination) {
    if (prepared.context !== this.context) throw new Error('Prepared voice belongs to another AudioContext');
    if (!destination) throw new TypeError('Voice destination is required');
    if (prepared.kind === 'sample') return this.scheduleSample(prepared, musicalEvent, destination);
    return this.scheduleOscillator(prepared, musicalEvent, destination);
  }

  scheduleSample(prepared, musicalEvent, destination) {
    const context = prepared.context;
    const start = Math.max(context.currentTime + 0.005, musicalEvent.start);
    const duration = Math.max(0.06, musicalEvent.duration);
    const zone = nearestZone(prepared.zones, musicalEvent.pitch);
    const layer = selectSampleLayer(zone, musicalEvent.velocity);
    const playbackRate = 2 ** ((musicalEvent.pitch - (layer.rootMidi ?? zone.rootMidi)) / 12);
    const peak = Math.max(
      MIN_GAIN,
      roleLevel(musicalEvent.role)
        * zone.gain
        * layer.gain
        * sampleVelocityLevel(prepared.voice, musicalEvent.velocity),
    );

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = layer.buffer;
    source.playbackRate.value = playbackRate;
    const { connectedNodes } = connectKeyboardSource(context, source, gain, destination, musicalEvent.pitch);
    this.trackSource(source, connectedNodes);

    if (prepared.voice === 'harpsichord' && zone.release) {
      return this.scheduleHarpsichordPair({ context, start, duration, zone, source, gain, peak, musicalEvent, destination });
    }

    startSampleGain(gain.gain, start, peak);
    const naturalStopAt = start
      + samplePlayDuration(layer.buffer, playbackRate, Math.max(2.2, duration + 1.2));
    const releaseStart = start + duration;
    const damping = musicalEvent.role === 'bass' ? 0.65 : 0.45;
    const stopAt = Math.min(naturalStopAt, releaseStart + damping);
    dampPianoGain(gain.gain, releaseStart, stopAt, peak);
    source.start(start);
    source.stop(stopAt + 0.02);
    return source;
  }

  scheduleHarpsichordPair({ context, start, duration, zone, source, gain, peak, musicalEvent, destination }) {
    const releaseStart = start + duration;
    startSampleGain(gain.gain, start, peak);
    gain.gain.setValueAtTime(peak, Math.max(start + 0.004, releaseStart - 0.025));
    gain.gain.linearRampToValueAtTime(MIN_GAIN, releaseStart + 0.025);
    source.start(start);
    source.stop(releaseStart + 0.04);

    const releaseSource = context.createBufferSource();
    const releaseGain = context.createGain();
    const releasePlaybackRate = 2 ** ((musicalEvent.pitch - (zone.release.rootMidi ?? zone.rootMidi)) / 12);
    releaseSource.buffer = zone.release.buffer;
    releaseSource.playbackRate.value = releasePlaybackRate;
    const { connectedNodes } = connectKeyboardSource(context, releaseSource, releaseGain, destination, musicalEvent.pitch);
    this.trackSource(releaseSource, connectedNodes);
    const releasePeak = Math.max(MIN_GAIN, peak * zone.release.gain);
    startSampleGain(releaseGain.gain, releaseStart, releasePeak);
    const releaseDuration = Math.min(
      0.38,
      samplePlayDuration(zone.release.buffer, releasePlaybackRate, 0.38),
    );
    const releaseStopAt = releaseStart + releaseDuration;
    finishSampleGain(releaseGain.gain, releaseStart, releaseStopAt, releasePeak);
    releaseSource.start(releaseStart);
    releaseSource.stop(releaseStopAt + 0.02);
    return [source, releaseSource];
  }

  scheduleOscillator(prepared, musicalEvent, destination) {
    const context = prepared.context;
    const start = Math.max(context.currentTime + 0.005, musicalEvent.start);
    const duration = Math.max(0.06, musicalEvent.duration);
    const envelope = oscillatorEnvelope(prepared.voice, musicalEvent.role, duration);
    const voiceGain = context.createGain();
    const peak = Math.max(MIN_GAIN, envelope.level * Math.max(0.1, musicalEvent.velocity));
    const stopAt = scheduleGainEnvelope(voiceGain.gain, start, duration, envelope, peak);
    voiceGain.connect(destination);

    const sources = [];
    for (const partial of oscillatorPartials(prepared.voice, musicalEvent.role)) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = midiToHz(musicalEvent.pitch) * partial.ratio;
      oscillator.detune.value = partial.detune ?? 0;
      partialGain.gain.value = partial.gain;
      oscillator.connect(partialGain).connect(voiceGain);
      this.trackSource(oscillator, [partialGain]);
      oscillator.start(start);
      oscillator.stop(stopAt + 0.02);
      sources.push(oscillator);
    }
    return sources;
  }

  trackSource(source, connectedNodes = []) {
    this.sources.add(source);
    this.connectedNodes.set(source, connectedNodes);
    source.onended = () => this.cleanupSource(source);
  }

  cleanupSource(source) {
    this.sources.delete(source);
    try { source.disconnect(); } catch (_) {}
    const nodes = this.connectedNodes.get(source) ?? [];
    this.connectedNodes.delete(source);
    for (const node of nodes) {
      try { node.disconnect(); } catch (_) {}
    }
  }

  release(at = this.context?.currentTime ?? 0) {
    for (const source of [...this.sources]) {
      try { source.stop(at + 0.02); } catch (_) {}
    }
  }
}
