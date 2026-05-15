import { describe, expect, it } from 'vitest'
import {
  analyzeChordFromFrequencyEvidence,
  centsStatus,
  detectChordFromFrequencies,
  detectChordFromFrequencyEvidence,
  frequencyToNote,
  midiToFrequency,
  midiToNote,
} from './music'

describe('music helpers', () => {
  it('maps A4 exactly', () => {
    const note = frequencyToNote(440)

    expect(note?.noteName).toBe('A')
    expect(note?.octave).toBe(4)
    expect(Math.abs(note?.cents ?? 99)).toBeLessThan(0.001)
  })

  it('maps midi notes to frequency and names', () => {
    expect(midiToFrequency(69)).toBe(440)

    const note = midiToNote(60)
    expect(note.spanishName).toBe('Do')
    expect(note.octave).toBe(4)
    expect(note.frequency).toBeCloseTo(261.63, 1)
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

  it('does not turn strong piano harmonics into a major chord', () => {
    const analysis = analyzeChordFromFrequencyEvidence(
      [
        { frequency: 261.63, strength: 0.18 },
        { frequency: 523.25, strength: 0.74 },
        { frequency: 784, strength: 0.66 },
        { frequency: 1046.5, strength: 0.58 },
        { frequency: 1318.5, strength: 0.5 },
      ],
      440,
      'piano',
    )

    expect(analysis.best).toBeNull()
    expect(analysis.activePitchClasses).toEqual(['C'])
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

  it('exposes chromagram evidence and chord alternatives', () => {
    const analysis = analyzeChordFromFrequencyEvidence([
      { frequency: 261.63, strength: 0.55 },
      { frequency: 329.63, strength: 0.48 },
      { frequency: 392, strength: 0.43 },
      { frequency: 523.25, strength: 0.28 },
    ])

    expect(analysis.best?.name).toBe('Do')
    expect(analysis.activePitchClasses).toEqual(['C', 'E', 'G'])
    expect(analysis.pitchClassEvidence.find((entry) => entry.pitchClass === 'C')?.weight).toBe(1)
    expect(analysis.alternatives.length).toBeGreaterThan(0)
  })

  it('names simple inversions with a bass note', () => {
    const analysis = analyzeChordFromFrequencyEvidence([
      { frequency: 164.81, strength: 0.8 },
      { frequency: 196, strength: 0.62 },
      { frequency: 261.63, strength: 0.72 },
    ])

    expect(analysis.best?.name).toBe('Do/Mi')
  })

  it('keeps weaker piano tones in piano mode', () => {
    const analysis = analyzeChordFromFrequencyEvidence(
      [
        { frequency: 261.63, strength: 0.9 },
        { frequency: 329.63, strength: 0.33 },
        { frequency: 392, strength: 0.24 },
      ],
      440,
      'piano',
    )

    expect(analysis.best?.name).toBe('Do')
  })

  it('detects a noisy piano triad with weak upper fundamentals', () => {
    const analysis = analyzeChordFromFrequencyEvidence(
      [
        { frequency: 261.63, strength: 0.42 },
        { frequency: 329.63, strength: 0.13 },
        { frequency: 392, strength: 0.12 },
        { frequency: 523.25, strength: 0.55 },
        { frequency: 659.25, strength: 0.2 },
        { frequency: 784, strength: 0.22 },
        { frequency: 1046.5, strength: 0.38 },
        { frequency: 740, strength: 0.04 },
      ],
      440,
      'piano',
    )

    expect(analysis.best?.name).toBe('Do')
    expect(analysis.activePitchClasses).toEqual(['C', 'E', 'G'])
  })
})
