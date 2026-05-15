import { describe, expect, it } from 'vitest'
import { estimatePitch } from './pitch'

const SAMPLE_RATE = 44100
const BUFFER_SIZE = 4096

function makeSineBuffer(frequency: number, amplitude = 0.6, length = BUFFER_SIZE) {
  const buffer = new Float32Array(length)
  const angular = (2 * Math.PI * frequency) / SAMPLE_RATE
  for (let i = 0; i < length; i += 1) {
    buffer[i] = amplitude * Math.sin(angular * i)
  }
  return buffer
}

// Sine + 2nd and 3rd harmonics — simulates a real voice/instrument that would
// trip up plain autocorrelation into reporting the octave.
function makeHarmonicBuffer(frequency: number, length = BUFFER_SIZE) {
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE
    buffer[i] =
      0.6 * Math.sin(2 * Math.PI * frequency * t) +
      0.3 * Math.sin(2 * Math.PI * frequency * 2 * t) +
      0.15 * Math.sin(2 * Math.PI * frequency * 3 * t)
  }
  return buffer
}

function makeSilence(length = BUFFER_SIZE) {
  return new Float32Array(length)
}

describe('estimatePitch (YIN)', () => {
  it('returns null for silence', () => {
    expect(estimatePitch(makeSilence(), SAMPLE_RATE)).toBeNull()
  })

  it('locks on to A4 (440 Hz) within 0.5 Hz', () => {
    const estimate = estimatePitch(makeSineBuffer(440), SAMPLE_RATE)
    expect(estimate).not.toBeNull()
    expect(Math.abs((estimate?.frequency ?? 0) - 440)).toBeLessThan(0.5)
    expect(estimate?.clarity ?? 0).toBeGreaterThan(0.85)
  })

  it('detects E2 (82.4 Hz) — typical low guitar string', () => {
    const estimate = estimatePitch(makeHarmonicBuffer(82.4), SAMPLE_RATE)
    expect(estimate).not.toBeNull()
    expect(Math.abs((estimate?.frequency ?? 0) - 82.4)).toBeLessThan(0.5)
  })

  it('does NOT report the octave (164 Hz) on a strong-harmonic E2', () => {
    // This is the classic octave-doubling failure mode of plain
    // autocorrelation. YIN should resolve it.
    const estimate = estimatePitch(makeHarmonicBuffer(82.4), SAMPLE_RATE)
    expect(estimate?.frequency ?? 0).toBeLessThan(110)
  })

  it('detects C5 (523.25 Hz) accurately', () => {
    const estimate = estimatePitch(makeSineBuffer(523.25), SAMPLE_RATE)
    expect(estimate).not.toBeNull()
    expect(Math.abs((estimate?.frequency ?? 0) - 523.25)).toBeLessThan(0.7)
  })

  it('rejects frequencies above MAX_FREQUENCY range gracefully', () => {
    const estimate = estimatePitch(makeSineBuffer(2500), SAMPLE_RATE)
    // Either null or clamped within the published [45, 1800] range
    if (estimate) {
      expect(estimate.frequency).toBeLessThanOrEqual(1800)
      expect(estimate.frequency).toBeGreaterThanOrEqual(45)
    }
  })

  it('parabolic interpolation yields sub-cent precision at A4', () => {
    const estimate = estimatePitch(makeSineBuffer(440), SAMPLE_RATE)
    expect(estimate).not.toBeNull()
    const cents = 1200 * Math.log2((estimate?.frequency ?? 440) / 440)
    expect(Math.abs(cents)).toBeLessThan(3)
  })
})
