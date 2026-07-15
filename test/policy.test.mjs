import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENTS,
  MODES,
  STYLES,
  normalizeAudioSettings,
  profileFor,
} from '../audio/policy.mjs';

test('audio settings use approved defaults', () => {
  assert.deepEqual(normalizeAudioSettings({}), {
    focusHz: 16,
    relaxHz: 10,
    musicStyle: 'ambient',
    instrument: 'existing',
  });
});

test('focus and relax rates clamp to their approved ranges', () => {
  assert.equal(normalizeAudioSettings({ focusHz: 4 }).focusHz, 12);
  assert.equal(normalizeAudioSettings({ focusHz: 99 }).focusHz, 16);
  assert.equal(normalizeAudioSettings({ focusHz: '14.5' }).focusHz, 14.5);
  assert.equal(normalizeAudioSettings({ relaxHz: 4 }).relaxHz, 8);
  assert.equal(normalizeAudioSettings({ relaxHz: 99 }).relaxHz, 12);
  assert.equal(normalizeAudioSettings({ relaxHz: '9.5' }).relaxHz, 9.5);
});

test('unknown style and instrument values fall back safely', () => {
  const settings = normalizeAudioSettings({ musicStyle: 'jazz', instrument: 'flute' });
  assert.equal(settings.musicStyle, 'ambient');
  assert.equal(settings.instrument, 'existing');
});

test('every approved mode/style/instrument combination yields a complete profile', () => {
  for (const mode of MODES) {
    for (const musicStyle of STYLES) {
      for (const instrument of INSTRUMENTS) {
        const profile = profileFor(mode, { musicStyle, instrument });
        assert.equal(profile.mode, mode);
        assert.equal(profile.style, musicStyle);
        assert.equal(profile.instrument, instrument);
        assert.ok(profile.bpm > 0);
        assert.ok(profile.chords.length >= 3);
        assert.ok(profile.scale.length >= 5);
        assert.ok(profile.modFreq >= profile.rateRange.min);
        assert.ok(profile.modFreq <= profile.rateRange.max);
      }
    }
  }
});

test('mode-specific modulation settings do not alter style or instrument', () => {
  const raw = { focusHz: 13, relaxHz: 9, musicStyle: 'baroque', instrument: 'harpsichord' };
  assert.equal(profileFor('focus', raw).modFreq, 13);
  assert.equal(profileFor('relax', raw).modFreq, 9);
  assert.equal(profileFor('focus', raw).style, 'baroque');
  assert.equal(profileFor('relax', raw).instrument, 'harpsichord');
});

test('sleep and other unapproved modes are rejected', () => {
  assert.throws(() => profileFor('sleep', {}), /Unsupported neural mode/);
});
