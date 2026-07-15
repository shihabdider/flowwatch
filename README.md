# FlowWatch

One click to enter flow, with generated focus music and a timed recovery break.

## Features

- Toolbar focus timer with a countdown badge
- Optional intention prompt before a session
- Locally recorded sessions and year/month heatmap
- Dynamic breaks equal to 20% of completed focus time, clamped to 3–20 minutes
- Generated focus music during focus sessions and relax music during completed-session breaks
- Whole-mix amplitude modulation with separate configurable rates:
  - Focus: 12–16 Hz (default 12 Hz)
  - Relax: 8–12 Hz (default 8 Hz)
- Three complete musical styles:
  - Ambient with the existing neuralfm synth
  - Mozart-informed Classical with locally sampled piano
  - Scarlatti-informed Baroque with locally sampled harpsichord

The sampled styles use compact, closely spaced stereo acoustic recordings bundled with the extension. Piano has two velocity layers; Harpsichord has matched pluck and key-release recordings. Classical combines melody, bass, Alberti accompaniment, chords, and cadential turns; Baroque combines independent registers, broken chords, repeated-note ornaments, interval pairs, and chordal cadences. Exact sources, conversions, and licenses are recorded in [`audio/samples/PROVENANCE.md`](audio/samples/PROVENANCE.md). Composer-informed means using broad musical traits, not reproducing specific works or claiming exact imitation.

The generated audio adapts the permitted core algorithm from the private `neuralfm` project. It uses one broadband amplitude envelope for both channels; it is not a binaural-beat pair. The audio is experimental and is not presented as a clinically proven intervention.

## Install

```sh
git clone https://github.com/shihabdider/flowwatch
```

In Chrome:

1. Open **Manage Extensions**.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository.

No runtime dependencies or build step are required.

## Use

- Click the extension icon to start focus.
- Click again to end focus.
- Ending before the planned duration stops cleanly and records the elapsed session.
- Ending at or after the planned duration starts the calculated break and relax audio.
- Click during a break to finish it early.
- Open the extension options to configure timer length, generated audio, modulation rates, and style, or to view the activity heatmap.

## Development

Requires a current Node.js release for checks only; extension runtime code remains browser-native.

```sh
npm test       # policy, composition, instrument, engine, and lifecycle tests
npm run check  # syntax, manifest, and local sample/provenance checks
npm run verify # both
```
