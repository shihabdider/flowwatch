import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PhraseFormer,
  StyleComposer,
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
const onsetKey = (start) => Math.round(start * 1000);

function eventsByRole(chunk, role) {
  return chunk.events.filter((event) => event.role === role);
}

function pitchRange(events) {
  assert.ok(events.length > 0, 'expected at least one event for pitch range');
  return {
    min: Math.min(...events.map((event) => event.pitch)),
    max: Math.max(...events.map((event) => event.pitch)),
  };
}

function totalOverlapDuration(eventGroups, duration) {
  const points = new Set([0, duration]);
  for (const events of eventGroups) {
    for (const event of events) {
      points.add(Math.max(0, event.start));
      points.add(Math.min(duration, event.start + event.duration));
    }
  }
  const sorted = [...points].sort((left, right) => left - right);
  let total = 0;
  for (let index = 1; index < sorted.length; index++) {
    const start = sorted[index - 1];
    const end = sorted[index];
    if (end <= start) continue;
    const allActive = eventGroups.every((events) => events.some((event) => (
      event.start < end - 1e-6 && event.start + event.duration > start + 1e-6
    )));
    if (allActive) total += end - start;
  }
  return total;
}

function structuralSonorities(chunk, minimumDistinctPitches = 3) {
  const groups = new Map();
  for (const event of chunk.events) {
    const key = onsetKey(event.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event.pitch);
  }
  return [...groups.entries()]
    .map(([key, pitches]) => ({
      start: key / 1000,
      distinctPitches: [...new Set(pitches)],
    }))
    .filter((sonority) => sonority.distinctPitches.length >= minimumDistinctPitches)
    .sort((left, right) => left.start - right.start);
}

function hasRapidStepwiseFigure(events, maxGap, minimumNotes = 4) {
  const ordered = [...events].sort((left, right) => left.start - right.start || left.pitch - right.pitch);
  let runLength = 1;
  for (let index = 1; index < ordered.length; index++) {
    const gap = ordered[index].start - ordered[index - 1].start;
    const interval = Math.abs(ordered[index].pitch - ordered[index - 1].pitch);
    if (gap > 0 && gap <= maxGap && interval >= 1 && interval <= 3) {
      runLength++;
      if (runLength >= minimumNotes) return true;
    } else {
      runLength = 1;
    }
  }
  return false;
}

function hasNeighborTurn(events, maxGap) {
  const ordered = [...events].sort((left, right) => left.start - right.start || left.pitch - right.pitch);
  for (let index = 2; index < ordered.length; index++) {
    const first = ordered[index - 2];
    const neighbor = ordered[index - 1];
    const last = ordered[index];
    if (
      first.pitch === last.pitch
      && Math.abs(neighbor.pitch - first.pitch) >= 1
      && Math.abs(neighbor.pitch - first.pitch) <= 3
      && neighbor.start - first.start > 0
      && neighbor.start - first.start <= maxGap
      && last.start - neighbor.start > 0
      && last.start - neighbor.start <= maxGap
    ) return true;
  }
  return false;
}

function hasRepeatedNote(events, maxGap) {
  const ordered = [...events].sort((left, right) => left.start - right.start || left.pitch - right.pitch);
  return ordered.some((event, index) => index > 0
    && event.pitch === ordered[index - 1].pitch
    && event.start - ordered[index - 1].start > 0
    && event.start - ordered[index - 1].start <= maxGap);
}

function hasThirdOrSixthSonority(chunk) {
  return structuralSonorities(chunk, 2).some((sonority) => {
    const pitches = sonority.distinctPitches;
    for (let left = 0; left < pitches.length; left++) {
      for (let right = left + 1; right < pitches.length; right++) {
        const interval = pitchClass(pitches[right] - pitches[left]);
        if ([3, 4, 8, 9].includes(interval)) return true;
      }
    }
    return false;
  });
}

