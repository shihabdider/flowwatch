import { StyleComposer } from './composition.mjs';
import { InstrumentRenderer } from './instruments.mjs';
import { normalizeAudioSettings, profileFor } from './policy.mjs';

const MIN_GAIN = 0.0001;

/**
 * Native-Web-Audio shell for pure composition, local voices, and broadband AM.
 * One graph is active at a time; timer callers see only mode and settings.
 */
export class NeuralAudioEngine {
  constructor(
    AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
    instruments = new InstrumentRenderer(),
  ) {
    this.AudioContextClass = AudioContextClass;
    this.instruments = instruments;
    this.context = null;
    this.activeGraph = null;
    this.scheduler = null;
    this.currentMode = null;
    this.currentSettings = normalizeAudioSettings();
    this.playGeneration = 0;
    this.lastKeyOffsetByStyle = new Map();
  }

  async ensureContext() {
    if (!this.AudioContextClass) throw new Error('Web Audio is unavailable');
    if (!this.context || this.context.state === 'closed') this.context = new this.AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  createGraph(profile, preparedVoice, compositionOptions = {}) {
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
    delay.delayTime.value = profile.room.delaySeconds;
    feedback.gain.value = profile.room.feedback;
    wet.gain.value = profile.room.wet;

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
      preparedVoice,
      composer: new StyleComposer(6, Math.random, {
        avoidKeyOffset: Number.isFinite(compositionOptions.avoidKeyOffset)
          ? compositionOptions.avoidKeyOffset
          : this.lastKeyOffsetByStyle.get(profile.style),
      }),
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
      nextChunkTime: now + 0.08,
      playing: true,
    };
  }

  scheduleChunk(startTime, graph) {
    const chunk = graph.composer.next(graph.profile);
    if (Number.isFinite(chunk.tonicMidi)) {
      this.lastKeyOffsetByStyle.set(graph.profile.style, chunk.tonicMidi - graph.profile.rootMidi);
    }
    for (const musicalEvent of chunk.events) {
      this.instruments.schedule(
        graph.preparedVoice,
        { ...musicalEvent, start: startTime + musicalEvent.start },
        graph.musicBus,
      );
    }
    return chunk.duration;
  }

  scheduleAhead() {
    const graph = this.activeGraph;
    if (!graph?.playing) return;
    const horizon = this.context.currentTime + 3;
    while (graph.nextChunkTime < horizon) {
      graph.nextChunkTime += this.scheduleChunk(graph.nextChunkTime, graph);
    }
  }

  keyOffsetForStyle(style) {
    return this.lastKeyOffsetByStyle.get(style);
  }

  async play(mode, rawSettings = {}, compositionOptions = {}) {
    const settings = normalizeAudioSettings(rawSettings);
    const profile = profileFor(mode, settings);
    const generation = ++this.playGeneration;
    this.stopGraph();
    const context = await this.ensureContext();
    if (generation !== this.playGeneration) return false;
    const preparedVoice = await this.instruments.prepare(context, profile.voice);
    if (generation !== this.playGeneration) return false;
    this.currentMode = mode;
    this.currentSettings = settings;
    this.activeGraph = this.createGraph(profile, preparedVoice, compositionOptions);
    this.scheduleAhead();
    this.scheduler = setInterval(() => this.scheduleAhead(), 500);
    return true;
  }

  async update(rawSettings = {}) {
    const mode = this.currentMode;
    this.currentSettings = normalizeAudioSettings(rawSettings);
    if (mode) await this.play(mode, this.currentSettings);
  }

  stop() {
    this.playGeneration++;
    this.stopGraph();
  }

  stopGraph() {
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
    this.instruments.release(now + 0.2);

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
