// Pure generative composition adapted with permission from neuralfm's algorithmic engine.
// It uses an order-2 rhythm/pitch walk, harmony-aware strong beats, phrase contour,
// tonal cadences, A/A-prime/B/A-prime form, and best-of-N comfort selection.

const pitchClass = (midi) => ((midi % 12) + 12) % 12;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function weightedChoice(candidates, rng) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return candidates.at(-1).value;
  let cursor = rng() * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) return candidate.value;
  }
  return candidates.at(-1).value;
}

/** Bjorklund-style even distribution, retained as a deterministic rhythm primitive. */
export function euclid(pulses, steps) {
  const n = Math.max(0, Math.round(steps));
  const k = Math.max(0, Math.min(n, Math.round(pulses)));
  if (n === 0) return [];
  if (k === 0) return new Array(n).fill(false);
  if (k === n) return new Array(n).fill(true);

  let groups = Array.from({ length: n }, (_, index) => [index < k]);
  let left = k;
  let right = n - k;
  while (right > 1) {
    const pairs = Math.min(left, right);
    const next = [];
    for (let i = 0; i < pairs; i++) next.push(groups[i].concat(groups[left + i]));
    const remainder = left > right ? groups.slice(pairs, left) : groups.slice(left + pairs);
    groups = next.concat(remainder);
    left = pairs;
    right = remainder.length;
  }
  return groups.flat();
}

function pinkGenerator(columns, rng) {
  const rows = Array.from({ length: columns }, () => rng());
  let counter = 0;
  return () => {
    counter++;
    let index = 0;
    let value = counter;
    while ((value & 1) === 0 && index < columns - 1) {
      value >>= 1;
      index++;
    }
    rows[index] = rng();
    return rows.reduce((sum, row) => sum + row, 0) / columns;
  };
}

function markovRhythm(stepsPerBar, stepsPerBeat, density, rng, groove) {
  const motif = [];
  let previous2 = 0;
  let previous1 = 0;
  for (let step = 0; step < stepsPerBar; step++) {
    let onset;
    if (step === 0) {
      onset = true;
    } else {
      let probability = density;
      const onBeat = step % stepsPerBeat === 0;
      const strong = step % (stepsPerBeat * 2) === 0;
      if (onBeat) probability += 0.18;
      if (strong) probability += 0.12;
      if (!onBeat) probability += 0.22 * groove;
      if (previous1 && previous2) probability -= 0.45;
      else if (!previous1 && !previous2) probability += 0.3;
      else if (previous1) probability -= 0.1;
      onset = rng() < Math.max(0.05, Math.min(0.95, probability));
    }
    motif.push(onset);
    previous2 = previous1;
    previous1 = onset ? 1 : 0;
  }
  return motif;
}

function nextScaleMove(previous2, previous1, rng) {
  const moves = [-2, -1, 0, 1, 2];
  const baseWeights = [0.5, 1.6, 0.9, 1.6, 0.5];
  const candidates = moves.map((move, index) => {
    let weight = baseWeights[index];
    if (previous1 !== 0 && Math.sign(move) === Math.sign(previous1)) weight *= 2;
    if (Math.abs(previous1) === 2) {
      if (Math.sign(move) === -Math.sign(previous1) && Math.abs(move) <= 1) weight *= 3;
      if (Math.sign(move) === Math.sign(previous1)) weight *= 0.3;
    }
    if (
      previous1 !== 0
      && Math.sign(previous1) === Math.sign(previous2)
      && Math.sign(move) === Math.sign(previous1)
    ) weight *= 0.4;
    return { value: move, weight };
  });
  return weightedChoice(candidates, rng);
}

function nearestPitchClass(target, reference, low, high) {
  let best = reference;
  let bestDistance = Infinity;
  for (let pitch = low; pitch <= high; pitch++) {
    if (pitchClass(pitch) !== target) continue;
    const distance = Math.abs(pitch - reference);
    if (distance < bestDistance) {
      best = pitch;
      bestDistance = distance;
    }
  }
  return best;
}

function pickPitch(allowed, desired, previous, low, high, rng, pull) {
  const candidates = [];
  for (let pitch = Math.ceil(low); pitch <= Math.floor(high); pitch++) {
    if (!allowed.has(pitchClass(pitch))) continue;
    const cost = Math.abs(pitch - desired) + 0.35 * Math.abs(pitch - previous);
    let weight = Math.exp(-cost * 0.6);
    if (
      pull
      && pitchClass(pitch) === pull.pitchClass
      && Math.sign(pitch - previous) === pull.direction
      && Math.abs(pitch - previous) <= 2
    ) weight *= 1 + pull.strength;
    candidates.push({ value: pitch, weight });
  }
  return candidates.length ? weightedChoice(candidates, rng) : previous;
}

