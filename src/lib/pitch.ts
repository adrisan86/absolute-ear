// Pitch detection based on the YIN algorithm (de Cheveigné & Kawahara, 2002)
// with parabolic interpolation for sub-sample precision. Compared to plain
// autocorrelation, YIN avoids octave-doubling errors and gives stable estimates
// for voice, guitar and piano notes.

export type PitchEstimate = {
  frequency: number
  clarity: number
  rms: number
}

export type SpectrumPeak = {
  frequency: number
  decibels: number
  strength: number
}

const MIN_FREQUENCY = 45
const MAX_FREQUENCY = 1800
const MIN_RMS = 0.008
// Absolute threshold on the cumulative mean normalized difference function.
// Lower → more permissive (more detections, more errors). 0.10–0.15 is the
// canonical range from the YIN paper; 0.12 is a good middle ground for noisy
// real-world input.
const YIN_THRESHOLD = 0.12

function computeRms(buffer: Float32Array) {
  let sumSquares = 0
  for (let index = 0; index < buffer.length; index += 1) {
    sumSquares += buffer[index] * buffer[index]
  }
  return Math.sqrt(sumSquares / buffer.length)
}

// Step 2 of YIN: difference function
//   d_t(τ) = Σ_{j=0}^{W-1} (x_j − x_{j+τ})²
function differenceFunction(buffer: Float32Array, maxLag: number) {
  const half = Math.floor(buffer.length / 2)
  const safeMaxLag = Math.min(maxLag, half - 1)
  const result = new Float32Array(safeMaxLag + 1)

  for (let lag = 1; lag <= safeMaxLag; lag += 1) {
    let sum = 0
    for (let index = 0; index < half; index += 1) {
      const delta = buffer[index] - buffer[index + lag]
      sum += delta * delta
    }
    result[lag] = sum
  }
  return result
}

// Step 3 of YIN: cumulative mean normalized difference function
//   d'_t(τ) = d_t(τ) / ((1/τ) · Σ_{j=1}^{τ} d_t(j))
// d'(0) is defined as 1 so the first-minimum search ignores it.
function cumulativeMeanNormalizedDifference(d: Float32Array) {
  const result = new Float32Array(d.length)
  result[0] = 1
  let runningSum = 0

  for (let lag = 1; lag < d.length; lag += 1) {
    runningSum += d[lag]
    result[lag] = runningSum > 0 ? (d[lag] * lag) / runningSum : 1
  }
  return result
}

// Step 4 of YIN: absolute threshold.
// Return the smallest lag (≥ minLag) whose CMNDF drops below `threshold`
// AND is a local minimum. Falls back to the global minimum within range
// when nothing crosses the threshold (mirrors the original paper).
function findFirstMinimumBelow(
  cmndf: Float32Array,
  threshold: number,
  minLag: number,
): number {
  let bestLag = -1
  let bestValue = Number.POSITIVE_INFINITY

  for (let lag = minLag; lag < cmndf.length; lag += 1) {
    if (cmndf[lag] < bestValue) {
      bestValue = cmndf[lag]
      bestLag = lag
    }
    if (cmndf[lag] < threshold) {
      // Walk to the bottom of this local minimum
      let probe = lag
      while (probe + 1 < cmndf.length && cmndf[probe + 1] < cmndf[probe]) {
        probe += 1
      }
      return probe
    }
  }

  return bestLag
}

// Step 5 of YIN: parabolic interpolation around `lag` using the three CMNDF
// samples (lag-1, lag, lag+1) to get sub-sample resolution.
function parabolicInterpolation(cmndf: Float32Array, lag: number) {
  if (lag <= 0 || lag >= cmndf.length - 1) return lag

  const left = cmndf[lag - 1]
  const center = cmndf[lag]
  const right = cmndf[lag + 1]
  const denominator = 2 * (2 * center - left - right)

  if (denominator === 0) return lag
  return lag + (right - left) / denominator
}

export function estimatePitch(
  buffer: Float32Array,
  sampleRate: number,
): PitchEstimate | null {
  const rms = computeRms(buffer)
  if (rms < MIN_RMS) return null

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY))
  const maxLag = Math.min(buffer.length - 1, Math.floor(sampleRate / MIN_FREQUENCY))
  if (maxLag <= minLag) return null

  const d = differenceFunction(buffer, maxLag)
  const cmndf = cumulativeMeanNormalizedDifference(d)
  const integerLag = findFirstMinimumBelow(cmndf, YIN_THRESHOLD, minLag)
  if (integerLag < minLag || integerLag >= cmndf.length) return null

  const refinedLag = parabolicInterpolation(cmndf, integerLag)
  if (!Number.isFinite(refinedLag) || refinedLag <= 0) return null

  const frequency = sampleRate / refinedLag
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) return null

  // CMNDF is ~0 for a perfect periodic signal, ~1 for noise; turn it into a
  // [0, 1] clarity score where higher means more confident.
  const clarity = Math.max(0, Math.min(1, 1 - cmndf[integerLag]))

  return { frequency, clarity, rms }
}

export function extractSpectrumPeaks(
  bins: Float32Array,
  sampleRate: number,
  fftSize: number,
  maxPeaks = 12,
): SpectrumPeak[] {
  const peaks: SpectrumPeak[] = []
  const minDecibels = -82

  for (let index = 2; index < bins.length - 2; index += 1) {
    const decibels = bins[index]
    if (decibels < minDecibels) continue
    if (decibels < bins[index - 1] || decibels < bins[index + 1]) continue

    const frequency = (index * sampleRate) / fftSize
    if (frequency < MIN_FREQUENCY || frequency > 5000) continue

    peaks.push({
      frequency,
      decibels,
      strength: Math.max(0, Math.min(1, (decibels - minDecibels) / 62)),
    })
  }

  return peaks.sort((left, right) => right.decibels - left.decibels).slice(0, maxPeaks)
}