function longestRest(events, duration) {
  const intervals = [...events]
    .map((event) => ({ start: event.start, end: event.start + event.duration }))
    .sort((left, right) => left.start - right.start);
  let cursor = 0;
  let rest = 0;
  for (const interval of intervals) {
    rest = Math.max(rest, interval.start - cursor);
    cursor = Math.max(cursor, interval.end);
  }
  return Math.max(rest, duration - cursor);
}

function hasRegisterExchange(chunk) {
  const bass = eventsByRole(chunk, 'bass');
  const treble = chunk.events.filter((event) => event.pitch >= 68 && event.role !== 'bass');
  return bass.some((low) => treble.some((high) => (
    pitchClass(low.pitch) === pitchClass(high.pitch)
    && high.pitch - low.pitch >= 24
  )));
}

function eventPlanSignature(chunk) {
  return JSON.stringify(chunk.events.map((event) => [
    event.role,
    event.pitch,
    Number(event.start.toFixed(6)),
    Number(event.duration.toFixed(6)),
    Number(event.velocity.toFixed(6)),
  ]));
}

function rolePitchSignature(chunk, role) {
  return JSON.stringify(eventsByRole(chunk, role).map((event) => event.pitch));
}

function roleRhythmSignature(chunk, role) {
  return JSON.stringify(eventsByRole(chunk, role).map((event) => [
    Number(event.start.toFixed(6)),
    Number(event.duration.toFixed(6)),
  ]));
}

function roleOnsetSignature(chunk, role) {
  const events = eventsByRole(chunk, role);
  return JSON.stringify([
    events.length,
    ...events.map((event) => Number((event.start / chunk.duration).toFixed(6))),
  ]);
}

function openingMelodySignature(chunk, barDuration) {
  const lead = eventsByRole(chunk, 'lead').filter((event) => event.start < barDuration);
  const firstPitch = lead[0]?.pitch ?? 0;
  return JSON.stringify(lead.map((event) => [
    event.pitch - firstPitch,
    Number((event.start / barDuration).toFixed(6)),
  ]));
}

function classicalOrnamentGestures(chunk) {
  const ornaments = eventsByRole(chunk, 'ornament');
  return [
    ornaments.filter((event) => event.start < chunk.duration / 2),
    ornaments.filter((event) => event.start >= chunk.duration / 2),
  ].map((events) => events.sort((left, right) => left.start - right.start));
}

function ornamentPitchContour(events) {
  const target = events.at(-1)?.pitch ?? 0;
  return JSON.stringify(events.map((event) => event.pitch - target));
}

function ornamentRhythmContour(events) {
  const first = events[0]?.start ?? 0;
  const span = (events.at(-1)?.start ?? first) - first || 1;
  return JSON.stringify(events.map((event) => Number(((event.start - first) / span).toFixed(4))));
}

test('Euclidean rhythm handles empty, full, and distributed cases', () => {
  assert.deepEqual(euclid(0, 4), [false, false, false, false]);
  assert.deepEqual(euclid(4, 4), [true, true, true, true]);
  const rhythm = euclid(3, 8);
  assert.equal(rhythm.length, 8);
  assert.equal(rhythm.filter(Boolean).length, 3);
});

for (const mode of ['focus', 'relax']) {
  test(`${mode} phrase primitive stays in key, caps leaps, and resolves`, () => {
    const profile = profileFor(mode, { musicStyle: 'classical' });
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
    for (let index = 1; index < phrase.notes.length; index++) {
      assert.ok(Math.abs(phrase.notes[index].pitch - phrase.notes[index - 1].pitch) <= 7);
    }
    assert.equal(pitchClass(phrase.notes.at(-1).pitch), pitchClass(profile.rootMidi));
    assert.ok(Number.isFinite(scorePhrase(phrase, profile.icBand)));
    assert.ok(melodicInfoContent(phrase) > 0);
  });
}