export function generatePhrasePlanned(options) {
  const rng = options.rng ?? Math.random;
  const beatsPerBar = options.beatsPerBar ?? 4;
  const stepsPerBeat = options.stepsPerBeat ?? 2;
  const stepsPerBar = beatsPerBar * stepsPerBeat;
  const bars = Math.max(1, Math.round(options.bars));
  const bpm = Math.max(30, Number(options.bpm) || 60);
  const stepDuration = 60 / bpm / stepsPerBeat;
  const duration = bars * stepsPerBar * stepDuration;
  const density = Math.max(0.05, Math.min(0.9, options.density ?? 0.4));
  const groove = Math.max(0, Math.min(1, options.groove ?? 0));
  const octave = options.octave ?? 1;

  const scalePitchClasses = new Set(
    options.scale.map((offset) => pitchClass(options.rootMidi + offset)),
  );
  if (options.chords) {
    for (const chord of options.chords) {
      for (const pitch of chord) scalePitchClasses.add(pitchClass(pitch));
    }
  }

  const low = options.lowMidi ?? options.rootMidi + 12 * octave;
  const high = Math.max(low + 1, options.highMidi ?? low + 12);
  const center = (low + high) / 2;
  const range = (high - low) * 0.45;
  const arch = options.contour
    ? options.contour === 'arch'
    : options.plan
      ? options.plan.arch
      : rng() < 0.6;
  const motif = options.plan?.motif
    ?? markovRhythm(stepsPerBar, stepsPerBeat, density, rng, groove);
  const plan = { motif: [...motif], arch };
  const onsetColumns = motif.flatMap((onset, index) => (onset ? [index] : []));
  const startFallback = options.startPitch ?? center;
  if (onsetColumns.length === 0) {
    return { phrase: { notes: [], duration }, plan, lastPitch: startFallback };
  }

  const contour = (progress) => {
    if (!arch) return (1 - progress) * range;
    const peak = 0.65;
    const phase = progress < peak
      ? 0.5 * (progress / peak)
      : 0.5 + 0.5 * ((progress - peak) / (1 - peak));
    return Math.sin(Math.PI * phase) * range;
  };

  const onsets = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const column of onsetColumns) {
      onsets.push({
        bar,
        column,
        strong: column % (stepsPerBar / 2) === 0,
        offBeat: column % stepsPerBeat !== 0,
      });
    }
  }

  const chordPitchClasses = (bar) => {
    if (!options.chords?.length) return scalePitchClasses;
    return new Set(options.chords[bar % options.chords.length].map(pitchClass));
  };

  const tonic = pitchClass(options.rootMidi);
  const third = scalePitchClasses.has(pitchClass(tonic + 4))
    ? pitchClass(tonic + 4)
    : pitchClass(tonic + 3);
  const leadingTone = pitchClass(tonic + 11);
  const pink = pinkGenerator(5, rng);
  const legato = options.legato ?? 0.85;
  const maxLeap = options.maxLeap ?? 7;
  const cadence = options.cadence ?? 'tonic';
  const anchorStrength = options.anchorStrength ?? 0.6;

  let previous = pickPitch(
    chordPitchClasses(0),
    startFallback,
    startFallback,
    Math.max(low, startFallback - maxLeap),
    Math.min(high, startFallback + maxLeap),
    rng,
  );
  let previousMove2 = 0;
  let previousMove1 = 0;
  const notes = [];

  for (let index = 0; index < onsets.length; index++) {
    const onset = onsets[index];
    const progress = index / Math.max(1, onsets.length - 1);
    const allowed = onset.strong ? chordPitchClasses(onset.bar) : scalePitchClasses;
    const move = nextScaleMove(previousMove2, previousMove1, rng);
    const drift = (pink() - 0.5) * range * 0.6;
    let desired = 0.72 * (previous + move) + 0.28 * (center + contour(progress) + drift);
    if (options.anchor && index < options.anchor.length) {
      desired = (1 - anchorStrength) * desired + anchorStrength * options.anchor[index];
    }

    let pull;
    const previousClass = pitchClass(previous);
    if (previousClass === leadingTone && scalePitchClasses.has(leadingTone)) {
      pull = { pitchClass: tonic, direction: 1, strength: 1.6 };
    } else if (previousClass === pitchClass(tonic + 5)) {
      pull = { pitchClass: third, direction: -1, strength: 1.2 };
    }

    const last = index === onsets.length - 1;
    let chosen;
    if (last && cadence !== 'none') {
      const target = cadence === 'dominant' ? pitchClass(tonic + 7) : tonic;
      chosen = nearestPitchClass(target, previous, low, high);
    } else {
      chosen = pickPitch(
        allowed,
        desired,
        previous,
        Math.max(low, previous - maxLeap),
        Math.min(high, previous + maxLeap),
        rng,
        pull,
      );
    }

    const startStep = onset.bar * stepsPerBar + onset.column;
    const next = onsets[index + 1];
    const endStep = next ? next.bar * stepsPerBar + next.column : bars * stepsPerBar;
    const start = startStep * stepDuration;
    const end = Math.max(
      start + stepDuration * 0.4,
      start + (endStep - startStep) * stepDuration * legato,
    );
    notes.push({
      pitch: chosen,
      start,
      end,
      velocity: Math.min(1,
        0.5
        + (onset.strong ? 0.18 : 0)
        + (pitchClass(chosen) === tonic ? 0.05 : 0)
        + (onset.offBeat ? 0.12 * groove : 0)
        + 0.14 * (contour(progress) / Math.max(1e-6, range))),
    });
    const actualMove = Math.max(-2, Math.min(2, chosen - previous));
    previousMove2 = previousMove1;
    previousMove1 = actualMove;
    previous = chosen;
  }

  return {
    phrase: { notes, duration },
    plan,
    lastPitch: notes.at(-1)?.pitch ?? previous,
  };
}

export function generatePhrase(options) {
  return generatePhrasePlanned(options).phrase;
}

function comfortPenalty(phrase) {
  if (!phrase.notes.length) return 1;
  const notesPerSecond = phrase.notes.length / phrase.duration;
  const densityPenalty = notesPerSecond < 0.5
    ? (0.5 - notesPerSecond) * 0.8
    : notesPerSecond > 5
      ? (notesPerSecond - 5) * 0.12
      : 0;
  const pitches = phrase.notes.map((note) => note.pitch);
  const pitchRange = Math.max(...pitches) - Math.min(...pitches);
  return densityPenalty + (pitchRange > 24 ? (pitchRange - 24) * 0.02 : 0);
}

const INTERVAL_WEIGHTS = Object.freeze([1.2, 3, 3, 1.6, 1.2, 0.7, 0.4, 0.5, 0.2, 0.2, 0.2, 0.2, 0.1]);

export function melodicInfoContent(phrase, weights = INTERVAL_WEIGHTS) {
  const notes = [...phrase.notes].sort((a, b) => a.start - b.start);
  if (notes.length < 2) return 0;
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let bits = 0;
  for (let index = 1; index < notes.length; index++) {
    const interval = Math.min(12, Math.abs(Math.round(notes[index].pitch - notes[index - 1].pitch)));
    bits += -Math.log2((weights[interval] || 1e-6) / total);
  }
  return bits / (notes.length - 1);
}

function predictabilityPenalty(phrase, band = { lo: 2, hi: 3.2 }) {
  const information = melodicInfoContent(phrase);
  if (information === 0) return 0;
  const deviation = information < band.lo
    ? band.lo - information
    : information > band.hi
      ? information - band.hi
      : 0;
  return 0.5 * deviation ** 2;
}

