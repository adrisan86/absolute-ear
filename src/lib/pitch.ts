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
const MIN_CLARITY = 0.48

function computeRms(buffer: Float32Array) {
  let sumSquares = 0

  for (let index = 0; index < buffer.length; index += 1) {
    sumSquares += buffer[index] * buffer[index]
  }

  return Math.sqrt(sumSquares / buffer.length)
}

export function estimatePitch(buffer: Float32Array, sampleRate: number): PitchEstimate | null {
  const rms = computeRms(buffer)
  if (rms < MIN_RMS) return null

  const minLag = Math.floor(sampleRate / MAX_FREQUENCY)
  const maxLag = Math.min(buffer.length - 1, Math.floor(sampleRate / MIN_FREQUENCY))
  let bestLag = -1
  let bestCorrelation = 0

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0
    let leftEnergy = 0
    let rightEnergy = 0

    for (let index = 0; index < buffer.length - lag; index += 1) {
      const left = buffer[index]
      const right = buffer[index + lag]
      correlation += left * right
      leftEnergy += left * left
      rightEnergy += right * right
    }

    const normalized = correlation / Math.sqrt(leftEnergy * rightEnergy)

    if (normalized > bestCorrelation) {
      bestCorrelation = normalized
      bestLag = lag
    }
  }

  if (bestLag <= 0 || bestCorrelation < MIN_CLARITY) return null

  const frequency = sampleRate / bestLag
  if (!Number.isFinite(frequency) || frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return null
  }

  return {
    frequency,
    clarity: bestCorrelation,
    rms,
  }
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