test('phrase former produces a continuous four-part A/A-prime/B/A-prime cycle', () => {
  const profile = profileFor('focus', { musicStyle: 'ambient' });
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
  const phrases = Array.from({ length: 4 }, () => former.next(opts, profile.icBand));
  assert.ok(phrases.every((phrase) => phrase.notes.length > 0));
  for (let index = 1; index < phrases.length; index++) {
    const previous = phrases[index - 1].notes.at(-1).pitch;
    const next = phrases[index].notes[0].pitch;
    assert.ok(Math.abs(next - previous) <= 7);
  }
});

test('every style produces a valid complete musical chunk', () => {
  for (const style of ['ambient', 'classical', 'baroque', 'electronic']) {
    const profile = profileFor('focus', { musicStyle: style });
    const chunk = new StyleComposer(4, seeded(20)).next(profile);
    assert.ok(chunk.duration > 0);
    assert.ok(chunk.events.length > 10);
    assert.ok(chunk.events.every((event) => (
      Number.isFinite(event.pitch)
      && event.start >= 0
      && event.start < chunk.duration
      && event.duration > 0
      && event.velocity > 0
      && event.velocity <= 1
      && typeof event.role === 'string'
    )));
    for (let index = 1; index < chunk.events.length; index++) {
      assert.ok(chunk.events[index].start >= chunk.events[index - 1].start);
    }
  }
});

test('Classical chunks create separated bass, Alberti, melody, chords, and cadential flourishes', () => {
  for (const [mode, expectedBpm] of [['focus', 88], ['relax', 68]]) {
    const profile = profileFor(mode, { musicStyle: 'classical' });
    const chunk = new StyleComposer(5, seeded(31)).next(profile);
    const barDuration = (60 / profile.bpm) * 4;
    const midpoint = chunk.duration / 2;
    const bass = eventsByRole(chunk, 'bass');
    const accompaniment = eventsByRole(chunk, 'accompaniment');
    const lead = eventsByRole(chunk, 'lead');
    const ornament = eventsByRole(chunk, 'ornament');
    const bassRange = pitchRange(bass);
    const accompanimentRange = pitchRange(accompaniment);
    const leadRange = pitchRange(lead);
    const antecedent = lead.filter((event) => event.start < midpoint);
    const consequent = lead.filter((event) => event.start >= midpoint);
    const sonorities = structuralSonorities(chunk);

    assert.equal(profile.bpm, expectedBpm);
    assert.equal(chunk.duration, barDuration * profile.chords.length);
    assert.ok(bassRange.max <= accompanimentRange.min - 5, `${mode} bass is audibly below Alberti figuration`);
    assert.ok(accompanimentRange.max <= leadRange.min - 5, `${mode} Alberti figuration is below melody`);
    assert.ok(totalOverlapDuration([bass, accompaniment, lead], chunk.duration) >= chunk.duration * 0.22);
    assert.ok(sonorities.length >= profile.chords.length);
    const exactOnsets = chunk.events.map((event) => `${onsetKey(event.start)}:${event.pitch}`);
    assert.equal(new Set(exactOnsets).size, exactOnsets.length, `${mode} has no duplicate same-key attacks`);
    assert.ok(antecedent.length >= 5);
    assert.ok(consequent.length >= 5);
    assert.equal(pitchClass(antecedent.at(-1).pitch), pitchClass(chunk.tonicMidi + 7));
    assert.equal(pitchClass(consequent.at(-1).pitch), pitchClass(chunk.tonicMidi));
    const dominantClasses = new Set([
      pitchClass(chunk.tonicMidi + 7),
      pitchClass(chunk.tonicMidi + 11),
      pitchClass(chunk.tonicMidi + 14),
    ]);
    const halfCadenceStart = midpoint - barDuration / 4;
    const cadenceOnset = chunk.events.filter((event) => (
      Math.abs(event.start - halfCadenceStart) < 1e-6
      && ['bass', 'accompaniment', 'harmony', 'lead'].includes(event.role)
    ));
    assert.deepEqual(new Set(cadenceOnset.map((event) => event.role)), new Set([
      'bass', 'harmony', 'lead',
    ]));
    assert.ok(cadenceOnset.every((event) => dominantClasses.has(pitchClass(event.pitch))));
    assert.ok(accompaniment.length >= profile.chords.length * 7);
    assert.ok(new Set(accompaniment.slice(0, 8).map((event) => event.pitch)).size >= 3);
    assert.ok(hasRapidStepwiseFigure(ornament, barDuration / 16));
    assert.ok(hasNeighborTurn(ornament, barDuration / 16));
  }
});

