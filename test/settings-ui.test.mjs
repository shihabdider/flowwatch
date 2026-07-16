import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STYLES } from '../audio/policy.mjs';

test('settings style options and binding stay aligned with the audio policy', () => {
  const html = readFileSync('record.html', 'utf8');
  const script = readFileSync('record.js', 'utf8');
  const optionValues = [...html.matchAll(/<option value="([^"]+)">/g)]
    .map((match) => match[1]);
  const binding = script.match(/bindSelect\('musicStyleSelect', 'musicStyle', \[([^\]]+)\], 'ambient'\)/);

  assert.ok(binding, 'music style select binding is present');
  const allowedValues = [...binding[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, STYLES);
  assert.deepEqual(allowedValues, STYLES);
  assert.match(html, /<option value="electronic">Electronic — Synth<\/option>/);
});