export function scorePhrase(phrase, band) {
  return -comfortPenalty(phrase) - predictabilityPenalty(phrase, band);
}

const FORM = Object.freeze(['A', "A'", 'B', "A'"]);
export const FORM_LENGTH = FORM.length;

export class PhraseFormer {
  constructor(candidateCount = 6, rng = Math.random) {
    this.candidateCount = candidateCount;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.position = 0;
    this.theme = null;
    this.lastPitch = null;
  }

  bestOf(options, band) {
    let best = null;
    let bestScore = -Infinity;
    for (let index = 0; index < this.candidateCount; index++) {
      const candidate = generatePhrasePlanned({ ...options, rng: this.rng });
      const candidateScore = scorePhrase(candidate.phrase, band);
      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    return best;
  }

  next(base, band) {
    const section = FORM[this.position % FORM.length];
    this.position++;
    const startPitch = this.lastPitch ?? undefined;
    let result;
    if (section === 'A' || !this.theme) {
      result = this.bestOf({ ...base, startPitch, cadence: 'tonic' }, band);
      this.theme = result;
    } else if (section === 'B') {
      result = this.bestOf({
        ...base,
        startPitch,
        contour: this.theme.plan.arch ? 'descend' : 'arch',
        cadence: 'dominant',
      }, band);
    } else {
      result = generatePhrasePlanned({
        ...base,
        startPitch,
        plan: this.theme.plan,
        anchor: this.theme.phrase.notes.map((note) => note.pitch),
        anchorStrength: 0.6,
        cadence: 'tonic',
        rng: this.rng,
      });
    }
    this.lastPitch = result.lastPitch;
    return result.phrase;
  }
}

const barDurationFor = (profile) => (60 / profile.bpm) * 4;

function event(pitch, start, duration, velocity, role) {
  return {
    pitch,
    start,
    duration: Math.max(0.03, duration),
    velocity: Math.max(0.05, Math.min(1, velocity)),
    role,
  };
}

function eventsFromPhrase(phrase, offset = 0, role = 'lead', velocityScale = 1) {
  return phrase.notes.map((note) => event(
    note.pitch,
    offset + note.start,
    note.end - note.start,
    note.velocity * velocityScale,
    role,
  ));
}

function sortedChunk(duration, events, metadata = {}) {
  return {
    ...metadata,
    duration,
    events: events.sort((left, right) => left.start - right.start || left.pitch - right.pitch),
  };
}

function nearestScaleNeighbor(profile, pitch, direction) {
  const classes = new Set(profile.scale.map((offset) => pitchClass(profile.rootMidi + offset)));
  for (let distance = 1; distance <= 3; distance++) {
    const candidate = pitch + distance * direction;
    if (classes.has(pitchClass(candidate))) return candidate;
  }
  return pitch + 2 * direction;
}

function withoutCoincidentDuplicates(events) {
  const byOnsetAndPitch = new Map();
  for (const musicalEvent of events) {
    const key = `${musicalEvent.start.toFixed(9)}:${musicalEvent.pitch}`;
    const existing = byOnsetAndPitch.get(key);
    if (!existing || musicalEvent.velocity > existing.velocity) {
      byOnsetAndPitch.set(key, musicalEvent);
    }
  }
  return [...byOnsetAndPitch.values()];
}

const AMBIENT_PROGRESSIONS = Object.freeze([
  Object.freeze([0, 3, 5, 4]),
  Object.freeze([0, 5, 3, 4]),
  Object.freeze([5, 3, 0, 4]),
  Object.freeze([0, 1, 5, 4]),
  Object.freeze([0, 3, 1, 4]),
  Object.freeze([0, 5, 1, 3]),
  Object.freeze([3, 0, 5, 4]),
  Object.freeze([0, 2, 3, 4]),
]);

const AMBIENT_BASS_PATTERNS = Object.freeze([
  Object.freeze([0]),
  Object.freeze([0, 2]),
  Object.freeze([0, 1, 2, 3]),
  Object.freeze([0, 0.5, 2, 2.5]),
  Object.freeze([0, 1.5, 2.5, 3.5]),
  Object.freeze([0, 0.75, 1.5, 2.25, 3]),
  Object.freeze([0, 1, 1.5, 2.5, 3]),
  Object.freeze([0, 0.5, 1.5, 2, 3, 3.5]),
]);

const CLASSICAL_PROGRESSIONS = Object.freeze([
  Object.freeze([0, 4, 3, 0]),
  Object.freeze([0, 4, 5, 0]),
  Object.freeze([5, 4, 1, 0]),
  Object.freeze([3, 4, 1, 0]),
  Object.freeze([0, 4, 4, 0]),
  Object.freeze([5, 4, 3, 0]),
  Object.freeze([0, 4, 1, 0]),
  Object.freeze([3, 4, 5, 0]),
]);

const BAROQUE_PROGRESSIONS = Object.freeze({
  A: Object.freeze([
    Object.freeze([0, 3, 1, 4]),
    Object.freeze([0, 5, 3, 4]),
    Object.freeze([0, 1, 3, 4]),
    Object.freeze([0, 5, 1, 4]),
    Object.freeze([0, 3, 5, 4]),
    Object.freeze([0, 1, 5, 4]),
  ]),
  B: Object.freeze([
    Object.freeze([4, 5, 3, 0]),
    Object.freeze([4, 1, 4, 0]),
    Object.freeze([4, 3, 1, 0]),
    Object.freeze([4, 5, 1, 0]),
    Object.freeze([4, 3, 4, 0]),
    Object.freeze([4, 1, 3, 0]),
  ]),
});

const CLASSICAL_ACCOMPANIMENT_PATTERNS = Object.freeze([
  Object.freeze([0, 2, 1, 2, 0, 2, 1, 2]),
  Object.freeze([0, 1, 2, 1, 0, 1, 2, 1]),
  Object.freeze([0, 2, 1, 2, 2, 1, 0, 1]),
  Object.freeze([0, 1, 2, 1, 0, 2, 1, 2]),
  Object.freeze([1, 2, 0, 2, 1, 2, 0, 2]),
  Object.freeze([2, 1, 0, 1, 2, 1, 0, 1]),
  Object.freeze([0, 2, 0, 1, 0, 2, 0, 1]),
  Object.freeze([1, 0, 2, 0, 1, 0, 2, 0]),
  Object.freeze([2, 0, 1, 0, 2, 0, 1, 0]),
  Object.freeze([0, 1, 0, 2, 1, 2, 1, 0]),
]);

const BAROQUE_BROKEN_CHORD_PATTERNS = Object.freeze([
  Object.freeze([0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2]),
  Object.freeze([0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1]),
  Object.freeze([2, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 0]),
  Object.freeze([0, 1, 2, 0, 1, 2, 1, 0, 2, 1, 0, 2, 0, 2, 1, 2]),
  Object.freeze([1, 0, 2, 0, 1, 2, 0, 2, 1, 0, 2, 0, 1, 2, 1, 2]),
  Object.freeze([0, 2, 0, 1, 2, 1, 0, 1, 0, 2, 0, 1, 2, 1, 2, 1]),
  Object.freeze([2, 0, 1, 2, 1, 0, 2, 1, 0, 2, 0, 1, 0, 1, 2, 1]),
  Object.freeze([1, 2, 0, 2, 1, 0, 1, 2, 0, 1, 2, 1, 0, 2, 0, 1]),
]);

const BAROQUE_ACCOMPANIMENT_GRIDS = Object.freeze([
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  Object.freeze([0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 15]),
  Object.freeze([0, 2, 4, 6, 8, 10, 12, 14]),
  Object.freeze([0, 1, 3, 4, 6, 8, 9, 11, 13, 15]),
  Object.freeze([0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15]),
  Object.freeze([0, 2, 3, 5, 7, 8, 10, 12, 14]),
  Object.freeze([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15]),
  Object.freeze([0, 1, 2, 4, 5, 7, 8, 9, 11, 12, 14, 15]),
]);

const BAROQUE_GESTURE_COLUMNS = Object.freeze([
  Object.freeze([0, 1, 2, 3, 5, 7, 9, 11, 13, 15]),
  Object.freeze([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 6, 8, 10, 12, 15]),
]);

const BAROQUE_LEAD_COLUMNS = Object.freeze([
  Object.freeze([0, 2, 4, 6, 8, 10, 12, 14, 15]),
  Object.freeze([0, 1, 3, 5, 7, 9, 11, 13, 15]),
  Object.freeze([0, 2, 3, 6, 8, 9, 12, 14, 15]),
  Object.freeze([0, 3, 4, 7, 8, 11, 12, 15]),
  Object.freeze([0, 1, 4, 5, 8, 9, 12, 13, 15]),
  Object.freeze([0, 2, 5, 7, 10, 12, 15]),
  Object.freeze([0, 1, 2, 3, 5, 7, 9, 11, 13, 15]),
  Object.freeze([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 13, 15]),
  Object.freeze([0, 1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 15]),
  Object.freeze([0, 1, 2, 3, 5, 7, 8, 10, 11, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 13, 15]),
  Object.freeze([0, 1, 2, 3, 6, 7, 8, 9, 10, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15]),
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15]),
  Object.freeze([0, 1, 2, 3, 6, 8, 10, 12, 15]),
  Object.freeze([0, 1, 2, 3, 5, 8, 11, 13, 15]),
]);