test('Classical varies its chord-tone figures without losing phrase cadences', () => {
  const profile = profileFor('focus', { musicStyle: 'classical' });
  const composer = new StyleComposer(5, seeded(47));
  const chunks = Array.from({ length: 4 }, () => composer.next(profile));
  const leadPlans = chunks.map((chunk) => eventsByRole(chunk, 'lead').map((event) => event.pitch));
  const accompanimentPlans = chunks.map((chunk) => (
    eventsByRole(chunk, 'accompaniment').map((event) => event.pitch)
  ));

  assert.equal(new Set(leadPlans.map((plan) => JSON.stringify(plan))).size, 4);
  assert.equal(new Set(accompanimentPlans.map((plan) => JSON.stringify(plan))).size, 4);
  for (const chunk of chunks) {
    const lead = eventsByRole(chunk, 'lead');
    const antecedent = lead.filter((event) => event.start < chunk.duration / 2);
    assert.equal(pitchClass(antecedent.at(-1).pitch), pitchClass(chunk.tonicMidi + 7));
    assert.equal(pitchClass(lead.at(-1).pitch), pitchClass(chunk.tonicMidi));
  }
});

test('Classical cadential flourishes vary contour and rhythm while preserving their targets', () => {
  const profile = profileFor('focus', { musicStyle: 'classical' });
  const chunks = Array.from({ length: 64 }, (_, index) => (
    new StyleComposer(5, seeded(5231 + index * 7919)).next(profile)
  ));
  const gestures = chunks.flatMap(classicalOrnamentGestures);
  const pitchContours = new Set(gestures.map(ornamentPitchContour));
  const rhythmContours = new Set(gestures.map(ornamentRhythmContour));
  const completeShapes = new Set(gestures.map((events) => (
    `${ornamentPitchContour(events)}:${ornamentRhythmContour(events)}`
  )));

  assert.ok(pitchContours.size >= 20, 'flourishes use recognizably different pitch contours');
  assert.ok(rhythmContours.size >= 12, 'flourishes vary their onset surfaces, not only performance');
  assert.ok(completeShapes.size >= 36, 'pitch and rhythm choices combine into broad flourish variety');
  for (const chunk of chunks) {
    const [midpoint, final] = classicalOrnamentGestures(chunk);
    assert.ok(midpoint.length >= 5 && final.length >= 5);
    assert.equal(pitchClass(midpoint.at(-1).pitch), pitchClass(chunk.tonicMidi + 7));
    assert.equal(pitchClass(final.at(-1).pitch), pitchClass(chunk.tonicMidi));
    assert.ok([...midpoint, ...final].every((event) => event.pitch >= 72 && event.pitch <= 84));
  }

  const longPlayComposer = new StyleComposer(5, seeded(9901));
  const longPlayGestures = Array.from({ length: 16 }, () => longPlayComposer.next(profile))
    .flatMap(classicalOrnamentGestures);
  const longPlayShapes = new Set(longPlayGestures.map((events) => (
    `${ornamentPitchContour(events)}:${ornamentRhythmContour(events)}`
  )));
  assert.ok(longPlayShapes.size >= 24, 'one continuous play avoids repeating one flourish plan');
});

