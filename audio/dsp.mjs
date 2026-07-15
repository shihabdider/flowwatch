// Pure broadband amplitude-modulation contract adapted from neuralfm. The browser
// engine mirrors this with one sine LFO connected to one whole-mix GainNode.

function validateParams(n, sampleRate, { modFreq, depth }) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive');
  if (!Number.isFinite(modFreq) || modFreq <= 0) throw new RangeError('modFreq must be positive');
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new RangeError('depth must be in [0, 1]');
}

/** gain(t) = (1 - depth/2) + (depth/2) * sin(2π * modFreq * t + phase). */
export function amEnvelope(n, sampleRate, params) {
  validateParams(n, sampleRate, params);
  const { modFreq, depth, phase = 0 } = params;
  const out = new Float32Array(n);
  const base = 1 - depth / 2;
  const amplitude = depth / 2;
  const angularStep = (2 * Math.PI * modFreq) / sampleRate;
  for (let i = 0; i < n; i++) out[i] = base + amplitude * Math.sin(angularStep * i + phase);
  return out;
}

export function applyAm(input, sampleRate, params) {
  const envelope = amEnvelope(input.length, sampleRate, params);
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = input[i] * envelope[i];
  return output;
}

function fft(real, imaginary) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const lengthReal = Math.cos(angle);
    const lengthImaginary = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let weightReal = 1;
      let weightImaginary = 0;
      for (let offset = 0; offset < length >> 1; offset++) {
        const a = start + offset;
        const b = a + (length >> 1);
        const valueReal = real[b] * weightReal - imaginary[b] * weightImaginary;
        const valueImaginary = real[b] * weightImaginary + imaginary[b] * weightReal;
        const upperReal = real[a];
        const upperImaginary = imaginary[a];
        real[a] = upperReal + valueReal;
        imaginary[a] = upperImaginary + valueImaginary;
        real[b] = upperReal - valueReal;
        imaginary[b] = upperImaginary - valueImaginary;
        const nextReal = weightReal * lengthReal - weightImaginary * lengthImaginary;
        weightImaginary = weightReal * lengthImaginary + weightImaginary * lengthReal;
        weightReal = nextReal;
      }
    }
  }
}

/** Frequency of the strongest non-DC spectral bin. Signal length must be a power of two. */
export function dominantFrequency(signal, sampleRate, minHz = 1) {
  const n = signal.length;
  if (n === 0 || (n & (n - 1)) !== 0) throw new RangeError('signal length must be a power of two');
  const real = new Float64Array(n);
  const imaginary = new Float64Array(n);
  let mean = 0;
  for (const value of signal) mean += value;
  mean /= n;
  for (let i = 0; i < n; i++) real[i] = signal[i] - mean;
  fft(real, imaginary);
  const firstBin = Math.max(1, Math.ceil((minHz * n) / sampleRate));
  let bestBin = firstBin;
  let bestMagnitude = -Infinity;
  for (let bin = firstBin; bin < n >> 1; bin++) {
    const magnitude = real[bin] ** 2 + imaginary[bin] ** 2;
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
      bestBin = bin;
    }
  }
  return (bestBin * sampleRate) / n;
}