function choiceIndex(rng, length, offset = 0) {
  if (length <= 1) return 0;
  const draw = Number(rng());
  const bounded = Number.isFinite(draw) ? clamp(draw, 0, 1 - Number.EPSILON) : 0;
  return (Math.floor(bounded * length) + offset) % length;
}

function choice(values, rng, offset = 0) {
  return values[choiceIndex(rng, values.length, offset)];
}

function pitchClassInRange(target, reference, low, high) {
  const wanted = pitchClass(target);
  let best = null;
  let distance = Infinity;
  for (let pitch = Math.ceil(low); pitch <= Math.floor(high); pitch++) {
    if (pitchClass(pitch) !== wanted) continue;
    const candidateDistance = Math.abs(pitch - reference);
    if (candidateDistance < distance) {
      best = pitch;
      distance = candidateDistance;
    }
  }
  if (best === null) throw new RangeError(`Pitch class ${wanted} is unavailable in ${low}-${high}`);
  return best;
}

function scalePitch(profile, degree) {
  const length = profile.scale.length;
  const octave = Math.floor(degree / length);
  const index = ((degree % length) + length) % length;
  return profile.rootMidi + profile.scale[index] + octave * 12;
}

function scaleChord(profile, degree, toneCount = 3) {
  const pitches = [];
  for (let tone = 0; tone < toneCount; tone++) {
    let pitch = scalePitch(profile, degree + tone * 2);
    while (pitches.length > 0 && pitch <= pitches.at(-1)) pitch += 12;
    pitches.push(pitch);
  }
  return pitches;
}

function scaleTriad(profile, degree) {
  return scaleChord(profile, degree, 3);
}

function profileWithProgression(profile, degrees, toneCount = 3) {
  return {
    ...profile,
    chords: degrees.map((degree) => scaleChord(profile, degree, toneCount)),
  };
}

function transposeProfile(profile, semitones) {
  return {
    ...profile,
    rootMidi: profile.rootMidi + semitones,
    chords: profile.chords.map((chord) => chord.map((pitch) => pitch + semitones)),
    keyOffsets: [...(profile.keyOffsets ?? [0])],
  };
}

function lowKeyboardPitch(profile, pitch, reference = profile.rootMidi - 10) {
  return pitchClassInRange(pitch, reference, 31, 45);
}

function middleChordVoicing(profile, chord, inversion = 0) {
  const ordered = [...chord.slice(inversion), ...chord.slice(0, inversion)];
  const low = 50;
  const high = 67;
  return ordered.map((pitch, index) => pitchClassInRange(
    pitch,
    low + 2 + index * 4,
    low,
    high,
  ));
}

function upperKeyboardClass(profile, pitch, reference = profile.rootMidi + 29) {
  return pitchClassInRange(pitch, reference, 72, 84);
}