test('Baroque chunks create independent bass, continuous treble, ornaments, intervals, and binary cadences', () => {
  for (const [mode, expectedBpm] of [['focus', 104], ['relax', 76]]) {
    const profile = profileFor(mode, { musicStyle: 'baroque' });
    const composer = new StyleComposer(4, seeded(9));
    const sectionA = composer.next(profile);
    const sectionB = composer.next(profile);
    const barDuration = (60 / profile.bpm) * 4;
    const bass = eventsByRole(sectionA, 'bass');
    const accompaniment = eventsByRole(sectionA, 'accompaniment');
    const leadA = eventsByRole(sectionA, 'lead');
    const leadB = eventsByRole(sectionB, 'lead');
    const trebleA = sectionA.events.filter((event) => event.role !== 'bass');
    const bassRange = pitchRange(bass);
    const accompanimentRange = pitchRange(accompaniment);
    const leadRange = pitchRange(leadA);
    const sonorities = structuralSonorities(sectionA);

    assert.equal(profile.bpm, expectedBpm);
    assert.ok(bassRange.max <= accompanimentRange.min - 5, `${mode} bass is independently registered below broken chords`);
    assert.ok(accompanimentRange.max <= leadRange.min - 3, `${mode} broken chords sit below the treble line`);
    assert.ok(totalOverlapDuration([bass, accompaniment, leadA], sectionA.duration) >= sectionA.duration * 0.2);
    assert.ok(longestRest(trebleA, sectionA.duration) <= barDuration / 8);
    assert.ok(sonorities.length >= profile.chords.length);
    const exactOnsets = sectionA.events.map((event) => `${onsetKey(event.start)}:${event.pitch}`);
    assert.equal(new Set(exactOnsets).size, exactOnsets.length, `${mode} has no duplicate same-key attacks`);
    assert.ok(new Set(accompaniment.slice(0, 8).map((event) => event.pitch)).size >= 3);
    assert.ok(hasRepeatedNote(leadA, barDuration / 15.5));
    assert.ok(hasNeighborTurn(leadA, barDuration / 15.5));
    assert.ok(hasThirdOrSixthSonority(sectionA));
    assert.ok(hasRegisterExchange(sectionA));
    assert.equal(pitchClass(leadA.at(-1).pitch), pitchClass(sectionA.tonicMidi + 7));
    assert.equal(pitchClass(leadB.at(-1).pitch), pitchClass(sectionB.tonicMidi));
  }
});

test('one seeded composer chooses one reproducible nearby key for an entire play', () => {
  for (const style of ['ambient', 'classical', 'baroque', 'electronic']) {
    const profile = profileFor('focus', { musicStyle: style });
    const firstComposer = new StyleComposer(5, seeded(801));
    const secondComposer = new StyleComposer(5, seeded(801));
    const first = Array.from({ length: 5 }, () => firstComposer.next(profile));
    const second = Array.from({ length: 5 }, () => secondComposer.next(profile));

    assert.deepEqual(second, first);
    assert.equal(new Set(first.map((chunk) => chunk.tonicMidi)).size, 1);
    assert.ok(profile.keyOffsets.includes(first[0].tonicMidi - profile.rootMidi));
    assert.ok(first.every((chunk) => chunk.events.every((event) => event.pitch >= 31 && event.pitch <= 84)));
  }
});

test('every approved nearby key keeps normal generated events inside the local voice range', () => {
  for (const style of ['ambient', 'classical', 'baroque', 'electronic']) {
    for (const mode of ['focus', 'relax']) {
      const profile = profileFor(mode, { musicStyle: style });
      for (let index = 0; index < profile.keyOffsets.length; index++) {
        const remaining = seeded(9013 + index * 101);
        let firstDraw = true;
        const rng = () => {
          if (!firstDraw) return remaining();
          firstDraw = false;
          return (index + 0.25) / profile.keyOffsets.length;
        };
        const chunk = new StyleComposer(5, rng).next(profile);
        assert.equal(chunk.tonicMidi, profile.rootMidi + profile.keyOffsets[index]);
        assert.ok(chunk.events.every((event) => event.pitch >= 31 && event.pitch <= 84));
      }
    }
  }
});

