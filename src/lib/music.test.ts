import { describe, expect, it } from 'vitest'
import {
  centsStatus,
  detectChordFromFrequencies,
  detectChordFromFrequencyEvidence,
  frequencyToNote,
} from './music'

describe('music helpers', () => {
  it('maps A4 exactly', () => {
    const note = frequencyToNote(440)

    expect(note?.noteName).toBe('A')
    expect(note?.octave).toBe(4)
    expect(Math.abs(note?.cents ?? 99)).toBeLessThan(0.001)
  })

  it('marks cents direction', () => {
    expect(centsStatus(-10)).toBe('flat')
    expect(centsStatus(10)).toBe('sharp')
    expect(centsStatus(3)).toBe('in-tune')
  })

  it('detects a C major triad from frequencies', () => {
    const chord = detectChordFromFrequencies([261.63, 329.63, 392])

    expect(chord?.name).toBe('Do')
  })

  it('does not turn one note harmonics into a chord', () => {
    const chord = detectChordFromFrequencies([261.63, 523.25, 784, 1046.5, 1318.5])

    expect(chord).toBeNull()
  })

  it('keeps a triad when extra harmonics are present', () => {
    const chord = detectChordFromFrequencies([261.63, 329.63, 392, 523.25, 659.25, 784])

    expect(chord?.name).toBe('Do')
  })

  it('detects a triad from realistic spectrum peak strengths', () => {
    const chord = detectChordFromFrequencyEvidence([
      { frequency: 261.63, strength: 0.55 },
      { frequency: 329.63, strength: 0.48 },
      { frequency: 392, strength: 0.43 },
      { frequency: 523.25, strength: 0.28 },
      { frequency: 784, strength: 0.22 },
    ])

    expect(chord?.name).toBe('Do')
  })
})
