import { describe, expect, it } from 'vitest'
import { centsStatus, detectChordFromFrequencies, frequencyToNote } from './music'

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
})
