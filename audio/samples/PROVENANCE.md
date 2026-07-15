# Instrument sample provenance

These recordings are bundled locally and decoded by `audio/instruments.mjs`. Mozart's and Scarlatti's compositions being public domain does not determine the copyright status of these recordings; the recording/sample licenses below are the authority for redistribution.

No sample is fetched remotely at runtime. Replacing, adding, or regenerating a sample requires updating this document and the local catalog together.

## Piano — Salamander Grand Piano V3

- Runtime files: `piano/A1-v05.mp3`, `piano/A1-v13.mp3`, `piano/A2-v05.mp3`, `piano/A2-v13.mp3`, `piano/A3-v05.mp3`, `piano/A3-v13.mp3`, `piano/A4-v05.mp3`, `piano/A4-v13.mp3`, `piano/A5-v05.mp3`, `piano/A5-v13.mp3`, `piano/C2-v05.mp3`, `piano/C2-v13.mp3`, `piano/C3-v05.mp3`, `piano/C3-v13.mp3`, `piano/C4-v05.mp3`, `piano/C4-v13.mp3`, `piano/C5-v05.mp3`, `piano/C5-v13.mp3`, `piano/C6-v05.mp3`, `piano/C6-v13.mp3`, `piano/Ds2-v05.mp3`, `piano/Ds2-v13.mp3`, `piano/Ds3-v05.mp3`, `piano/Ds3-v13.mp3`, `piano/Ds4-v05.mp3`, `piano/Ds4-v13.mp3`, `piano/Ds5-v05.mp3`, `piano/Ds5-v13.mp3`, `piano/Fs1-v05.mp3`, `piano/Fs1-v13.mp3`, `piano/Fs2-v05.mp3`, `piano/Fs2-v13.mp3`, `piano/Fs3-v05.mp3`, `piano/Fs3-v13.mp3`, `piano/Fs4-v05.mp3`, `piano/Fs4-v13.mp3`, `piano/Fs5-v05.mp3`, `piano/Fs5-v13.mp3`
- Upstream project: `sfzinstruments/SalamanderGrandPiano`
- Upstream URL: https://github.com/sfzinstruments/SalamanderGrandPiano
- Upstream revision: `3382bf9496bba2486f5ab0de55a264d1dfc38404`
- Original source/author noted upstream: Salamander Grand Piano V3 by Alexander Holm, recorded at 48 kHz / 24-bit with stereo AKG C414 microphones; SFZ/FLAC remap by kinwie.
- Recording/sample license supplied upstream: Creative Commons Attribution 3.0 Unported License.
- License URL: https://creativecommons.org/licenses/by/3.0/
- Upstream source paths selected: `Samples/F#1v5.flac`, `Samples/F#1v13.flac`, `Samples/A1v5.flac`, `Samples/A1v13.flac`, `Samples/C2v5.flac`, `Samples/C2v13.flac`, `Samples/D#2v5.flac`, `Samples/D#2v13.flac`, `Samples/F#2v5.flac`, `Samples/F#2v13.flac`, `Samples/A2v5.flac`, `Samples/A2v13.flac`, `Samples/C3v5.flac`, `Samples/C3v13.flac`, `Samples/D#3v5.flac`, `Samples/D#3v13.flac`, `Samples/F#3v5.flac`, `Samples/F#3v13.flac`, `Samples/A3v5.flac`, `Samples/A3v13.flac`, `Samples/C4v5.flac`, `Samples/C4v13.flac`, `Samples/D#4v5.flac`, `Samples/D#4v13.flac`, `Samples/F#4v5.flac`, `Samples/F#4v13.flac`, `Samples/A4v5.flac`, `Samples/A4v13.flac`, `Samples/C5v5.flac`, `Samples/C5v13.flac`, `Samples/D#5v5.flac`, `Samples/D#5v13.flac`, `Samples/F#5v5.flac`, `Samples/F#5v13.flac`, `Samples/A5v5.flac`, `Samples/A5v13.flac`, `Samples/C6v5.flac`, `Samples/C6v13.flac`.
- FlowWatch modifications: selected minor-third zones F#1 through C6 to cover the generated Classical range; selected two velocity layers (`v5` soft and `v13` hard) for every zone; converted FLAC directly to local stereo MP3 at 44.1 kHz, 128 kb/s; trimmed each file to the first 4.4 seconds with a 150 ms end fade; normalized with ffmpeg `loudnorm=I=-23:TP=-2:LRA=11`; renamed `#` to `s` in local filenames.