test('reset clears the style session key and bounded generation tolerates a constant RNG', () => {
  for (const style of ['ambient', 'classical', 'baroque', 'electronic']) {
    const profile = profileFor('focus', { musicStyle: style });
    let firstDraw = true;
    const composer = new StyleComposer(3, () => {
      if (firstDraw) {
        firstDraw = false;
        return 0;
      }
      return 1 - Number.EPSILON;
    });
    const beforeReset = composer.next(profile);
    composer.reset();
    const afterReset = composer.next(profile);
    assert.equal(beforeReset.tonicMidi, profile.rootMidi + profile.keyOffsets[0]);
    assert.equal(afterReset.tonicMidi, profile.rootMidi + profile.keyOffsets.at(-1));

    const constantComposer = new StyleComposer(3, () => 0.5);
    const chunks = Array.from({ length: 8 }, () => constantComposer.next(profile));
    for (let index = 1; index < chunks.length; index++) {
      assert.notEqual(eventPlanSignature(chunks[index]), eventPlanSignature(chunks[index - 1]));
    }
  }
});

test('Ambient plays vary key, harmony, bass surface, and lead surface', () => {
  const profile = profileFor('focus', { musicStyle: 'ambient' });
  const chunks = Array.from({ length: 48 }, (_, index) => (
    new StyleComposer(5, seeded(2111 + index * 7919)).next(profile)
  ));
  assert.equal(new Set(chunks.map(eventPlanSignature)).size, chunks.length);
  assert.ok(new Set(chunks.map((chunk) => chunk.tonicMidi)).size >= 5);
  assert.ok(new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'pad'))).size >= 16);
  assert.ok(new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'bass'))).size >= 8);
  assert.ok(new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'lead'))).size >= 20);
});

test('Electronic chunks layer drones, pulses, pads, ostinatos, leads, and restrained impacts', () => {
  const eventCounts = {};
  for (const [mode, expectedBpm] of [['focus', 112], ['relax', 84]]) {
    const profile = profileFor(mode, { musicStyle: 'electronic' });
    const chunk = new StyleComposer(5, seeded(mode === 'focus' ? 7301 : 7302)).next(profile);
    const barDuration = (60 / profile.bpm) * 4;
    const drone = eventsByRole(chunk, 'drone');
    const pulse = eventsByRole(chunk, 'pulse');
    const pad = eventsByRole(chunk, 'pad');
    const ostinato = eventsByRole(chunk, 'ostinato');
    const lead = eventsByRole(chunk, 'lead');
    const impact = eventsByRole(chunk, 'impact');

    assert.equal(profile.bpm, expectedBpm);
    assert.equal(chunk.duration, barDuration * profile.chords.length);
    assert.ok(drone.length >= profile.chords.length);
    assert.ok(pulse.length >= profile.chords.length * 4);
    assert.ok(pad.length >= profile.chords.length * 3);
    assert.ok(ostinato.length >= profile.chords.length * 4);
    assert.ok(lead.length >= 4);
    assert.ok(impact.length >= 1 && impact.length <= 2);
    assert.ok(drone.every((event) => event.pitch >= 31 && event.pitch <= 42));
    assert.ok(pulse.every((event) => event.pitch >= 43 && event.pitch <= 55));
    assert.ok(pad.every((event) => event.pitch >= 50 && event.pitch <= 67));
    assert.ok(ostinato.every((event) => event.pitch >= 60 && event.pitch <= 76));
    assert.ok(lead.every((event) => event.pitch >= 67 && event.pitch <= 81));
    assert.ok(impact.every((event) => event.pitch >= 31 && event.pitch <= 43));
    assert.ok(longestRest(drone, chunk.duration) <= barDuration * 0.06);
    assert.ok(totalOverlapDuration([drone, pad, ostinato], chunk.duration) >= chunk.duration * 0.08);
    assert.equal(pitchClass(lead.at(-1).pitch), pitchClass(chunk.tonicMidi));
    const exactOnsets = chunk.events.map((event) => `${onsetKey(event.start)}:${event.pitch}`);
    assert.equal(new Set(exactOnsets).size, exactOnsets.length);
    assert.ok(chunk.events.length < 180, `${mode} Electronic density stays bounded`);
    eventCounts[mode] = { pulse: pulse.length, ostinato: ostinato.length };
  }
  assert.ok(eventCounts.focus.pulse > eventCounts.relax.pulse);
  assert.ok(eventCounts.focus.ostinato > eventCounts.relax.ostinato);
});

