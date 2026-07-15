import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InstrumentRenderer,
  SAMPLE_BANKS,
  nearestSampleZone,
  sampleAssets,
  samplePaths,
} from '../audio/instruments.mjs';

class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.value = value; this.events.push(['linear', value, at]); }
  exponentialRampToValueAtTime(value, at) { this.value = value; this.events.push(['exponential', value, at]); }
}

class FakeNode {
  connect(target) { this.connectedTo = target; return target; }
  disconnect() { this.disconnected = true; }
}

class FakeGain extends FakeNode {
  constructor() { super(); this.gain = new FakeParam(1); }
}

class FakePanner extends FakeNode {
  constructor() { super(); this.pan = new FakeParam(0); }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.playbackRate = new FakeParam(1);
    this.startedAt = null;
    this.stoppedAt = null;
    this.onended = null;
    this.buffer = null;
  }
  start(at) { this.startedAt = at; }
  stop(at) { this.stoppedAt = at; }
}

class FakeOscillator extends FakeSource {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this.type = 'sine';
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.decodeCalls = 0;
    this.bufferSources = [];
    this.oscillators = [];
    this.panners = [];
  }
  createGain() { return new FakeGain(); }
  createStereoPanner() {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.bufferSources.push(source);
    return source;
  }
  createOscillator() {
    const source = new FakeOscillator();
    this.oscillators.push(source);
    return source;
  }
  async decodeAudioData(encoded) {
    this.decodeCalls++;
    return { encoded, id: this.decodeCalls, duration: 3.25 };
  }
}

const note = (overrides = {}) => ({
  pitch: 64,
  start: 2,
  duration: 0.5,
  velocity: 0.8,
  role: 'lead',
  ...overrides,
});

const maximumRootDistance = (voice, low, high) => {
  let maximum = 0;
  for (let midi = low; midi <= high; midi++) {
    maximum = Math.max(maximum, Math.abs(nearestSampleZone(voice, midi).rootMidi - midi));
  }
  return maximum;
};

