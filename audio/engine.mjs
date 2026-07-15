import { PhraseFormer, generatePhrase } from './composition.mjs';
import { normalizeAudioSettings, profileFor } from './policy.mjs';

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const MIN_GAIN = 0.0001;

function envelopeFor(instrument, role, duration) {
  const roleLevel = role === 'bass' ? 0.22 : role === 'pad' ? 0.105 : role === 'counter' ? 0.08 : 0.12;
  if (instrument === 'piano') {
    return { attack: 0.008, decay: 0.8, sustain: 0.1, release: 0.35, level: roleLevel * 1.05 };
  }
  if (instrument === 'harpsichord') {
    return { attack: 0.003, decay: Math.min(0.55, duration * 0.55), sustain: 0.025, release: 0.08, level: roleLevel * 0.85 };
  }
  if (role === 'pad') {
    return { attack: 0.75, decay: 0.5, sustain: 0.72, release: 1.25, level: roleLevel };
  }
  return { attack: 0.025, decay: 0.35, sustain: 0.34, release: 0.5, level: roleLevel };
}

function partialsFor(instrument, role) {
  if (instrument === 'piano') {
    return [
      { ratio: 1, type: 'triangle', gain: 0.62 },
      { ratio: 2, type: 'sine', gain: 0.24 },
      { ratio: 3, type: 'sine', gain: 0.1 },
      { ratio: 4, type: 'sine', gain: 0.04 },
    ];
  }
  if (instrument === 'harpsichord') {
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

/**
 * Native-Web-Audio shell for neuralfm's pure composition and broadband-AM core.
 * One graph is active at a time; style and instrument details never leak to timer callers.
 */
export class NeuralAudioEngine {
  constructor(AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext) {
    this.AudioContextClass = AudioContextClass;
    this.context = null;
    this.activeGraph = null;
    this.scheduler = null;
    this.currentMode = null;
    this.currentSettings = normalizeAudioSettings();
    this.sources = new Set();
  }

  async ensureContext() {
    if (!this.AudioContextClass) throw new Error('Web Audio is unavailable');
    if (!this.context || this.context.state === 'closed') this.context = new this.AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  createGraph(profile) {
    const context = this.context;
    const musicBus = context.createGain();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const wet = context.createGain();
    const amGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const master = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();

    filter.type = 'lowpass';
    filter.frequency.value = profile.brightness;
    filter.Q.value = 0.25;
    dry.gain.value = 0.9;
    delay.delayTime.value = profile.style === 'ambient' ? 0.32 : 0.18;
    feedback.gain.value = profile.style === 'ambient' ? 0.22 : 0.12;
    wet.gain.value = profile.style === 'ambient' ? 0.24 : 0.12;

    musicBus.connect(filter);
    filter.connect(dry).connect(amGain);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(amGain);

    amGain.gain.value = 1 - profile.depth / 2;
    lfo.type = 'sine';
    lfo.frequency.value = profile.modFreq;
    lfoDepth.gain.value = profile.depth / 2;
    lfo.connect(lfoDepth).connect(amGain.gain);

    compressor.threshold.value = -8;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    master.gain.value = 0;
    amGain.connect(compressor).connect(master).connect(context.destination);

    const now = context.currentTime;
    lfo.start(now);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.72, now + 0.7);

    return {
      profile,
      musicBus,
      filter,
      dry,
      delay,
      feedback,
      wet,
      amGain,
      compressor,
      master,
      lfo,
      lfoDepth,
      former: new PhraseFormer(),
      nextChunkTime: now + 0.08,
      playing: true,
    };
  }

  scheduleVoice(pitch, start, duration, velocity, role, graph) {
    if (!graph.playing) return;
    const context = this.context;
    const safeStart = Math.max(context.currentTime + 0.005, start);
    const safeDuration = Math.max(0.06, duration);
    const envelope = envelopeFor(graph.profile.instrument, role, safeDuration);
    const voiceGain = context.createGain();
    const peak = Math.max(MIN_GAIN, envelope.level * Math.max(0.1, velocity));
    const attackEnd = safeStart + Math.min(envelope.attack, safeDuration * 0.3);
    const decayEnd = Math.min(safeStart + safeDuration * 0.7, attackEnd + envelope.decay);
    const releaseStart = Math.max(decayEnd, safeStart + safeDuration);
    const stopAt = releaseStart + envelope.release;

    voiceGain.gain.setValueAtTime(MIN_GAIN, safeStart);
    voiceGain.gain.linearRampToValueAtTime(peak, attackEnd);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak * envelope.sustain), decayEnd);
    voiceGain.gain.setValueAtTime(Math.max(MIN_GAIN, peak * envelope.sustain), releaseStart);
    voiceGain.gain.exponentialRampToValueAtTime(MIN_GAIN, stopAt);
    voiceGain.connect(graph.musicBus);

    for (const partial of partialsFor(graph.profile.instrument, role)) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = midiToHz(pitch) * partial.ratio;
      oscillator.detune.value = partial.detune ?? 0;
      partialGain.gain.value = partial.gain;
      oscillator.connect(partialGain).connect(voiceGain);
      this.sources.add(oscillator);
      oscillator.onended = () => {
        this.sources.delete(oscillator);
        oscillator.disconnect();
        partialGain.disconnect();
      };
      oscillator.start(safeStart);
      oscillator.stop(stopAt + 0.02);
    }
  }

  scheduleHarmony(chord, nextChord, barStart, barDuration, graph) {
    const { profile } = graph;
    if (profile.pad) {
      for (const pitch of chord) this.scheduleVoice(pitch, barStart, barDuration * 0.92, 0.7, 'pad', graph);
    }

    const root = chord[0] - 12;
    if (profile.bassPattern === 'sustain') {
      this.scheduleVoice(root, barStart, barDuration * 0.9, 0.72, 'bass', graph);
      return;
    }

    if (profile.bassPattern === 'pulse') {
      const step = barDuration / 8;
      for (let index = 0; index < 8; index++) {
        const pitch = index % 2 ? chord[0] : root;
        this.scheduleVoice(pitch, barStart + index * step, step * 0.72, index % 2 ? 0.48 : 0.72, 'bass', graph);
      }
      return;
    }

    if (profile.bassPattern === 'alberti') {
      const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
      const step = barDuration / pattern.length;
      for (let index = 0; index < pattern.length; index++) {
        const pitch = chord[pattern[index] % chord.length] + (index === 0 ? -12 : 0);
        this.scheduleVoice(pitch, barStart + index * step, step * 0.78, index % 4 === 0 ? 0.66 : 0.48, 'counter', graph);
      }
      return;
    }

    // Baroque-informed walking bass plus a light broken upper chord. The final bass
    // note approaches the next root by step where possible, while the melody stays independent.
    const beat = barDuration / 4;
    const nextRoot = (nextChord?.[0] ?? chord[0]) - 12;
    const approach = nextRoot > root ? nextRoot - 1 : nextRoot < root ? nextRoot + 1 : chord.at(-1) - 12;
    const bassLine = [root, chord[1] - 12, chord[2] - 12, approach];
    for (let index = 0; index < bassLine.length; index++) {
      this.scheduleVoice(bassLine[index], barStart + index * beat, beat * 0.82, 0.64, 'bass', graph);
    }
    const eighth = barDuration / 8;
    for (let index = 0; index < 8; index++) {
      this.scheduleVoice(
        chord[index % chord.length] + 12,
        barStart + index * eighth,
        eighth * 0.64,
        index % 2 ? 0.35 : 0.5,
        'counter',
        graph,
      );
    }
  }

  scheduleChunk(startTime, graph) {
    const { profile } = graph;
    const barDuration = (60 / profile.bpm) * 4;
    const chunkDuration = barDuration * profile.chords.length;

    for (let bar = 0; bar < profile.chords.length; bar++) {
      const chord = profile.chords[bar];
      const nextChord = profile.chords[(bar + 1) % profile.chords.length];
      this.scheduleHarmony(chord, nextChord, startTime + bar * barDuration, barDuration, graph);
    }

    const phrase = graph.former.next({
      bpm: profile.bpm,
      scale: profile.scale,
      rootMidi: profile.rootMidi,
      bars: profile.chords.length,
      density: profile.density,
      chords: profile.chords,
      groove: profile.groove,
    }, profile.modFreq, profile.icBand);
    for (const note of phrase.notes) {
      this.scheduleVoice(
        note.pitch,
        startTime + note.start,
        note.end - note.start,
        note.velocity,
        'lead',
        graph,
      );
    }

    // A sparse second phrase at a lower register provides slow non-repeating movement
    // without implementing a foreground counterpoint system.
    const counter = generatePhrase({
      bpm: profile.bpm,
      scale: profile.scale,
      rootMidi: profile.rootMidi,
      bars: profile.chords.length,
      density: Math.max(0.1, profile.density * 0.32),
      groove: 0,
      octave: 0,
      legato: 0.92,
    });
    for (const note of counter.notes) {
      this.scheduleVoice(
        note.pitch,
        startTime + note.start,
        note.end - note.start,
        note.velocity * 0.45,
        'counter',
        graph,
      );
    }
    return chunkDuration;
  }

  scheduleAhead() {
    const graph = this.activeGraph;
    if (!graph?.playing) return;
    const horizon = this.context.currentTime + 3;
    while (graph.nextChunkTime < horizon) {
      graph.nextChunkTime += this.scheduleChunk(graph.nextChunkTime, graph);
    }
  }

  async play(mode, rawSettings = {}) {
    const settings = normalizeAudioSettings(rawSettings);
    const profile = profileFor(mode, settings);
    await this.ensureContext();
    this.stop();
    this.currentMode = mode;
    this.currentSettings = settings;
    this.activeGraph = this.createGraph(profile);
    this.scheduleAhead();
    this.scheduler = setInterval(() => this.scheduleAhead(), 500);
  }

  async update(rawSettings = {}) {
    this.currentSettings = normalizeAudioSettings(rawSettings);
    if (this.currentMode) await this.play(this.currentMode, this.currentSettings);
  }

  stop() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    const graph = this.activeGraph;
    this.activeGraph = null;
    this.currentMode = null;
    if (!graph || !this.context) return;

    graph.playing = false;
    const now = this.context.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setValueAtTime(Math.max(MIN_GAIN, graph.master.gain.value), now);
    graph.master.gain.exponentialRampToValueAtTime(MIN_GAIN, now + 0.2);
    try { graph.lfo.stop(now + 0.22); } catch (_) {}
    for (const source of this.sources) {
      try { source.stop(now + 0.23); } catch (_) {}
    }
    this.sources.clear();

    setTimeout(() => {
      for (const node of [
        graph.musicBus,
        graph.filter,
        graph.dry,
        graph.delay,
        graph.feedback,
        graph.wet,
        graph.amGain,
        graph.compressor,
        graph.master,
        graph.lfo,
        graph.lfoDepth,
      ]) {
        try { node.disconnect(); } catch (_) {}
      }
    }, 300);
  }
}