function voicedEvents(pitches, start, duration, velocity, role) {
  return pitches.map((pitch, index) => event(
    pitch,
    start,
    duration,
    velocity - index * 0.025,
    role,
  ));
}

function varyPerformance(events, rng, amount = 0.065) {
  return events.map((musicalEvent) => ({
    ...musicalEvent,
    duration: Math.max(0.03, musicalEvent.duration * (0.92 + rng() * 0.14)),
    velocity: clamp(musicalEvent.velocity + (rng() - 0.5) * amount * 2, 0.05, 1),
  }));
}

function chunkEventSignature(chunk) {
  return chunk.events.map((musicalEvent) => [
    musicalEvent.role,
    musicalEvent.pitch,
    musicalEvent.start.toFixed(7),
  ].join(':')).join('|');
}

function chunkSurfaceSignature(chunk) {
  return chunk.events.map((musicalEvent) => [
    musicalEvent.role,
    musicalEvent.start.toFixed(7),
  ].join(':')).join('|');
}

function ambientPadVoicing(chord, inversion, spread) {
  const rotated = [...chord.slice(inversion), ...chord.slice(0, inversion).map((pitch) => pitch + 12)];
  return rotated.map((pitch, index) => {
    let voiced = pitch + (spread && index >= 2 ? 12 : 0);
    while (voiced > 84) voiced -= 12;
    while (voiced < 43) voiced += 12;
    return voiced;
  });
}

function variedAmbientHarmonyEvents(profile, barDuration, rng, position) {
  const events = [];
  const beat = barDuration / 4;
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const chord = profile.chords[bar];
    const inversion = choiceIndex(rng, chord.length, position + bar);
    const voicing = ambientPadVoicing(chord, inversion, rng() < 0.42);
    for (let index = 0; index < voicing.length; index++) {
      events.push(event(
        voicing[index],
        bar * barDuration,
        barDuration * (0.78 + rng() * 0.17),
        0.62 - index * 0.035,
        'pad',
      ));
    }

    const bassPattern = choice(AMBIENT_BASS_PATTERNS, rng, position + bar);
    for (let index = 0; index < bassPattern.length; index++) {
      const beatOffset = bassPattern[index];
      const nextBeat = bassPattern[index + 1] ?? 4;
      const pitch = index % 3 === 1 ? chord[Math.min(2, chord.length - 1)] - 12 : chord[0] - 12;
      events.push(event(
        pitch,
        bar * barDuration + beatOffset * beat,
        Math.max(beat * 0.45, (nextBeat - beatOffset) * beat * 0.8),
        index === 0 ? 0.7 : 0.52,
        'bass',
      ));
    }
  }
  return events;
}

function variedClassicalBassEvents(profile, barDuration, rng, position) {
  const events = [];
  const beat = barDuration / 4;
  const patterns = [
    [[0, 0, 3.72]],
    [[0, 0, 1.85], [2, 2, 1.72]],
    [[0, 0, 0.9], [2, 1, 0.9], [1, 2, 0.9], [0, 3, 0.84]],
    [[0, 0, 1.85], [1, 2, 0.9], [2, 3, 0.84]],
    [[0, 0, 0.9], [1, 1, 0.9], [2, 2, 0.9], [1, 3, 0.84]],
  ];
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const chord = profile.chords[bar];
    const pattern = choice(patterns, rng, position + bar);
    for (const [tone, beatOffset, beatLength] of pattern) {
      events.push(event(
        lowKeyboardPitch(profile, chord[tone % chord.length]),
        bar * barDuration + beatOffset * beat,
        beatLength * beat,
        beatOffset === 0 ? 0.64 : 0.55,
        'bass',
      ));
    }
  }
  const halfBars = Math.max(1, Math.floor(profile.chords.length / 2));
  for (const bar of [halfBars - 1, profile.chords.length - 1]) {
    events.push(event(
      lowKeyboardPitch(profile, profile.chords[bar][0]),
      (bar + 1) * barDuration - beat,
      beat * 0.9,
      bar === profile.chords.length - 1 ? 0.7 : 0.66,
      'bass',
    ));
  }
  return events;
}

function variedClassicalAccompanimentEvents(profile, barDuration, rng, position) {
  const events = [];
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const pattern = choice(CLASSICAL_ACCOMPANIMENT_PATTERNS, rng, position + bar);
    const inversion = choiceIndex(rng, 3, position + bar);
    const voicing = middleChordVoicing(profile, profile.chords[bar], inversion);
    const step = barDuration / pattern.length;
    for (let index = 0; index < pattern.length; index++) {
      events.push(event(
        voicing[pattern[index] % voicing.length],
        bar * barDuration + index * step,
        step * (index % 4 === 3 ? 0.74 : 0.83),
        index % 4 === 0 ? 0.58 : 0.47,
        'accompaniment',
      ));
    }
  }
  return events;
}

function variedClassicalHarmonyEvents(profile, barDuration, rng, position) {
  const events = [];
  const beat = barDuration / 4;
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const inversion = choiceIndex(rng, 3, position + bar);
    events.push(...voicedEvents(
      middleChordVoicing(profile, profile.chords[bar], inversion),
      bar * barDuration,
      beat * 0.52,
      0.51,
      'harmony',
    ));
  }
  const halfBars = Math.max(1, Math.floor(profile.chords.length / 2));
  for (const bar of [halfBars - 1, profile.chords.length - 1]) {
    events.push(...voicedEvents(
      middleChordVoicing(profile, profile.chords[bar], choiceIndex(rng, 3, position + bar + 1)),
      (bar + 1) * barDuration - beat,
      beat * 0.75,
      bar === profile.chords.length - 1 ? 0.64 : 0.58,
      'harmony',
    ));
  }
  return events;
}

