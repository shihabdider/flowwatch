import test from 'node:test';
import assert from 'node:assert/strict';

import { NeuralAudioEngine } from '../audio/engine.mjs';

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeNode {
  connect(target) { return target; }
  disconnect() {}
}

class FakeGain extends FakeNode { constructor() { super(); this.gain = new FakeParam(1); } }
class FakeFilter extends FakeNode {
  constructor() { super(); this.type = ''; this.frequency = new FakeParam(); this.Q = new FakeParam(); }
}
class FakeDelay extends FakeNode { constructor() { super(); this.delayTime = new FakeParam(); } }
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
class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
  }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.state = 'running';
    this.destination = new FakeNode();
    this.oscillators = [];
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
  async resume() { this.state = 'running'; }
}

test('browser engine builds one broadband graph and can replace then stop playback', async () => {
  const engine = new NeuralAudioEngine(FakeAudioContext);
  await engine.play('focus', { focusHz: 13, musicStyle: 'baroque', instrument: 'harpsichord' });
  assert.equal(engine.currentMode, 'focus');
  assert.equal(engine.activeGraph.profile.modFreq, 13);
  assert.equal(engine.activeGraph.profile.style, 'baroque');
  assert.ok(engine.context.oscillators.length > 10);
  assert.ok(engine.context.oscillators.every((oscillator) => oscillator.started));

  await engine.play('relax', { relaxHz: 9, musicStyle: 'classical', instrument: 'piano' });
  assert.equal(engine.currentMode, 'relax');
  assert.equal(engine.activeGraph.profile.modFreq, 9);
  engine.stop();
  assert.equal(engine.currentMode, null);
  assert.equal(engine.activeGraph, null);
  assert.equal(engine.scheduler, null);
});
