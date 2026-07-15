import test from 'node:test';
import assert from 'node:assert/strict';

import { NeuralAudioEngine } from '../audio/engine.mjs';
import { InstrumentRenderer } from '../audio/instruments.mjs';
import { profileFor } from '../audio/policy.mjs';

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor() { this.connections = []; }
  connect(target) {
    this.connections.push(target);
    return target;
  }
  disconnect() { this.disconnected = true; }
}

class FakeGain extends FakeNode {
  constructor() { super(); this.gain = new FakeParam(1); }
}

class FakeFilter extends FakeNode {
  constructor() { super(); this.type = ''; this.frequency = new FakeParam(); this.Q = new FakeParam(); }
}

class FakeDelay extends FakeNode {
  constructor() { super(); this.delayTime = new FakeParam(); }
}

class FakeCompressor extends FakeNode {
  constructor() {
    super();
    this.threshold = new FakeParam();
    this.knee = new FakeParam();
    this.ratio = new FakeParam();
    this.attack = new FakeParam();
    this.release = new FakeParam();
  }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

class FakeOscillator extends FakeSource {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this.type = 'sine';
  }
}

class FakeBufferSource extends FakeSource {
  constructor() {
    super();
    this.playbackRate = new FakeParam(1);
    this.buffer = null;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.state = 'running';
    this.destination = new FakeNode();
    this.oscillators = [];
    this.bufferSources = [];
    this.decodeCalls = 0;
  }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDelay() { return new FakeDelay(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }
  async decodeAudioData(encoded) {
    this.decodeCalls++;
    return { encoded, id: this.decodeCalls };
  }
  async resume() { this.state = 'running'; }
}

const localFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

class DeferredInstruments {
  constructor() {
    this.requests = [];
    this.releaseCalls = 0;
  }
  prepare(context, voice) {
    const preparation = deferred();
    const started = deferred();
    const request = { context, voice, preparation, started };
    this.requests.push(request);
    started.resolve();
    return preparation.promise;
  }
  schedule() {}
  release() { this.releaseCalls++; }
}

test('profile-owned processing feeds one downstream whole-mix AM graph', () => {
  for (const musicStyle of ['ambient', 'classical', 'baroque']) {
    const engine = new NeuralAudioEngine(FakeAudioContext);
    engine.context = new FakeAudioContext();
    const profile = profileFor('focus', { focusHz: 13, musicStyle });
    const graph = engine.createGraph(profile, { kind: 'test' });

    assert.equal(graph.filter.frequency.value, profile.brightness);
    assert.equal(graph.delay.delayTime.value, profile.room.delaySeconds);
    assert.equal(graph.feedback.gain.value, profile.room.feedback);
    assert.equal(graph.wet.gain.value, profile.room.wet);
    assert.deepEqual(graph.musicBus.connections, [graph.filter]);
    assert.deepEqual(graph.filter.connections, [graph.dry, graph.delay]);
    assert.deepEqual(graph.dry.connections, [graph.amGain]);
    assert.deepEqual(graph.delay.connections, [graph.feedback, graph.wet]);
    assert.deepEqual(graph.feedback.connections, [graph.delay]);
    assert.deepEqual(graph.wet.connections, [graph.amGain]);
    assert.deepEqual(graph.amGain.connections, [graph.compressor]);
    assert.deepEqual(graph.compressor.connections, [graph.master]);
    assert.deepEqual(graph.master.connections, [engine.context.destination]);
    assert.deepEqual(graph.lfo.connections, [graph.lfoDepth]);
    assert.deepEqual(graph.lfoDepth.connections, [graph.amGain.gain]);
    assert.equal(graph.amGain.gain.value, 1 - profile.depth / 2);
    assert.equal(graph.lfoDepth.gain.value, profile.depth / 2);
    assert.equal(graph.lfo.frequency.value, 13);
  }
});

test('stop invalidates a play request still preparing samples', async () => {
  const instruments = new DeferredInstruments();
  const engine = new NeuralAudioEngine(FakeAudioContext, instruments);
  const playing = engine.play('focus', { musicStyle: 'classical' });
  while (instruments.requests.length === 0) await Promise.resolve();

  engine.stop();
  instruments.requests[0].preparation.resolve({ kind: 'sample', voice: 'piano' });
  await playing;

  assert.equal(engine.activeGraph, null);
  assert.equal(engine.currentMode, null);
  assert.equal(engine.scheduler, null);
});

test('overlapping play requests allow only the newest prepared graph to start', async (t) => {
  const instruments = new DeferredInstruments();
  const engine = new NeuralAudioEngine(FakeAudioContext, instruments);
  t.after(() => engine.stop());

  const first = engine.play('focus', { musicStyle: 'classical' });
  while (instruments.requests.length < 1) await Promise.resolve();
  const second = engine.play('relax', { musicStyle: 'baroque' });
  while (instruments.requests.length < 2) await Promise.resolve();
  instruments.requests[0].preparation.resolve({ kind: 'sample', voice: 'piano' });
  await first;
  assert.equal(engine.activeGraph, null);

  instruments.requests[1].preparation.resolve({ kind: 'sample', voice: 'harpsichord' });
  await second;
  assert.equal(engine.activeGraph.profile.style, 'baroque');
  assert.equal(engine.currentMode, 'relax');
});

test('engine prepares each style-owned sampled voice behind one broadband graph', async (t) => {
  const instruments = new InstrumentRenderer(localFetch);
  const engine = new NeuralAudioEngine(FakeAudioContext, instruments);
  t.after(() => engine.stop());

  await engine.play('focus', { focusHz: 13, musicStyle: 'classical', instrument: 'harpsichord' });
  assert.equal(engine.currentMode, 'focus');
  assert.equal(engine.activeGraph.profile.modFreq, 13);
  assert.equal(engine.activeGraph.profile.style, 'classical');
  assert.equal(engine.activeGraph.profile.voice, 'piano');
  assert.equal(engine.activeGraph.preparedVoice.kind, 'sample');
  assert.equal(engine.activeGraph.lfo.frequency.value, 13);
  assert.ok(engine.context.decodeCalls > 0);
  const pianoDecodeCalls = engine.context.decodeCalls;
  assert.ok(engine.context.bufferSources.length > 10);
  assert.ok(engine.context.bufferSources.every((source) => source.started));

  await engine.play('relax', { relaxHz: 9, musicStyle: 'baroque', instrument: 'piano' });
  assert.equal(engine.currentMode, 'relax');
  assert.equal(engine.activeGraph.profile.modFreq, 9);
  assert.equal(engine.activeGraph.profile.voice, 'harpsichord');
  assert.equal(engine.activeGraph.lfo.frequency.value, 9);
  assert.ok(engine.context.decodeCalls > pianoDecodeCalls);
  assert.deepEqual([...instruments.prepared.keys()], ['harpsichord']);

  engine.stop();
  assert.equal(engine.currentMode, null);
  assert.equal(engine.activeGraph, null);
  assert.equal(engine.scheduler, null);
  assert.ok(instruments.sources.size > 0);
  assert.ok(engine.context.bufferSources.every((source) => source.stopped));
  assert.ok(engine.context.bufferSources.some((source) => source.disconnected !== true));
  for (const source of engine.context.bufferSources) source.onended?.();
  assert.equal(instruments.sources.size, 0);
  assert.ok(engine.context.bufferSources.every((source) => source.disconnected));
});

test('consecutive plays of one style exclude the immediately previous key', async (t) => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  const instruments = new InstrumentRenderer(localFetch);
  const engine = new NeuralAudioEngine(FakeAudioContext, instruments);
  t.after(() => {
    Math.random = originalRandom;
    engine.stop();
  });

  await engine.play('focus', { musicStyle: 'baroque' });
  const firstOffset = engine.activeGraph.composer.session.keyOffset;
  await engine.play('focus', { musicStyle: 'baroque' });
  const secondOffset = engine.activeGraph.composer.session.keyOffset;
  assert.notEqual(secondOffset, firstOffset);

  await engine.play('focus', { musicStyle: 'ambient' });
  const ambientFirst = engine.activeGraph.composer.session.keyOffset;
  assert.equal(ambientFirst, firstOffset, 'key memory is independent for each style');
  await engine.play('focus', { musicStyle: 'ambient' });
  assert.notEqual(engine.activeGraph.composer.session.keyOffset, ambientFirst);
});

test('ambient style keeps the local synth without fetching samples', async (t) => {
  let fetches = 0;
  const instruments = new InstrumentRenderer(async () => {
    fetches++;
    return localFetch();
  });
  const engine = new NeuralAudioEngine(FakeAudioContext, instruments);
  t.after(() => engine.stop());
  await engine.play('focus', { musicStyle: 'ambient' });

  assert.equal(engine.activeGraph.profile.voice, 'synth');
  assert.equal(engine.activeGraph.preparedVoice.kind, 'synth');
  assert.equal(fetches, 0);
  assert.ok(engine.context.oscillators.length > 10);
  assert.ok(engine.context.oscillators.every((oscillator) => oscillator.started));
  engine.stop();
});
