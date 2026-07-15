import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = [
  'background.js',
  'offscreen.js',
  'popup.js',
  'record.js',
  'audio/policy.mjs',
  'audio/dsp.mjs',
  'audio/composition.mjs',
  'audio/engine.mjs',
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
if (!manifest.permissions?.includes('offscreen')) throw new Error('Missing offscreen permission');
console.log(`Checked ${files.length} JavaScript modules and manifest.json`);
