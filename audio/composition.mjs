// Pure generative composition adapted with permission from neuralfm's algorithmic engine.
// It uses an order-2 rhythm/pitch walk, harmony-aware strong beats, phrase contour,
// tonal cadences, A/A-prime/B/A-prime form, and best-of-N comfort selection.

const pitchClass = (midi) => ((midi % 12) + 12) % 12;

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

  const low = options.rootMidi + 12 * octave;
  const high = low + 12;
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

function onsetEnvelope(phrase, sampleRate = 200) {
  const length = Math.max(1, Math.round(phrase.duration * sampleRate));
  const envelope = new Float32Array(length);
  const attack = Math.max(1, Math.round(0.01 * sampleRate));
  for (const note of phrase.notes) {
    const start = Math.round(note.start * sampleRate);
    const end = Math.min(length, Math.round(note.end * sampleRate));
    for (let index = Math.max(0, start); index < end; index++) {
      const elapsed = index - start;
      const amplitude = elapsed < attack
        ? elapsed / attack
        : 0.55 + 0.45 * Math.exp(-(elapsed - attack) / (0.25 * sampleRate));
      envelope[index] = Math.max(envelope[index], note.velocity * amplitude);
    }
  }
  return envelope;
}

function amplitudeAt(signal, frequency, sampleRate) {
  const mean = signal.reduce((sum, value) => sum + value, 0) / signal.length;
  const angularStep = (2 * Math.PI * frequency) / sampleRate;
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < signal.length; index++) {
    const centered = signal[index] - mean;
    real += centered * Math.cos(angularStep * index);
    imaginary += centered * Math.sin(angularStep * index);
  }
  return (2 / signal.length) * Math.hypot(real, imaginary);
}

function entrainmentScore(phrase, modFreq, sampleRate = 200) {
  const envelope = onsetEnvelope(phrase, sampleRate);
  const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
  return mean < 1e-6 ? 0 : amplitudeAt(envelope, modFreq, sampleRate) / mean;
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

export function scorePhrase(phrase, modFreq, band) {
  return entrainmentScore(phrase, modFreq)
    - comfortPenalty(phrase)
    - predictabilityPenalty(phrase, band);
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

  bestOf(options, modFreq, band) {
    let best = null;
    let bestScore = -Infinity;
    for (let index = 0; index < this.candidateCount; index++) {
      const candidate = generatePhrasePlanned({ ...options, rng: this.rng });
      const candidateScore = scorePhrase(candidate.phrase, modFreq, band);
      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    return best;
  }

  next(base, modFreq, band) {
    const section = FORM[this.position % FORM.length];
    this.position++;
    const startPitch = this.lastPitch ?? undefined;
    let result;
    if (section === 'A' || !this.theme) {
      result = this.bestOf({ ...base, startPitch, cadence: 'tonic' }, modFreq, band);
      this.theme = result;
    } else if (section === 'B') {
      result = this.bestOf({
        ...base,
        startPitch,
        contour: this.theme.plan.arch ? 'descend' : 'arch',
        cadence: 'dominant',
      }, modFreq, band);
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