const NOTE_SEMITONES = Object.freeze({ C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 });
const vcslSoundingMidiFromSourcePath = (sourcePath) => {
  const match = sourcePath.match(/_([A-G]#?)(-?\d)_1\.wav$/);
  assert.ok(match, `Could not parse VCSL source note from ${sourcePath}`);
  const [, noteName, notatedOctave] = match;
  return (Number(notatedOctave) + 2) * 12 + NOTE_SEMITONES[noteName];
};

test('Piano catalog has closely spaced local stereo Salamander zones with two velocity layers', () => {
  assert.deepEqual(Object.keys(SAMPLE_BANKS), ['piano', 'harpsichord']);
  const roots = SAMPLE_BANKS.piano.zones.map((zone) => zone.rootMidi);
  assert.equal(roots[0], 30);
  assert.equal(roots.at(-1), 84);
  for (let index = 1; index < roots.length; index++) assert.ok(roots[index] - roots[index - 1] <= 3);
  assert.equal(maximumRootDistance('piano', 31, 84), 1);
  assert.ok(SAMPLE_BANKS.piano.zones.every((zone) => (
    zone.layers.length === 2
    && zone.layers[0].velocityMax < zone.layers[1].velocityMax
    && zone.layers[0].gain === zone.layers[1].gain
    && zone.layers.every((layer) => (
      layer.path.startsWith('./samples/piano/')
      && layer.rootMidi === zone.rootMidi
      && layer.sourcePath?.startsWith('Samples/')
    ))
  )));
});

test('Harpsichord catalog has closely spaced VCSL Italian sustain zones with modeled releases', () => {
  const roots = SAMPLE_BANKS.harpsichord.zones.map((zone) => zone.rootMidi);
  assert.equal(roots[0], 30);
  assert.equal(roots.at(-1), 82);
  for (let index = 1; index < roots.length; index++) assert.ok(roots[index] - roots[index - 1] <= 3);
  assert.equal(maximumRootDistance('harpsichord', 31, 84), 2);
  assert.ok(SAMPLE_BANKS.harpsichord.zones.every((zone) => (
    zone.layers.length === 1
    && zone.layers[0].path.startsWith('./samples/harpsichord/')
    && Number.isFinite(zone.layers[0].rootMidi)
    && zone.release?.path.startsWith('./samples/harpsichord/')
    && Number.isFinite(zone.release.rootMidi)
  )));
  const finalZone = SAMPLE_BANKS.harpsichord.zones.at(-1);
  assert.equal(finalZone.rootMidi, 82);
  assert.equal(finalZone.layers[0].path, './samples/harpsichord/As5-sus.mp3');
  assert.equal(finalZone.layers[0].rootMidi, 82);
  assert.equal(finalZone.release.path, './samples/harpsichord/B5-rel.mp3');
  assert.equal(finalZone.release.rootMidi, 83);
});

test('Harpsichord sustain source metadata stays within approved recorded-source distance', () => {
  const sustainAssets = sampleAssets('harpsichord').filter((asset) => asset.kind === 'sustain');
  assert.equal(sustainAssets.length, SAMPLE_BANKS.harpsichord.zones.length);
  for (const asset of sustainAssets) {
    assert.match(asset.sourcePath, /Sustains\/stop1\/Harpsichord_stop1_[A-G]#?\d_1\.wav$/);
    const documentedSourceRoot = vcslSoundingMidiFromSourcePath(asset.sourcePath);
    assert.equal(documentedSourceRoot, asset.rootMidi);
    assert.ok(
      Math.abs(documentedSourceRoot - asset.zoneRootMidi) <= 3,
      `${asset.path} documented source root ${documentedSourceRoot} is too far from catalog root ${asset.zoneRootMidi}`,
    );
  }
  const finalRelease = sampleAssets('harpsichord').find((asset) => asset.path === './samples/harpsichord/B5-rel.mp3');
  assert.ok(finalRelease);
  assert.equal(vcslSoundingMidiFromSourcePath(finalRelease.sourcePath), 83);
  assert.equal(finalRelease.rootMidi, 83);
  assert.equal(finalRelease.zoneRootMidi, 82);
  assert.match(finalRelease.sourcePath, /Releases\/stop1\/Harpsichord_stop1-rel_B4_1\.wav$/);
});

test('all catalogue paths are unique local nested assets', () => {
  const paths = samplePaths();
  const expectedCount = SAMPLE_BANKS.piano.zones.length * 2 + SAMPLE_BANKS.harpsichord.zones.length * 2;
  assert.equal(paths.length, expectedCount);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((path) => path.startsWith('./samples/') && !/^[a-z]+:/i.test(path)));
});

test('nearest sample selection handles generated range boundaries and invalid requests', () => {
  assert.equal(nearestSampleZone('piano', 31).rootMidi, 30);
  assert.equal(nearestSampleZone('piano', 84).rootMidi, 84);
  assert.equal(nearestSampleZone('harpsichord', 31).rootMidi, 30);
  assert.equal(nearestSampleZone('harpsichord', 84).rootMidi, 82);
  assert.throws(() => nearestSampleZone('piano', Number.NaN), /finite/);
  assert.throws(() => nearestSampleZone('synth', 60), /no sample bank/);
  assert.throws(() => nearestSampleZone('unknown', 60), /no sample bank/);
});

test('sample preparation decodes and caches nested assets once per context and voice', async () => {
  const context = new FakeAudioContext();
  const fetched = [];
  const renderer = new InstrumentRenderer(async (url) => {
    fetched.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  });

  const first = await renderer.prepare(context, 'harpsichord');
  const second = await renderer.prepare(context, 'harpsichord');
  assert.strictEqual(second, first);
  assert.equal(first.kind, 'sample');
  assert.equal(first.zones.length, SAMPLE_BANKS.harpsichord.zones.length);
  assert.equal(fetched.length, samplePaths('harpsichord').length);
  assert.equal(context.decodeCalls, samplePaths('harpsichord').length);
  assert.ok(fetched.every((url) => url.protocol === 'file:'));
});

test('default browser fetch keeps the global receiver required by Window.fetch', async () => {
  const originalFetch = globalThis.fetch;
  const receivers = [];
  globalThis.fetch = async function localSampleFetch() {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };

  try {
    const renderer = new InstrumentRenderer();
    const prepared = await renderer.prepare(new FakeAudioContext(), 'harpsichord');
    assert.equal(prepared.kind, 'sample');
    assert.equal(receivers.length, samplePaths('harpsichord').length);
    assert.ok(receivers.every((receiver) => receiver === globalThis));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('soft and hard Piano notes select different decoded velocity-layer buffers', async () => {
  const context = new FakeAudioContext();
  const renderer = new InstrumentRenderer(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  const prepared = await renderer.prepare(context, 'piano');
  const destination = new FakeNode();
  const soft = renderer.schedule(prepared, note({ pitch: 60, velocity: 0.35 }), destination);
  const hard = renderer.schedule(prepared, note({ pitch: 60, velocity: 0.95, start: 2.2 }), destination);
  const zone = prepared.zones.find((candidate) => candidate.rootMidi === 60);

  assert.equal(soft.buffer, zone.layers[0].buffer);
  assert.equal(hard.buffer, zone.layers[1].buffer);
  assert.notEqual(soft.buffer, hard.buffer);
  assert.equal(context.bufferSources.length, 2);
  assert.ok(soft.stoppedAt >= soft.startedAt + note().duration + 0.4);
  assert.ok(soft.stoppedAt < soft.startedAt + note().duration + 0.6);
  assert.ok(soft.connectedTo.gain.events.some(([kind, , at]) => (
    kind === 'exponential' && at >= soft.startedAt + note().duration + 0.4
  )));
});

test('sample scheduling transposes nearest recordings and modestly places keyboard registers in stereo', async () => {
  const context = new FakeAudioContext();
  const renderer = new InstrumentRenderer(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  const prepared = await renderer.prepare(context, 'piano');
  const destination = new FakeNode();
  const low = renderer.schedule(prepared, note({ pitch: 33, start: 2 }), destination);
  const high = renderer.schedule(prepared, note({ pitch: 72, start: 2.1 }), destination);

  assert.equal(low.buffer, prepared.zones.find((zone) => zone.rootMidi === 33).layers[1].buffer);
  assert.ok(Math.abs(high.playbackRate.value - 1) < 1e-12);
  assert.equal(context.panners.length, 2);
  assert.ok(context.panners[0].pan.value < 0);
  assert.ok(context.panners[1].pan.value > 0);
  assert.equal(renderer.sources.size, 2);

  renderer.release(3);
  assert.equal(renderer.sources.size, 2);
  assert.notEqual(low.disconnected, true);
  assert.notEqual(high.disconnected, true);
  low.onended();
  high.onended();
  assert.equal(renderer.sources.size, 0);
  assert.equal(low.disconnected, true);
  assert.equal(high.disconnected, true);
});

test('Harpsichord schedules sustain plus key-release sample with independent release root', async () => {
  const context = new FakeAudioContext();
  const renderer = new InstrumentRenderer(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  const prepared = await renderer.prepare(context, 'harpsichord');
  const scheduled = renderer.schedule(prepared, note({ pitch: 82, duration: 0.4 }), new FakeNode());
  const zone = prepared.zones.find((candidate) => candidate.rootMidi === 82);

  assert.equal(context.bufferSources.length, 2);
  assert.equal(context.bufferSources[0].buffer, zone.layers[0].buffer);
  assert.equal(context.bufferSources[1].buffer, zone.release.buffer);
  assert.equal(zone.release.path, './samples/harpsichord/B5-rel.mp3');
  assert.equal(zone.release.rootMidi, 83);
  assert.equal(context.bufferSources[0].playbackRate.value, 1);
  assert.ok(Math.abs(context.bufferSources[1].playbackRate.value - (2 ** ((82 - 83) / 12))) < 1e-12);
  assert.equal(context.bufferSources[1].startedAt, 2.4);
  assert.ok(context.bufferSources[1].stoppedAt <= 2.81);
  assert.deepEqual(scheduled, context.bufferSources);
  assert.equal(renderer.sources.size, 2);

  renderer.release(3);
  assert.equal(renderer.sources.size, 2);
  assert.ok(context.bufferSources.every((source) => source.stoppedAt >= 3));
  assert.ok(context.bufferSources.every((source) => source.disconnected !== true));
  for (const source of context.bufferSources) source.onended();
  assert.equal(renderer.sources.size, 0);
  assert.ok(context.bufferSources.every((source) => source.disconnected));
});

test('one failed asset degrades only its zone or layer instead of replacing the whole bank', async () => {
  const context = new FakeAudioContext();
  const warnings = [];
  const renderer = new InstrumentRenderer(async (url) => ({
    ok: !url.pathname.endsWith('/C4-v05.mp3'),
    arrayBuffer: async () => new ArrayBuffer(4),
  }), (message) => warnings.push(message));
  const prepared = await renderer.prepare(context, 'piano');
  const c4 = prepared.zones.find((zone) => zone.rootMidi === 60);

  assert.equal(prepared.kind, 'sample');
  assert.equal(prepared.degradedAssetCount, 1);
  assert.equal(c4.layers.length, 1);
  assert.ok(c4.layers[0].path.endsWith('/C4-v13.mp3'));
  assert.match(warnings[0], /degraded piano sample bank.*1 asset/i);
});

test('decode failure uses oscillator fallback and emits an observable warning without caching failure', async () => {
  const context = new FakeAudioContext();
  const warnings = [];
  let fetches = 0;
  const renderer = new InstrumentRenderer(async () => {
    fetches++;
    return { ok: false };
  }, (message) => warnings.push(message));
  const prepared = await renderer.prepare(context, 'harpsichord');
  const firstFetchCount = fetches;
  assert.equal(prepared.kind, 'synth-fallback');
  assert.match(prepared.error, /Could not load local sample/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /harpsichord.*oscillator fallback/i);

  const retried = await renderer.prepare(context, 'harpsichord');
  assert.equal(retried.kind, 'synth-fallback');
  assert.ok(fetches > firstFetchCount);
  assert.equal(warnings.length, 2);

  const sources = renderer.schedule(prepared, note({ pitch: 60 }), new FakeNode());
  assert.equal(sources.length, 4);
  assert.equal(context.oscillators.length, 4);
  assert.ok(context.oscillators.every((source) => source.startedAt === 2));
});

test('ambient synth preparation performs no sample fetch', async () => {
  const context = new FakeAudioContext();
  let fetches = 0;
  const renderer = new InstrumentRenderer(async () => {
    fetches++;
    throw new Error('should not fetch');
  });
  const prepared = await renderer.prepare(context, 'synth');
  renderer.schedule(prepared, note({ role: 'pad' }), new FakeNode());
  assert.equal(prepared.kind, 'synth');
  assert.equal(fetches, 0);
  assert.equal(context.oscillators.length, 3);
});
