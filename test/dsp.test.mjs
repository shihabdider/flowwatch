import test from 'node:test';
import assert from 'node:assert/strict';

import { amEnvelope, dominantFrequency } from '../audio/dsp.mjs';
import { profileFor } from '../audio/policy.mjs';

for (const [mode, modFreq, depth] of [
  ['focus', 12, 0.5],
  ['relax', 8, 0.4],
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

test('sampled profiles preserve keyboard attacks with subtle early reflections', () => {
  for (const mode of ['focus', 'relax']) {
    const piano = profileFor(mode, { musicStyle: 'classical' });
    const harpsichord = profileFor(mode, { musicStyle: 'baroque' });

    assert.ok(piano.brightness >= 8000 && piano.brightness <= 10000);
    assert.ok(harpsichord.brightness >= 10000 && harpsichord.brightness <= 12000);
    for (const profile of [piano, harpsichord]) {
      assert.ok(profile.room.delaySeconds >= 0.035 && profile.room.delaySeconds <= 0.06);
      assert.ok(profile.room.feedback >= 0 && profile.room.feedback <= 0.08);
      assert.ok(profile.room.wet >= 0 && profile.room.wet <= 0.1);
    }
  }
});

test('ambient profiles preserve their existing brightness and delay mix', () => {
  const focus = profileFor('focus', { musicStyle: 'ambient' });
  const relax = profileFor('relax', { musicStyle: 'ambient' });

  assert.equal(focus.brightness, 2200);
  assert.equal(relax.brightness, 1450);
  assert.deepEqual(focus.room, { delaySeconds: 0.32, feedback: 0.22, wet: 0.24 });
  assert.deepEqual(relax.room, { delaySeconds: 0.32, feedback: 0.22, wet: 0.24 });
});

test('Electronic profiles use a brighter focus mix and spacious bounded delay', () => {
  const focus = profileFor('focus', { musicStyle: 'electronic' });
  const relax = profileFor('relax', { musicStyle: 'electronic' });

  assert.ok(focus.brightness >= 4500 && focus.brightness <= 6000);
  assert.ok(relax.brightness >= 3000 && relax.brightness < focus.brightness);
  for (const profile of [focus, relax]) {
    assert.ok(profile.room.delaySeconds >= 0.2 && profile.room.delaySeconds <= 0.35);
    assert.ok(profile.room.feedback >= 0.2 && profile.room.feedback <= 0.3);
    assert.ok(profile.room.wet >= 0.18 && profile.room.wet <= 0.28);
  }
});

test('invalid envelope parameters are rejected', () => {
  assert.throws(() => amEnvelope(10, 100, { modFreq: 0, depth: 0.5 }), /modFreq/);
  assert.throws(() => amEnvelope(10, 100, { modFreq: 10, depth: 2 }), /depth/);
});