## Harpsichord — VCSL Italian Harpsichord stop1

- Runtime files: `harpsichord/As1-rel.mp3`, `harpsichord/As1-sus.mp3`, `harpsichord/As2-rel.mp3`, `harpsichord/As2-sus.mp3`, `harpsichord/As3-rel.mp3`, `harpsichord/As3-sus.mp3`, `harpsichord/As4-rel.mp3`, `harpsichord/As4-sus.mp3`, `harpsichord/As5-sus.mp3`, `harpsichord/B5-rel.mp3`, `harpsichord/Cs2-rel.mp3`, `harpsichord/Cs2-sus.mp3`, `harpsichord/Cs3-rel.mp3`, `harpsichord/Cs3-sus.mp3`, `harpsichord/Cs4-rel.mp3`, `harpsichord/Cs4-sus.mp3`, `harpsichord/Cs5-rel.mp3`, `harpsichord/Cs5-sus.mp3`, `harpsichord/Ds2-rel.mp3`, `harpsichord/Ds2-sus.mp3`, `harpsichord/Ds3-rel.mp3`, `harpsichord/Ds3-sus.mp3`, `harpsichord/Ds4-rel.mp3`, `harpsichord/Ds4-sus.mp3`, `harpsichord/Ds5-rel.mp3`, `harpsichord/Ds5-sus.mp3`, `harpsichord/Fs1-rel.mp3`, `harpsichord/Fs1-sus.mp3`, `harpsichord/Fs2-rel.mp3`, `harpsichord/Fs2-sus.mp3`, `harpsichord/Fs3-rel.mp3`, `harpsichord/Fs3-sus.mp3`, `harpsichord/Fs4-rel.mp3`, `harpsichord/Fs4-sus.mp3`, `harpsichord/Fs5-rel.mp3`, `harpsichord/Fs5-sus.mp3`, `harpsichord/Gs1-rel.mp3`, `harpsichord/Gs1-sus.mp3`, `harpsichord/Gs2-rel.mp3`, `harpsichord/Gs2-sus.mp3`, `harpsichord/Gs3-rel.mp3`, `harpsichord/Gs3-sus.mp3`, `harpsichord/Gs4-rel.mp3`, `harpsichord/Gs4-sus.mp3`, `harpsichord/Gs5-rel.mp3`, `harpsichord/Gs5-sus.mp3`
- Upstream project: `sgossner/VCSL` (Versilian Community Sample Library)
- Upstream URL: https://github.com/sgossner/VCSL
- Upstream revision: `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`
- Recording/sample license supplied upstream: Creative Commons Zero 1.0 Universal (CC0 1.0 Universal).
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Source octave convention: VCSL Italian Harpsichord file names are one octave lower than standard MIDI sounding pitch; for example, an upstream `A#4` sustain sounds as local root MIDI 82 (`A#5`). Each local sustain file below therefore uses the direct upstream source named one octave lower than the local filename, with no pitch shifting.
- Upstream sustain paths selected (local file → exact source path, recorded root MIDI):
  - `harpsichord/Fs1-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_F#0_1.wav`; recorded root MIDI `30`.
  - `harpsichord/Gs1-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_G#0_1.wav`; recorded root MIDI `32`.
  - `harpsichord/As1-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_A#0_1.wav`; recorded root MIDI `34`.
  - `harpsichord/Cs2-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_C#1_1.wav`; recorded root MIDI `37`.
  - `harpsichord/Ds2-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_D#1_1.wav`; recorded root MIDI `39`.
  - `harpsichord/Fs2-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_F#1_1.wav`; recorded root MIDI `42`.
  - `harpsichord/Gs2-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_G#1_1.wav`; recorded root MIDI `44`.
  - `harpsichord/As2-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_A#1_1.wav`; recorded root MIDI `46`.
  - `harpsichord/Cs3-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_C#2_1.wav`; recorded root MIDI `49`.
  - `harpsichord/Ds3-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_D#2_1.wav`; recorded root MIDI `51`.
  - `harpsichord/Fs3-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_F#2_1.wav`; recorded root MIDI `54`.
  - `harpsichord/Gs3-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_G#2_1.wav`; recorded root MIDI `56`.
  - `harpsichord/As3-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_A#2_1.wav`; recorded root MIDI `58`.
  - `harpsichord/Cs4-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_C#3_1.wav`; recorded root MIDI `61`.
  - `harpsichord/Ds4-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_D#3_1.wav`; recorded root MIDI `63`.
  - `harpsichord/Fs4-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_F#3_1.wav`; recorded root MIDI `66`.
  - `harpsichord/Gs4-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_G#3_1.wav`; recorded root MIDI `68`.
  - `harpsichord/As4-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_A#3_1.wav`; recorded root MIDI `70`.
  - `harpsichord/Cs5-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_C#4_1.wav`; recorded root MIDI `73`.
  - `harpsichord/Ds5-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_D#4_1.wav`; recorded root MIDI `75`.
  - `harpsichord/Fs5-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_F#4_1.wav`; recorded root MIDI `78`.
  - `harpsichord/Gs5-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_G#4_1.wav`; recorded root MIDI `80`.
  - `harpsichord/As5-sus.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Sustains/stop1/Harpsichord_stop1_A#4_1.wav`; recorded root MIDI `82`.