test('Electronic plans vary across new plays and through one continuous session', () => {
  const profile = profileFor('focus', { musicStyle: 'electronic' });
  const chunks = Array.from({ length: 48 }, (_, index) => (
    new StyleComposer(5, seeded(8101 + index * 7919)).next(profile)
  ));
  assert.equal(new Set(chunks.map(eventPlanSignature)).size, chunks.length);
  assert.ok(new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'pulse'))).size >= 8);
  assert.ok(new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'ostinato'))).size >= 8);
  assert.ok(new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'ostinato'))).size >= 20);

  const composer = new StyleComposer(5, seeded(8123));
  const longPlay = Array.from({ length: 16 }, () => composer.next(profile));
  assert.ok(new Set(longPlay.map((chunk) => rolePitchSignature(chunk, 'ostinato'))).size >= 12);
  assert.equal(new Set(longPlay.map(eventPlanSignature)).size, longPlay.length);
});

test('Baroque first plays vary pitch-independent melody, bass, and accompaniment surfaces', () => {
  const profile = profileFor('focus', { musicStyle: 'baroque' });
  const chunks = Array.from({ length: 64 }, (_, index) => (
    new StyleComposer(5, seeded(4211 + index * 7919)).next(profile)
  ));
  const barDuration = (60 / profile.bpm) * 4;
  const leadSurfaces = new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'lead')));
  const openingMelodies = new Set(chunks.map((chunk) => openingMelodySignature(chunk, barDuration)));
  const bassSurfaces = new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'bass')));
  const accompanimentSurfaces = new Set(chunks.map((chunk) => roleOnsetSignature(chunk, 'accompaniment')));
  assert.ok(leadSurfaces.size >= 20, 'Baroque changes complete melody onset shapes and counts');
  assert.ok(openingMelodies.size >= 24, 'Baroque openings differ after removing key transposition');
  assert.ok(bassSurfaces.size >= 8, 'Baroque changes bass rhythms rather than only bass pitches');
  assert.ok(accompanimentSurfaces.size >= 12, 'Baroque changes broken-chord density and grids');
});

test('independently seeded keyboard plays explore different keys and musical plans', () => {
  for (const style of ['classical', 'baroque']) {
    const profile = profileFor('relax', { musicStyle: style });
    const chunks = Array.from({ length: 48 }, (_, index) => (
      new StyleComposer(5, seeded(1009 + index * 7919)).next(profile)
    ));
    const wholePlans = new Set(chunks.map(eventPlanSignature));
    const tonics = new Set(chunks.map((chunk) => chunk.tonicMidi));
    const harmonies = new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'harmony')));
    const accompaniments = new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'accompaniment')));
    const leadRhythms = new Set(chunks.map((chunk) => roleRhythmSignature(chunk, 'lead')));

    assert.equal(wholePlans.size, chunks.length, `${style} cross-play plans are unique in a broad seeded sample`);
    assert.ok(tonics.size >= 5, `${style} explores at least five nearby keys`);
    assert.ok(harmonies.size >= 10, `${style} varies harmony and voicing`);
    assert.ok(accompaniments.size >= 16, `${style} varies accompaniment figures`);
    assert.ok(leadRhythms.size >= 12, `${style} varies lead rhythm`);
  }
});

