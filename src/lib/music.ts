export const PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export type PitchClass = (typeof PITCH_CLASSES)[number]
export type TuningStatus = 'flat' | 'sharp' | 'in-tune' | 'unknown'

export type NoteReading = {
  midi: number
  noteName: PitchClass
  spanishName: string
  octave: number
  frequency: number
  targetFrequency: number
  cents: number
}

export type ChordCandidate = {
  name: string
  root: PitchClass
  pitchClasses: PitchClass[]
  confidence: number
}

export type FrequencyEvidence = {
  frequency: number
  strength?: number
  decibels?: number
}

type ChordPattern = {
  suffix: string
  intervals: number[]
}

const SPANISH_NAMES: Record<PitchClass, string> = {
  C: 'Do',
  'C#': 'Do#',
  D: 'Re',
  'D#': 'Re#',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  G: 'Sol',
  'G#': 'Sol#',
  A: 'La',
  'A#': 'La#',
  B: 'Si',
}

const CHORD_PATTERNS: ChordPattern[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
]

const MIN_CHORD_PITCH_CLASSES = 3
const MIN_CHORD_CONFIDENCE = 0.82
const HARMONIC_TOLERANCE_CENTS = 35

function log2(value: number) {
  return Math.log(value) / Math.log(2)
}

function pitchClassFromMidi(midi: number): PitchClass {
  return PITCH_CLASSES[((midi % 12) + 12) % 12]
}

function pitchClassIndex(pitchClass: PitchClass) {
  return PITCH_CLASSES.indexOf(pitchClass)
}

export function frequencyToNote(frequency: number, a4 = 440): NoteReading | null {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(a4) || a4 <= 0) {
    return null
  }

  const midiFloat = 69 + 12 * log2(frequency / a4)
  const midi = Math.round(midiFloat)
  const targetFrequency = a4 * 2 ** ((midi - 69) / 12)
  const cents = 1200 * log2(frequency / targetFrequency)
  const noteName = pitchClassFromMidi(midi)

  return {
    midi,
    noteName,
    spanishName: SPANISH_NAMES[noteName],
    octave: Math.floor(midi / 12) - 1,
    frequency,
    targetFrequency,
    cents,
  }
}

export function centsStatus(cents?: number): TuningStatus {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return 'unknown'
  if (Math.abs(cents) <= 5) return 'in-tune'
  return cents < 0 ? 'flat' : 'sharp'
}

export function formatCents(cents: number) {
  const sign = cents > 0 ? '+' : ''
  return `${sign}${cents.toFixed(1)} cents`
}

export function uniquePitchClassesFromFrequencies(frequencies: number[], a4 = 440): PitchClass[] {
  const classes = new Set<PitchClass>()

  frequencies.forEach((frequency) => {
    const note = frequencyToNote(frequency, a4)
    if (note) classes.add(note.noteName)
  })

  return Array.from(classes).sort(
    (left, right) => pitchClassIndex(left) - pitchClassIndex(right),
  )
}

function normalizeEvidence(evidence: FrequencyEvidence[]) {
  const validEvidence = evidence
    .filter((entry) => Number.isFinite(entry.frequency) && entry.frequency > 0)
    .map((entry) => {
      const strength =
        typeof entry.strength === 'number' && Number.isFinite(entry.strength)
          ? entry.strength
          : typeof entry.decibels === 'number' && Number.isFinite(entry.decibels)
            ? Math.max(0, Math.min(1, (entry.decibels + 82) / 62))
            : 1

      return {
        frequency: entry.frequency,
        strength: Math.max(0, Math.min(1, strength)),
      }
    })
    .sort((left, right) => right.strength - left.strength)

  const strongest = validEvidence[0]?.strength ?? 0
  const minStrength = Math.max(0.16, strongest * 0.34)

  return validEvidence
    .filter((entry) => entry.strength >= minStrength)
    .sort((left, right) => left.frequency - right.frequency)
}

function harmonicDistanceCents(frequency: number, lowerFrequency: number) {
  const ratio = frequency / lowerFrequency
  const harmonic = Math.round(ratio)

  if (harmonic < 2 || harmonic > 8) return Number.POSITIVE_INFINITY

  return Math.abs(1200 * log2(ratio / harmonic))
}

function removeLikelyHarmonics(evidence: ReturnType<typeof normalizeEvidence>) {
  const independent: typeof evidence = []

  for (const entry of evidence) {
    const isHarmonic = independent.some((lowerEntry) => {
      if (entry.frequency <= lowerEntry.frequency) return false
      if (entry.strength > lowerEntry.strength * 1.18) return false
      return harmonicDistanceCents(entry.frequency, lowerEntry.frequency) <= HARMONIC_TOLERANCE_CENTS
    })

    if (!isHarmonic) independent.push(entry)
  }

  return independent
}

function weightedPitchClassesFromEvidence(
  evidence: FrequencyEvidence[],
  a4 = 440,
): Map<PitchClass, number> {
  const independentEvidence = removeLikelyHarmonics(normalizeEvidence(evidence))
  const weights = new Map<PitchClass, number>()

  independentEvidence.forEach((entry) => {
    const note = frequencyToNote(entry.frequency, a4)
    if (!note) return

    weights.set(note.noteName, Math.max(weights.get(note.noteName) ?? 0, entry.strength))
  })

  return weights
}

export function detectChordFromFrequencyEvidence(
  evidence: FrequencyEvidence[],
  a4 = 440,
): ChordCandidate | null {
  const pitchClassWeights = weightedPitchClassesFromEvidence(evidence, a4)
  const pitchClasses = Array.from(pitchClassWeights.keys()).sort(
    (left, right) => pitchClassIndex(left) - pitchClassIndex(right),
  )
  if (pitchClasses.length < MIN_CHORD_PITCH_CLASSES) return null

  const pitchClassSet = new Set(pitchClasses)
  let best: ChordCandidate | null = null

  for (const root of PITCH_CLASSES) {
    const rootIndex = pitchClassIndex(root)

    for (const pattern of CHORD_PATTERNS) {
      const required = pattern.intervals.map(
        (interval) => PITCH_CLASSES[(rootIndex + interval) % 12],
      )
      const hits = required.filter((pitchClass) => pitchClassSet.has(pitchClass)).length
      const extras = pitchClasses.filter((pitchClass) => !required.includes(pitchClass)).length
      const requiredWeight = required.reduce(
        (sum, pitchClass) => sum + (pitchClassWeights.get(pitchClass) ?? 0),
        0,
      )
      const extrasWeight = pitchClasses
        .filter((pitchClass) => !required.includes(pitchClass))
        .reduce((sum, pitchClass) => sum + (pitchClassWeights.get(pitchClass) ?? 0), 0)
      const coverage = requiredWeight / required.length
      const confidence = coverage - extras * 0.08 - extrasWeight * 0.05

      if (hits === required.length && confidence > (best?.confidence ?? 0)) {
        best = {
          name: `${SPANISH_NAMES[root]}${pattern.suffix}`,
          root,
          pitchClasses: required,
          confidence: Math.max(0, Math.min(1, confidence)),
        }
      }
    }
  }

  return best && best.confidence >= MIN_CHORD_CONFIDENCE ? best : null
}

export function detectChordFromFrequencies(
  frequencies: number[],
  a4 = 440,
): ChordCandidate | null {
  return detectChordFromFrequencyEvidence(
    frequencies.map((frequency) => ({ frequency, strength: 1 })),
    a4,
  )
}