- Upstream release paths selected (local file → exact source path, recorded root MIDI):
  - `harpsichord/Fs1-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_F#0_1.wav`; recorded root MIDI `30`.
  - `harpsichord/Gs1-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_G#0_1.wav`; recorded root MIDI `32`.
  - `harpsichord/As1-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_A#0_1.wav`; recorded root MIDI `34`.
  - `harpsichord/Cs2-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_C#1_1.wav`; recorded root MIDI `37`.
  - `harpsichord/Ds2-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_D#1_1.wav`; recorded root MIDI `39`.
  - `harpsichord/Fs2-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_F#1_1.wav`; recorded root MIDI `42`.
  - `harpsichord/Gs2-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_G#1_1.wav`; recorded root MIDI `44`.
  - `harpsichord/As2-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_A#1_1.wav`; recorded root MIDI `46`.
  - `harpsichord/Cs3-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_C#2_1.wav`; recorded root MIDI `49`.
  - `harpsichord/Ds3-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_D#2_1.wav`; recorded root MIDI `51`.
  - `harpsichord/Fs3-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_F#2_1.wav`; recorded root MIDI `54`.
  - `harpsichord/Gs3-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_G#2_1.wav`; recorded root MIDI `56`.
  - `harpsichord/As3-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_A#2_1.wav`; recorded root MIDI `58`.
  - `harpsichord/Cs4-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_C#3_1.wav`; recorded root MIDI `61`.
  - `harpsichord/Ds4-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_D#3_1.wav`; recorded root MIDI `63`.
  - `harpsichord/Fs4-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_F#3_1.wav`; recorded root MIDI `66`.
  - `harpsichord/Gs4-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_G#3_1.wav`; recorded root MIDI `68`.
  - `harpsichord/As4-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_A#3_1.wav`; recorded root MIDI `70`.
  - `harpsichord/Cs5-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_C#4_1.wav`; recorded root MIDI `73`.
  - `harpsichord/Ds5-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_D#4_1.wav`; recorded root MIDI `75`.
  - `harpsichord/Fs5-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_F#4_1.wav`; recorded root MIDI `78`.
  - `harpsichord/Gs5-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_G#4_1.wav`; recorded root MIDI `80`.
  - `harpsichord/B5-rel.mp3` → `Chordophones/Zithers/Harpsichord, Italian/Releases/stop1/Harpsichord_stop1-rel_B4_1.wav`; recorded root MIDI `83`. This neighboring direct B4 release is used because upstream has no A#4 release.
- FlowWatch modifications: selected close sustain/release zones F#1 through A#5 after correcting the VCSL octave convention; converted each selected WAV directly to local stereo MP3 at 44.1 kHz, 96 kb/s; sustain files were trimmed to the first 2.6 seconds with a 120 ms end fade and normalized with ffmpeg `loudnorm=I=-22:TP=-2:LRA=10`; release files were trimmed to 0.8 seconds with an 80 ms end fade and normalized with ffmpeg `loudnorm=I=-31:TP=-3:LRA=8`; renamed `#` to `s` in local filenames. No Harpsichord sustain or release file is pre-pitch-shifted; no `rubberband` processing is used. The final `harpsichord/As5-sus.mp3` zone uses direct upstream A#4 sustain at root MIDI 82, while its key release uses distinct direct upstream B4 release as `harpsichord/B5-rel.mp3` at root MIDI 83 so release transposition is modeled independently of the sustain root.

## Redistribution notice

FlowWatch includes the attribution above with every distributed copy. No sample is fetched remotely at runtime. The catalog uses only local module-relative paths.