function variedClassicalLeadEvents(profile, barDuration, rng, lastPitch) {
  const halfBars = Math.max(1, Math.floor(profile.chords.length / 2));
  const leadLow = 72;
  const common = {
    bpm: profile.bpm,
    scale: profile.scale,
    rootMidi: profile.rootMidi,
    density: clamp(profile.density * (0.82 + rng() * 0.42), 0.24, 0.7),
    groove: profile.groove,
    lowMidi: leadLow,
    highMidi: 84,
    maxLeap: 7,
    legato: 0.82 + rng() * 0.1,
    rng,
  };
  const antecedent = generatePhrasePlanned({
    ...common,
    bars: halfBars,
    chords: profile.chords.slice(0, halfBars),
    stepsPerBeat: choice([2, 2, 3, 4], rng),
    contour: choice(['arch', 'descend'], rng),
    cadence: 'dominant',
    startPitch: lastPitch ?? undefined,
  });
  const consequent = generatePhrasePlanned({
    ...common,
    bars: profile.chords.length - halfBars,
    chords: profile.chords.slice(halfBars),
    stepsPerBeat: choice([2, 3, 4, 4], rng),
    contour: choice(['arch', 'descend'], rng),
    cadence: 'tonic',
    startPitch: antecedent.lastPitch,
  });
  const beat = barDuration / 4;
  const halfCadenceStart = halfBars * barDuration - beat;
  const finalCadenceStart = profile.chords.length * barDuration - beat;
  const events = [
    ...eventsFromPhrase(antecedent.phrase, 0, 'lead', 1.02)
      .filter((musicalEvent) => musicalEvent.start < halfCadenceStart - 1e-6),
    ...eventsFromPhrase(consequent.phrase, halfBars * barDuration, 'lead', 1.02)
      .filter((musicalEvent) => musicalEvent.start < finalCadenceStart - 1e-6),
  ];
  events.push(event(
    upperKeyboardClass(profile, profile.rootMidi + 7),
    halfCadenceStart,
    beat * 0.46,
    0.77,
    'lead',
  ));
  events.push(event(
    upperKeyboardClass(profile, profile.rootMidi),
    finalCadenceStart,
    beat * 0.58,
    0.8,
    'lead',
  ));
  return events;
}

function boundedScaleNeighbor(profile, pitch, direction, low = 72, high = 84) {
  const preferred = nearestScaleNeighbor(profile, pitch, direction);
  if (preferred >= low && preferred <= high) return preferred;
  return nearestScaleNeighbor(profile, pitch, -direction);
}

function scaleRunInto(profile, target, noteCount, ascending = true) {
  const notes = [target];
  let pitch = target;
  let direction = ascending ? -1 : 1;
  for (let index = 1; index < noteCount; index++) {
    const next = boundedScaleNeighbor(profile, pitch, direction);
    if ((direction < 0 && next >= pitch) || (direction > 0 && next <= pitch)) direction *= -1;
    pitch = next;
    notes.unshift(pitch);
  }
  return notes;
}

function variedClassicalOrnamentEvents(profile, barDuration, rng, position) {
  const events = [];
  const step = barDuration / choice([24, 28, 32, 36], rng, position);
  const halfBars = Math.max(1, Math.floor(profile.chords.length / 2));
  const dominant = upperKeyboardClass(profile, profile.rootMidi + 7);
  const tonic = upperKeyboardClass(profile, profile.rootMidi);
  const upper = nearestScaleNeighbor(profile, dominant, dominant >= 82 ? -1 : 1);
  const lower = nearestScaleNeighbor(profile, dominant, -1);
  const turn = position % 2 === 0
    ? [dominant, upper, dominant, lower, dominant]
    : [dominant, lower, dominant, upper, dominant];
  const finalRun = scaleRunInto(profile, tonic, choice([5, 6, 7], rng, position), position % 3 !== 0);
  for (const [point, pitches] of [
    [halfBars * barDuration, turn],
    [profile.chords.length * barDuration, finalRun],
  ]) {
    const start = point - step * pitches.length;
    for (let index = 0; index < pitches.length; index++) {
      events.push(event(
        clamp(pitches[index], 72, 84),
        start + index * step,
        step * 0.8,
        index === pitches.length - 1 ? 0.74 : 0.59,
        'ornament',
      ));
    }
  }
  return events;
}

function variedClassicalKeyboardEvents(profile, barDuration, rng, position, lastPitch) {
  return varyPerformance(withoutCoincidentDuplicates([
    ...variedClassicalBassEvents(profile, barDuration, rng, position),
    ...variedClassicalAccompanimentEvents(profile, barDuration, rng, position),
    ...variedClassicalHarmonyEvents(profile, barDuration, rng, position),
    ...variedClassicalLeadEvents(profile, barDuration, rng, lastPitch),
    ...variedClassicalOrnamentEvents(profile, barDuration, rng, position),
  ]), rng);
}

function variedBaroqueBassEvents(profile, barDuration, rng, position) {
  const events = [];
  const beat = barDuration / 4;
  const patterns = [
    { onsets: [0, 1, 2, 3], tones: [0, 2, 1, 'next'] },
    { onsets: [0, 1, 2, 3], tones: [0, 1, 2, 'next'] },
    { onsets: [0, 2], tones: [0, 'next'] },
    { onsets: [0, 1.5, 2.5, 3.5], tones: [0, 2, 1, 'next'] },
    { onsets: [0, 0.5, 1.5, 2.5, 3.5], tones: [0, 0, 2, 1, 'next'] },
    { onsets: [0, 1, 1.5, 2, 3], tones: [0, 2, 1, 0, 'next'] },
    { onsets: [0, 0.75, 2, 2.75], tones: [0, 1, 2, 'next'] },
    { onsets: [0, 0.5, 1, 2, 3, 3.5], tones: [0, 2, 1, 0, 2, 'next'] },
  ];
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const chord = profile.chords[bar];
    const nextChord = profile.chords[Math.min(profile.chords.length - 1, bar + 1)];
    const pattern = choice(patterns, rng, position + bar);
    for (let index = 0; index < pattern.onsets.length; index++) {
      const token = pattern.tones[index];
      const source = token === 'next' ? nextChord[0] : chord[token % chord.length];
      const nextOnset = pattern.onsets[index + 1] ?? 4;
      events.push(event(
        lowKeyboardPitch(profile, source, profile.rootMidi - 9 + index),
        bar * barDuration + pattern.onsets[index] * beat,
        Math.max(beat * 0.38, (nextOnset - pattern.onsets[index]) * beat * 0.82),
        index === 0 ? 0.65 : 0.54,
        'bass',
      ));
    }
  }
  return events;
}