test('broad keyboard variation preserves register, polyphony, gesture, and cadence invariants', () => {
  for (const style of ['classical', 'baroque']) {
    for (const mode of ['focus', 'relax']) {
      const profile = profileFor(mode, { musicStyle: style });
      const barDuration = (60 / profile.bpm) * 4;
      for (let index = 0; index < 24; index++) {
        const chunk = new StyleComposer(5, seeded(6007 + index * 3571)).next(profile);
        const bass = eventsByRole(chunk, 'bass');
        const accompaniment = eventsByRole(chunk, 'accompaniment');
        const lead = eventsByRole(chunk, 'lead');
        const harmony = eventsByRole(chunk, 'harmony');
        const bassRange = pitchRange(bass);
        const accompanimentRange = pitchRange(accompaniment);
        const leadRange = pitchRange(lead);
        const exactOnsets = chunk.events.map((event) => `${onsetKey(event.start)}:${event.pitch}`);

        assert.ok(harmony.length > 0);
        assert.ok(structuralSonorities(chunk).length >= profile.chords.length);
        assert.equal(new Set(exactOnsets).size, exactOnsets.length);
        assert.ok(bassRange.max <= accompanimentRange.min - 5);
        assert.ok(accompanimentRange.max <= leadRange.min - 3);
        assert.ok(chunk.events.every((event) => event.pitch >= 31 && event.pitch <= 84));

        if (style === 'classical') {
          const antecedent = lead.filter((event) => event.start < chunk.duration / 2);
          const ornaments = eventsByRole(chunk, 'ornament');
          assert.equal(pitchClass(antecedent.at(-1).pitch), pitchClass(chunk.tonicMidi + 7));
          assert.equal(pitchClass(lead.at(-1).pitch), pitchClass(chunk.tonicMidi));
          assert.ok(hasRapidStepwiseFigure(ornaments, barDuration / 12));
          assert.ok(hasNeighborTurn(ornaments, barDuration / 12));
        } else {
          const treble = chunk.events.filter((event) => event.role !== 'bass');
          assert.equal(pitchClass(lead.at(-1).pitch), pitchClass(chunk.tonicMidi + 7));
          assert.ok(longestRest(treble, chunk.duration) <= barDuration / 8);
          assert.ok(hasRepeatedNote(lead, barDuration / 15.5));
          assert.ok(hasNeighborTurn(lead, barDuration / 15.5));
          assert.ok(hasThirdOrSixthSonority(chunk));
          assert.ok(hasRegisterExchange(chunk));
        }
      }
    }
  }
});

test('long keyboard plays avoid exact chunk loops while retaining one session key', () => {
  for (const style of ['classical', 'baroque']) {
    const profile = profileFor('focus', { musicStyle: style });
    const composer = new StyleComposer(5, seeded(style === 'classical' ? 404 : 505));
    const chunks = Array.from({ length: 16 }, () => composer.next(profile));
    assert.equal(new Set(chunks.map((chunk) => chunk.tonicMidi)).size, 1);
    assert.equal(new Set(chunks.map(eventPlanSignature)).size, chunks.length);
    assert.ok(new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'lead'))).size >= 10);
    assert.ok(new Set(chunks.map((chunk) => rolePitchSignature(chunk, 'accompaniment'))).size >= 10);
  }
});

test('modulation-rate changes do not alter a seeded musical event plan', () => {
  for (const style of ['ambient', 'classical', 'baroque', 'electronic']) {
    for (const [mode, baseHz, changedHz, field] of [
      ['focus', 12, 16, 'focusHz'],
      ['relax', 8, 12, 'relaxHz'],
    ]) {
      const base = profileFor(mode, { musicStyle: style, [field]: baseHz });
      const changedRate = profileFor(mode, { musicStyle: style, [field]: changedHz });
      const first = new StyleComposer(4, seeded(77)).next(base);
      const second = new StyleComposer(4, seeded(77)).next(changedRate);
      assert.deepEqual(second, first);
    }
  }
});
