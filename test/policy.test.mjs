import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODES,
  STORAGE_DEFAULTS,
  STYLES,
  STYLE_VOICES,
  VOICES,
  normalizeAudioSettings,
  profileFor,
} from '../audio/policy.mjs';

test('audio settings use the approved 12/8 defaults', () => {
  assert.deepEqual(STORAGE_DEFAULTS, {
    focusHz: 12,
    relaxHz: 8,
    musicStyle: 'ambient',
  });
  assert.deepEqual(normalizeAudioSettings({}), STORAGE_DEFAULTS);
});

test('focus and relax rates clamp to their approved ranges', () => {
  assert.equal(normalizeAudioSettings({ focusHz: 4 }).focusHz, 12);
  assert.equal(normalizeAudioSettings({ focusHz: 99 }).focusHz, 16);
  assert.equal(normalizeAudioSettings({ focusHz: '14.5' }).focusHz, 14.5);
  assert.equal(normalizeAudioSettings({ relaxHz: 4 }).relaxHz, 8);
  assert.equal(normalizeAudioSettings({ relaxHz: 99 }).relaxHz, 12);
  assert.equal(normalizeAudioSettings({ relaxHz: '9.5' }).relaxHz, 9.5);
});

test('unknown styles fall back and legacy instrument settings are ignored', () => {
  const settings = normalizeAudioSettings({ musicStyle: 'jazz', instrument: 'flute' });
  assert.deepEqual(settings, STORAGE_DEFAULTS);
  assert.equal('instrument' in settings, false);
});

test('each approved style owns exactly one voice', () => {
  assert.deepEqual(VOICES, ['synth', 'piano', 'harpsichord']);
  assert.deepEqual(STYLE_VOICES, {
    ambient: 'synth',
    classical: 'piano',
    baroque: 'harpsichord',
  });

  for (const mode of MODES) {
    for (const musicStyle of STYLES) {
      const profile = profileFor(mode, { musicStyle, instrument: 'ignored' });
      assert.equal(profile.mode, mode);
      assert.equal(profile.style, musicStyle);
      assert.equal(profile.voice, STYLE_VOICES[musicStyle]);
      assert.equal('instrument' in profile, false);
      assert.ok(profile.chords.length >= 3);
      assert.ok(profile.scale.length >= 5);
      assert.ok(profile.modFreq >= profile.rateRange.min);
      assert.ok(profile.modFreq <= profile.rateRange.max);
    }
  }
});

test('every style profile exposes multiple caller-owned nearby key offsets', () => {
  for (const mode of MODES) {
    for (const musicStyle of STYLES) {
      const first = profileFor(mode, { musicStyle });
      const second = profileFor(mode, { musicStyle });
      assert.ok(first.keyOffsets.length >= 7);
      assert.ok(first.keyOffsets.includes(0));
      assert.ok(first.keyOffsets.some((offset) => offset < 0));
      assert.ok(first.keyOffsets.some((offset) => offset > 0));
      first.keyOffsets.push(99);
      assert.equal(second.keyOffsets.includes(99), false);
    }
  }
});

test('the approved style tempos remain unchanged', () => {
  assert.deepEqual(
    Object.fromEntries(STYLES.map((style) => [style, [
      profileFor('focus', { musicStyle: style }).bpm,
      profileFor('relax', { musicStyle: style }).bpm,
    ]])),
    {
      ambient: [96, 72],
      classical: [88, 68],
      baroque: [104, 76],
    },
  );
});

const pitchClass = (midi) => ((midi % 12) + 12) % 12;

test('keyboard styles encode tonic-predominant-dominant-tonic harmony', () => {
  for (const musicStyle of ['classical', 'baroque']) {
    for (const mode of MODES) {
      const profile = profileFor(mode, { musicStyle });
      assert.deepEqual(
        profile.chords.map((chord) => pitchClass(chord[0] - profile.rootMidi)),
        [0, 5, 7, 0],
      );
      assert.deepEqual(
        profile.chords[2].map((pitch) => pitchClass(pitch - profile.chords[2][0])),
        [0, 4, 7],
      );
    }
  }
});

test('modulation settings alter only the selected neural rate', () => {
  const raw = { focusHz: 13, relaxHz: 9, musicStyle: 'baroque' };
  const focus = profileFor('focus', raw);
  const relax = profileFor('relax', raw);
  assert.equal(focus.modFreq, 13);
  assert.equal(relax.modFreq, 9);
  assert.equal(focus.style, 'baroque');
  assert.equal(relax.voice, 'harpsichord');
});

test('sleep and other unapproved modes are rejected', () => {
  assert.throws(() => profileFor('sleep', {}), /Unsupported neural mode/);
});