function variedBaroqueBrokenChordEvents(profile, barDuration, rng, position) {
  const events = [];
  const sixteenth = barDuration / 16;
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const pattern = choice(BAROQUE_BROKEN_CHORD_PATTERNS, rng, position + bar);
    const grid = choice(BAROQUE_ACCOMPANIMENT_GRIDS, rng, position * 2 + bar);
    const voicing = middleChordVoicing(profile, profile.chords[bar], choiceIndex(rng, 3, bar + position));
    for (let index = 0; index < grid.length; index++) {
      const column = grid[index];
      const nextColumn = grid[index + 1] ?? 16;
      events.push(event(
        voicing[pattern[index % pattern.length] % voicing.length],
        bar * barDuration + column * sixteenth,
        Math.max(sixteenth * 0.62, (nextColumn - column) * sixteenth * 0.72),
        index % 4 === 0 ? 0.57 : 0.45,
        'accompaniment',
      ));
    }
  }
  return events;
}

function variedBaroqueHarmonyEvents(profile, barDuration, rng, position) {
  const events = [];
  const sixteenth = barDuration / 16;
  for (let bar = 0; bar < profile.chords.length; bar++) {
    events.push(...voicedEvents(
      middleChordVoicing(profile, profile.chords[bar], choiceIndex(rng, 3, position + bar)),
      bar * barDuration,
      sixteenth * 1.65,
      0.52,
      'harmony',
    ));
  }
  events.push(...voicedEvents(
    middleChordVoicing(profile, profile.chords.at(-1), choiceIndex(rng, 3, position + 1)),
    profile.chords.length * barDuration - sixteenth,
    sixteenth * 1.35,
    0.64,
    'harmony',
  ));
  return events;
}

function baroqueMotifPitches(profile, chordTones, columns, family, rng, salt) {
  const root = chordTones[0];
  const top = Math.max(...chordTones);
  const neighbor = boundedScaleNeighbor(profile, top, top >= 82 ? -1 : 1);
  const targetLength = columns.length - 1;
  let pitches;
  if (family === 0) {
    pitches = [top, top, neighbor, top];
  } else if (family === 1) {
    pitches = [root, root, root, chordTones[1], root];
  } else if (family === 2) {
    const ascending = [...chordTones].sort((left, right) => left - right);
    pitches = Array.from({ length: targetLength }, (_, index) => (
      ascending[(index + salt) % ascending.length]
    ));
  } else if (family === 3) {
    let pitch = choice(chordTones, rng, salt);
    let direction = pitch >= 81 ? -1 : 1;
    pitches = [pitch];
    while (pitches.length < targetLength) {
      const next = boundedScaleNeighbor(profile, pitch, direction);
      if ((direction > 0 && next <= pitch) || (direction < 0 && next >= pitch)) direction *= -1;
      pitch = next;
      pitches.push(pitch);
    }
  } else {
    const low = Math.min(...chordTones);
    pitches = [root, top, low, chordTones[1], top, root];
  }

  while (pitches.length < targetLength) {
    const index = pitches.length;
    const tone = chordTones[choiceIndex(rng, chordTones.length, salt + index)];
    pitches.push(rng() < 0.24 ? boundedScaleNeighbor(profile, tone, tone >= 82 ? -1 : 1) : tone);
  }
  pitches.length = targetLength;
  if (pitches.length > 6) pitches[Math.floor(pitches.length / 2)] = root;
  return pitches;
}

function variedBaroqueLeadAndCounterEvents(profile, barDuration, rng, position, section) {
  const lead = [];
  const counter = [];
  const sixteenth = barDuration / 16;
  const cadenceClass = section === 'A' ? profile.rootMidi + 7 : profile.rootMidi;
  const gestureBar = choiceIndex(rng, profile.chords.length, position);
  for (let bar = 0; bar < profile.chords.length; bar++) {
    const chord = profile.chords[bar];
    const columns = choice(
      bar === gestureBar ? BAROQUE_GESTURE_COLUMNS : BAROQUE_LEAD_COLUMNS,
      rng,
      position * 3 + bar,
    );
    const chordTones = chord.map((pitch, index) => upperKeyboardClass(
      profile,
      pitch,
      profile.rootMidi + 28 + index * 2,
    ));
    const family = bar === gestureBar ? 0 : 1 + choiceIndex(rng, 4, position + bar);
    const pitches = baroqueMotifPitches(
      profile,
      chordTones,
      columns,
      family,
      rng,
      position * profile.chords.length + bar,
    );
    const endingTarget = bar === profile.chords.length - 1
      ? cadenceClass
      : profile.chords[bar + 1][choiceIndex(rng, profile.chords[bar + 1].length, position + bar)];
    pitches.push(upperKeyboardClass(
      profile,
      endingTarget,
      section === 'A' ? profile.rootMidi + 31 : profile.rootMidi + 28,
    ));
    for (let index = 0; index < columns.length; index++) {
      lead.push(event(
        clamp(pitches[index], 72, 84),
        bar * barDuration + columns[index] * sixteenth,
        sixteenth * (family === 3 ? 0.72 : 0.84),
        index === 0 ? 0.71 : 0.61,
        'lead',
      ));
    }
    const counterIndexes = [
      Math.floor(columns.length * 0.38),
      Math.floor(columns.length * 0.62),
      columns.length - 2,
    ];
    for (const index of counterIndexes) {
      if (index < 1 || index >= columns.length - 1) continue;
      const upper = pitches[index];
      const companion = chordTones
        .filter((pitch) => pitch !== upper)
        .sort((left, right) => Math.abs(Math.abs(upper - left) - 4) - Math.abs(Math.abs(upper - right) - 4))[0];
      if (companion === undefined || companion === upper) continue;
      counter.push(event(
        companion,
        bar * barDuration + columns[index] * sixteenth,
        sixteenth * 0.8,
        0.5,
        'counter',
      ));
    }
  }
  return [...lead, ...counter];
}

