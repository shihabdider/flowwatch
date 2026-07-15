import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { sampleAssets, samplePaths } from '../audio/instruments.mjs';

const MPEG1_BITRATES_KBPS = Object.freeze({
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
});
const MPEG2_BITRATES_KBPS = Object.freeze({
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
});
const MPEG_SAMPLE_RATES = Object.freeze({
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
});
const MPEG_CHANNEL_MODES = Object.freeze(['stereo', 'joint stereo', 'dual channel', 'mono']);

function id3v2End(bytes, samplePath) {
  if (bytes.length < 10 || bytes.toString('ascii', 0, 3) !== 'ID3') return 0;
  const sizeBytes = bytes.subarray(6, 10);
  if (sizeBytes.some((byte) => byte & 0x80)) throw new Error(`Invalid ID3 size in: ${samplePath}`);
  const payloadSize = [...sizeBytes].reduce((size, byte) => (size << 7) | byte, 0);
  const footerSize = bytes[5] & 0x10 ? 10 : 0;
  return 10 + payloadSize + footerSize;
}

function parseMpegFrameHeader(bytes, samplePath) {
  const firstPossibleFrame = id3v2End(bytes, samplePath);
  const searchEnd = Math.min(bytes.length - 4, firstPossibleFrame + 4096);
  for (let offset = firstPossibleFrame; offset <= searchEnd; offset++) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) continue;

    const layer = 4 - layerBits;
    const bitrateTable = versionBits === 3 ? MPEG1_BITRATES_KBPS : MPEG2_BITRATES_KBPS;
    const channelMode = MPEG_CHANNEL_MODES[bytes[offset + 3] >> 6];
    return {
      version: versionBits,
      layer,
      bitrateKbps: bitrateTable[layer][bitrateIndex],
      sampleRate: MPEG_SAMPLE_RATES[versionBits][sampleRateIndex],
      channelMode,
      channels: channelMode === 'mono' ? 1 : 2,
    };
  }
  throw new Error(`Missing valid MPEG frame header in: ${samplePath}`);
}

const files = [
  'background.js',
  'offscreen.js',
  'popup.js',
  'record.js',
  'audio/policy.mjs',
  'audio/dsp.mjs',
  'audio/composition.mjs',
  'audio/instruments.mjs',
  'audio/engine.mjs',
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
if (!manifest.permissions?.includes('offscreen')) throw new Error('Missing offscreen permission');

const provenance = readFileSync('audio/samples/PROVENANCE.md', 'utf8');
const sampleEntries = sampleAssets();
const samples = samplePaths();
const uniqueSamples = new Set(samples);
if (uniqueSamples.size !== samples.length) throw new Error('Sample catalog paths must be unique');
if (sampleEntries.length !== samples.length) throw new Error('Sample metadata and path catalog lengths differ');
let sampleBytes = 0;
for (const asset of sampleEntries) {
  const samplePath = asset.path;
  if (!samplePath.startsWith('./samples/') || /^[a-z]+:/i.test(samplePath)) {
    throw new Error(`Sample catalog path must be local: ${samplePath}`);
  }
  const absolutePath = resolve('audio', samplePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing catalogued sample: ${samplePath}`);
  const size = statSync(absolutePath).size;
  if (size === 0) throw new Error(`Empty catalogued sample: ${samplePath}`);
  sampleBytes += size;
  const frame = parseMpegFrameHeader(readFileSync(absolutePath), samplePath);
  if (frame.layer !== 3) throw new Error(`Catalogued sample must be MPEG Layer III: ${samplePath}`);
  if (frame.channels !== 2 || !['stereo', 'joint stereo'].includes(frame.channelMode)) {
    throw new Error(`Catalogued sample must be stereo, found ${frame.channelMode}: ${samplePath}`);
  }
  if (frame.sampleRate !== 44100) {
    throw new Error(`Catalogued sample must be 44.1 kHz, found ${frame.sampleRate} Hz: ${samplePath}`);
  }
  const expectedBitrateKbps = asset.voice === 'piano' ? 128 : 96;
  if (frame.bitrateKbps !== expectedBitrateKbps) {
    throw new Error(`Catalogued ${asset.voice} sample must be ${expectedBitrateKbps} kb/s, found ${frame.bitrateKbps} kb/s: ${samplePath}`);
  }
  const relativeSamplePath = samplePath.replace('./samples/', '');
  if (!provenance.includes(relativeSamplePath)) {
    throw new Error(`Missing provenance entry for: ${relativeSamplePath}`);
  }
  if (asset.sourcePath && !provenance.includes(asset.sourcePath)) {
    throw new Error(`Missing exact upstream provenance for: ${samplePath}`);
  }
  if (asset.voice === 'harpsichord' && asset.kind === 'sustain' && Math.abs(asset.rootMidi - asset.zoneRootMidi) > 3) {
    throw new Error(`Harpsichord sustain source too far from catalog root: ${samplePath}`);
  }
}
if (!provenance.includes('Creative Commons Attribution 3.0')) {
  throw new Error('Piano sample provenance must record the CC-BY 3.0 redistribution license');
}
if (!provenance.includes('Creative Commons Zero 1.0 Universal') || !provenance.includes('CC0 1.0 Universal')) {
  throw new Error('Harpsichord sample provenance must record the CC0 redistribution license');
}
if (!provenance.includes('3382bf9496bba2486f5ab0de55a264d1dfc38404')) {
  throw new Error('Piano sample provenance must record the exact upstream revision');
}
if (!provenance.includes('c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e')) {
  throw new Error('Harpsichord sample provenance must record the exact upstream revision');
}
if (sampleBytes > 4 * 1024 * 1024) throw new Error('Instrument sample banks exceed the 4 MiB budget');

console.log(`Checked ${files.length} JavaScript modules, manifest.json, and ${samples.length} local samples (${sampleBytes} bytes)`);
