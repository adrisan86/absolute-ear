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
  bass?: PitchClass
  baseName?: string
}

export type FrequencyEvidence = {
  frequency: number
  strength?: number
  decibels?: number
}

export type InstrumentMode = 'general' | 'piano'

export type PitchClassEvidence = {
  pitchClass: PitchClass
  label: string
  weight: number
}

export type ChordAnalysis = {
  best: ChordCandidate | null
  alternatives: ChordCandidate[]
  pitchClassEvidence: PitchClassEvidence[]
  activePitchClasses: PitchClass[]
  bass?: PitchClass
  status: 'idle' | 'insufficient' | 'candidate' | 'matched'
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
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: 'madd9', intervals: [0, 2, 3, 7] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
]

const MIN_CHORD_PITCH_CLASSES = 3
const MIN_CHORD_CONFIDENCE = 0.66
const MIN_CANDIDATE_CONFIDENCE = 0.46
const MIN_ACTIVE_TONE_WEIGHT = 0.18
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

function spanishPitchClass(pitchClass: PitchClass) {
  return SPANISH_NAMES[pitchClass]
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

function normalizeEvidence(evidence: FrequencyEvidence[], mode: InstrumentMode = 'general') {
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
  const floor = mode === 'piano' ? 0.05 : 0.08
  const ratio = mode === 'piano' ? 0.2 : 0.28
  const minStrength = Math.max(floor, strongest * ratio)

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

function removeLikelyHarmonics(
  evidence: ReturnType<typeof normalizeEvidence>,
  mode: InstrumentMode = 'general',
) {
  const independent: typeof evidence = []
  const tolerance = mode === 'piano' ? HARMONIC_TOLERANCE_CENTS * 0.8 : HARMONIC_TOLERANCE_CENTS
  const strengthLimit = mode === 'piano' ? 0.9 : 1.18

  for (const entry of evidence) {
    const isHarmonic = independent.some((lowerEntry) => {
      if (entry.frequency <= lowerEntry.frequency) return false
      if (entry.strength > lowerEntry.strength * strengthLimit) return false
      return harmonicDistanceCents(entry.frequency, lowerEntry.frequency) <= tolerance
    })

    if (!isHarmonic) independent.push(entry)
  }

  return independent
}

function weightedPitchClassesFromEvidence(
  evidence: FrequencyEvidence[],
  a4 = 440,
  mode: InstrumentMode = 'general',
): { weights: Map<PitchClass, number>; bass?: PitchClass } {
  const independentEvidence = removeLikelyHarmonics(normalizeEvidence(evidence, mode), mode)
  const weights = new Map<PitchClass, number>()
  let bass: PitchClass | undefined

  independentEvidence.forEach((entry) => {
    const note = frequencyToNote(entry.frequency, a4)
    if (!note) return

    bass ??= note.noteName
    weights.set(note.noteName, Math.max(weights.get(note.noteName) ?? 0, entry.strength))
  })

  const maxWeight = Math.max(...weights.values(), 0)
  if (maxWeight <= 0) return { weights, bass }

  return {
    weights: new Map(
      Array.from(weights.entries()).map(([pitchClass, weight]) => [
        pitchClass,
        weight / maxWeight,
      ]),
    ),
    bass,
  }
}

function pitchClassEvidenceFromWeights(weights: Map<PitchClass, number>): PitchClassEvidence[] {
  return PITCH_CLASSES.map((pitchClass) => ({
    pitchClass,
    label: spanishPitchClass(pitchClass),
    weight: weights.get(pitchClass) ?? 0,
  }))
}

function chordName(root: PitchClass, suffix: string, bass?: PitchClass) {
  const baseName = spanishPitchClass(root) + suffix
  if (!bass || bass === root) return { name: baseName, baseName }
  return { name: baseName + '/' + spanishPitchClass(bass), baseName }
}

function scoreChordCandidates(
  pitchClassWeights: Map<PitchClass, number>,
  activePitchClasses: PitchClass[],
  bass?: PitchClass,
) {
  const pitchClassSet = new Set(activePitchClasses)
  const candidates: ChordCandidate[] = []

  for (const root of PITCH_CLASSES) {
    const rootIndex = pitchClassIndex(root)

    for (const pattern of CHORD_PATTERNS) {
      const required = pattern.intervals.map(
        (interval) => PITCH_CLASSES[(rootIndex + interval) % 12],
      )
      const uniqueRequired = Array.from(new Set(required))
      const hits = uniqueRequired.filter((pitchClass) => pitchClassSet.has(pitchClass)).length
      const missing = uniqueRequired.length - hits
      if (hits < uniqueRequired.length) continue

      const extras = activePitchClasses.filter((pitchClass) => !uniqueRequired.includes(pitchClass))
      const requiredWeight = uniqueRequired.reduce(
        (sum, pitchClass) => sum + (pitchClassWeights.get(pitchClass) ?? 0),
        0,
      )
      const extrasWeight = extras.reduce(
        (sum, pitchClass) => sum + (pitchClassWeights.get(pitchClass) ?? 0),
        0,
      )
      const coverage = requiredWeight / uniqueRequired.length
      const hitRatio = hits / uniqueRequired.length
      const confidence =
        coverage * 0.82 + hitRatio * 0.22 - missing * 0.16 - extrasWeight * 0.1 - extras.length * 0.03

      if (confidence >= MIN_CANDIDATE_CONFIDENCE) {
        const resolvedBass = bass && uniqueRequired.includes(bass) ? bass : undefined
        const names = chordName(root, pattern.suffix, resolvedBass)
        candidates.push({
          ...names,
          root,
          bass: resolvedBass,
          pitchClasses: uniqueRequired,
          confidence: Math.max(0, Math.min(1, confidence)),
        })
      }
    }
  }

  return candidates.sort((left, right) => right.confidence - left.confidence)
}

export function analyzeChordFromFrequencyEvidence(
  evidence: FrequencyEvidence[],
  a4 = 440,
  mode: InstrumentMode = 'general',
): ChordAnalysis {
  const { weights: pitchClassWeights, bass } = weightedPitchClassesFromEvidence(evidence, a4, mode)
  const pitchClasses = Array.from(pitchClassWeights.keys()).sort(
    (left, right) => pitchClassIndex(left) - pitchClassIndex(right),
  )
  const activePitchClasses = pitchClasses.filter(
    (pitchClass) => (pitchClassWeights.get(pitchClass) ?? 0) >= MIN_ACTIVE_TONE_WEIGHT,
  )
  const pitchClassEvidence = pitchClassEvidenceFromWeights(pitchClassWeights)

  if (activePitchClasses.length < MIN_CHORD_PITCH_CLASSES) {
    return {
      best: null,
      alternatives: [],
      pitchClassEvidence,
      activePitchClasses,
      bass,
      status: activePitchClasses.length ? 'insufficient' : 'idle',
    }
  }

  const candidates = scoreChordCandidates(pitchClassWeights, activePitchClasses, bass)
  const best = candidates[0]?.confidence >= MIN_CHORD_CONFIDENCE ? candidates[0] : null

  return {
    best,
    alternatives: candidates.slice(0, 4),
    pitchClassEvidence,
    activePitchClasses,
    bass,
    status: best ? 'matched' : candidates.length ? 'candidate' : 'insufficient',
  }
}

export function detectChordFromFrequencyEvidence(
  evidence: FrequencyEvidence[],
  a4 = 440,
): ChordCandidate | null {
  return analyzeChordFromFrequencyEvidence(evidence, a4).best
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