function variedBaroqueKeyboardEvents(profile, barDuration, rng, position, section) {
  return varyPerformance(withoutCoincidentDuplicates([
    ...variedBaroqueBassEvents(profile, barDuration, rng, position),
    ...variedBaroqueBrokenChordEvents(profile, barDuration, rng, position),
    ...variedBaroqueHarmonyEvents(profile, barDuration, rng, position),
    ...variedBaroqueLeadAndCounterEvents(profile, barDuration, rng, position, section),
  ]), rng, 0.055);
}

/** Stateful pure composer. It receives no Web Audio handles, clocks, or modulation rate. */
export class StyleComposer {
  constructor(candidateCount = 6, rng = Math.random, options = {}) {
    this.rng = rng;
    this.former = new PhraseFormer(candidateCount, rng);
    this.avoidKeyOffset = Number.isFinite(options?.avoidKeyOffset) ? options.avoidKeyOffset : null;
    this.position = 0;
    this.lastClassicalPitch = null;
    this.session = null;
    this.previousChunkSignature = null;
    this.previousSurfaceSignature = null;
  }

  reset() {
    this.former.reset();
    this.position = 0;
    this.lastClassicalPitch = null;
    this.session = null;
    this.previousChunkSignature = null;
    this.previousSurfaceSignature = null;
  }

  sessionProfile(profile) {
    const identity = JSON.stringify([
      profile.mode,
      profile.style,
      profile.rootMidi,
      profile.bpm,
      profile.scale,
      profile.chords,
      profile.keyOffsets ?? [0],
    ]);
    if (!this.session || this.session.identity !== identity) {
      const approvedOffsets = profile.keyOffsets ?? [0];
      const alternatives = approvedOffsets.filter((offset) => offset !== this.avoidKeyOffset);
      const keyOffset = choice(alternatives.length > 0 ? alternatives : approvedOffsets, this.rng);
      this.session = {
        identity,
        keyOffset,
        profile: transposeProfile(profile, keyOffset),
      };
      this.position = 0;
      this.lastClassicalPitch = null;
      this.previousChunkSignature = null;
      this.previousSurfaceSignature = null;
    }
    return this.session.profile;
  }

  next(profile) {
    if (!['ambient', 'classical', 'baroque'].includes(profile.style)) {
      throw new RangeError(`Unsupported composition style: ${profile.style}`);
    }
    const sessionProfile = this.sessionProfile(profile);
    let chunk;
    let signature;
    let surfaceSignature;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (profile.style === 'ambient') chunk = this.nextAmbient(sessionProfile);
      else if (profile.style === 'classical') chunk = this.nextClassical(sessionProfile);
      else chunk = this.nextBaroque(sessionProfile);
      signature = chunkEventSignature(chunk);
      surfaceSignature = chunkSurfaceSignature(chunk);
      if (
        signature !== this.previousChunkSignature
        && surfaceSignature !== this.previousSurfaceSignature
      ) break;
    }
    this.previousChunkSignature = signature;
    this.previousSurfaceSignature = surfaceSignature;
    return chunk;
  }

  nextAmbient(profile) {
    const position = this.position++;
    const progression = choice(AMBIENT_PROGRESSIONS, this.rng, position);
    const chunkProfile = profileWithProgression(profile, progression, 4);
    const barDuration = barDurationFor(chunkProfile);
    const duration = barDuration * chunkProfile.chords.length;
    const lead = this.former.next({
      bpm: chunkProfile.bpm,
      scale: chunkProfile.scale,
      rootMidi: chunkProfile.rootMidi,
      bars: chunkProfile.chords.length,
      density: clamp(chunkProfile.density * (0.78 + this.rng() * 0.5), 0.2, 0.75),
      chords: chunkProfile.chords,
      groove: clamp(chunkProfile.groove * (0.72 + this.rng() * 0.5), 0, 0.7),
    }, chunkProfile.icBand);
    const counter = generatePhrase({
      bpm: chunkProfile.bpm,
      scale: chunkProfile.scale,
      rootMidi: chunkProfile.rootMidi,
      bars: chunkProfile.chords.length,
      density: clamp(chunkProfile.density * (0.18 + this.rng() * 0.3), 0.08, 0.3),
      groove: 0,
      stepsPerBeat: choice([1, 2, 3], this.rng, position),
      octave: 0,
      legato: 0.86 + this.rng() * 0.1,
      rng: this.rng,
    });
    const events = varyPerformance(withoutCoincidentDuplicates([
      ...variedAmbientHarmonyEvents(chunkProfile, barDuration, this.rng, position),
      ...eventsFromPhrase(lead),
      ...eventsFromPhrase(counter, 0, 'counter', 0.42),
    ]), this.rng, 0.045);
    return sortedChunk(duration, events, { tonicMidi: chunkProfile.rootMidi });
  }

  nextClassical(profile) {
    const position = this.position++;
    const progression = choice(CLASSICAL_PROGRESSIONS, this.rng, position);
    const chunkProfile = profileWithProgression(profile, progression);
    const barDuration = barDurationFor(chunkProfile);
    const duration = barDuration * chunkProfile.chords.length;
    const events = variedClassicalKeyboardEvents(
      chunkProfile,
      barDuration,
      this.rng,
      position,
      this.lastClassicalPitch,
    );
    this.lastClassicalPitch = events
      .filter((musicalEvent) => musicalEvent.role === 'lead')
      .sort((left, right) => left.start - right.start)
      .at(-1)?.pitch ?? null;
    return sortedChunk(duration, events, { tonicMidi: chunkProfile.rootMidi });
  }

  nextBaroque(profile) {
    const position = this.position++;
    const section = position % 2 === 0 ? 'A' : 'B';
    const progression = choice(BAROQUE_PROGRESSIONS[section], this.rng, position);
    const chunkProfile = profileWithProgression(profile, progression);
    const barDuration = barDurationFor(chunkProfile);
    return sortedChunk(
      barDuration * chunkProfile.chords.length,
      variedBaroqueKeyboardEvents(chunkProfile, barDuration, this.rng, position, section),
      { tonicMidi: chunkProfile.rootMidi },
    );
  }
}
