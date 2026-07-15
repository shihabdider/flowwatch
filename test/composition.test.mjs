import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PhraseFormer,
  euclid,
  generatePhrase,
  melodicInfoContent,
  scorePhrase,
} from '../audio/composition.mjs';
import { profileFor } from '../audio/policy.mjs';

function seeded(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const pitchClass = (midi) => ((midi % 12) + 12) % 12;

test('Euclidean rhythm handles empty, full, and distributed cases', () => {
  assert.deepEqual(euclid(0, 4), [false, false, false, false]);
  assert.deepEqual(euclid(4, 4), [true, true, true, true]);
  const rhythm = euclid(3, 8);
  assert.equal(rhythm.length, 8);
  assert.equal(rhythm.filter(Boolean).length, 3);
});

for (const mode of ['focus', 'relax']) {
  test(`${mode} phrases stay in key, cap leaps, and resolve`, () => {
    const profile = profileFor(mode, { musicStyle: 'classical', instrument: 'piano' });
    const phrase = generatePhrase({
      bpm: profile.bpm,
      scale: profile.scale,
      rootMidi: profile.rootMidi,
      bars: profile.chords.length,
      density: profile.density,
      chords: profile.chords,
      groove: profile.groove,
      rng: seeded(mode === 'focus' ? 7 : 11),
    });
    const allowed = new Set(profile.scale.map((offset) => pitchClass(profile.rootMidi + offset)));
    assert.ok(phrase.notes.length > 4);
    assert.ok(phrase.notes.every((note) => allowed.has(pitchClass(note.pitch))));
    for (let i = 1; i < phrase.notes.length; i++) {
      assert.ok(Math.abs(phrase.notes[i].pitch - phrase.notes[i - 1].pitch) <= 7);
    }
    assert.equal(pitchClass(phrase.notes.at(-1).pitch), pitchClass(profile.rootMidi));
    assert.ok(Number.isFinite(scorePhrase(phrase, profile.modFreq, profile.icBand)));
    assert.ok(melodicInfoContent(phrase) > 0);
  });
}

test('phrase former produces a continuous four-part A/A-prime/B/A-prime cycle', () => {
  const profile = profileFor('focus', { musicStyle: 'baroque', instrument: 'harpsichord' });
  const former = new PhraseFormer(4, seeded(42));
  const opts = {
    bpm: profile.bpm,
    scale: profile.scale,
    rootMidi: profile.rootMidi,
    bars: profile.chords.length,
    density: profile.density,
    chords: profile.chords,
    groove: profile.groove,
  };
  const phrases = Array.from({ length: 4 }, () => former.next(opts, profile.modFreq, profile.icBand));
  assert.ok(phrases.every((phrase) => phrase.notes.length > 0));
  for (let i = 1; i < phrases.length; i++) {
    const previous = phrases[i - 1].notes.at(-1).pitch;
    const next = phrases[i].notes[0].pitch;
    assert.ok(Math.abs(next - previous) <= 7);
  }
});
