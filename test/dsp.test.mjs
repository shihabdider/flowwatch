import test from 'node:test';
import assert from 'node:assert/strict';

import { amEnvelope, dominantFrequency } from '../audio/dsp.mjs';
import { profileFor } from '../audio/policy.mjs';

for (const [mode, modFreq, depth] of [
  ['focus', 16, 0.5],
  ['relax', 10, 0.4],
]) {
  test(`${mode} envelope carries the configured modulation rate and depth`, () => {
    const sampleRate = 1024;
    const envelope = amEnvelope(sampleRate * 16, sampleRate, { modFreq, depth });
    assert.ok(Math.abs(dominantFrequency(envelope, sampleRate) - modFreq) < 0.07);
    assert.ok(Math.abs(Math.max(...envelope) - 1) < 1e-6);
    assert.ok(Math.abs(Math.min(...envelope) - (1 - depth)) < 1e-6);
  });
}

test('runtime profile parameters feed the same pure envelope contract', () => {
  const profile = profileFor('focus', { focusHz: 12.5 });
  const envelope = amEnvelope(4096, 1024, profile);
  assert.ok(Math.abs(dominantFrequency(envelope, 1024) - 12.5) < 0.26);
});

test('invalid envelope parameters are rejected', () => {
  assert.throws(() => amEnvelope(10, 100, { modFreq: 0, depth: 0.5 }), /modFreq/);
  assert.throws(() => amEnvelope(10, 100, { modFreq: 10, depth: 2 }), /depth/);
});
