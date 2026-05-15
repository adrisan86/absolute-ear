import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  analyzeChordFromFrequencyEvidence,
  frequencyToNote,
  type ChordAnalysis,
  type ChordCandidate,
  type FrequencyEvidence,
  type InstrumentMode,
  type NoteReading,
} from '../lib/music'
import { estimatePitch, extractSpectrumPeaks, type SpectrumPeak } from '../lib/pitch'

type AnalyzerStatus = 'idle' | 'starting' | 'running' | 'error'

type BrowserWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

export type LiveAudioSnapshot = {
  note: NoteReading | null
  chord: ChordCandidate | null
  chordAnalysis: ChordAnalysis
  peaks: SpectrumPeak[]
  rms: number
  clarity: number
}

export type LiveHistoryEntry = {
  id: number
  kind: 'note' | 'chord'
  label: string
  detail: string
  cents?: number
  confidence?: number
  pitchClasses?: string[]
}

const EMPTY_CHORD_ANALYSIS: ChordAnalysis = {
  best: null,
  alternatives: [],
  pitchClassEvidence: [],
  activePitchClasses: [],
  status: 'idle',
}

const EMPTY_SNAPSHOT: LiveAudioSnapshot = {
  note: null,
  chord: null,
  chordAnalysis: EMPTY_CHORD_ANALYSIS,
  peaks: [],
  rms: 0,
  clarity: 0,
}

const MAX_HISTORY_ENTRIES = 64

const MODE_CONFIG: Record<
  InstrumentMode,
  {
    noteHoldMs: number
    chordHoldMs: number
    noteConfirmMs: number
    chordConfirmMs: number
    silenceResetMs: number
    chordWindowMs: number
  }
> = {
  general: {
    noteHoldMs: 1400,
    chordHoldMs: 1600,
    noteConfirmMs: 180,
    chordConfirmMs: 320,
    silenceResetMs: 280,
    chordWindowMs: 850,
  },
  piano: {
    noteHoldMs: 2200,
    chordHoldMs: 2600,
    noteConfirmMs: 140,
    chordConfirmMs: 420,
    silenceResetMs: 520,
    chordWindowMs: 1500,
  },
}

function noteKey(note: NoteReading) {
  return note.noteName + note.octave
}

function pushHistoryEntry(
  setHistory: Dispatch<SetStateAction<LiveHistoryEntry[]>>,
  entry: Omit<LiveHistoryEntry, 'id'>,
) {
  setHistory((current) => [
    ...current.slice(-(MAX_HISTORY_ENTRIES - 1)),
    {
      ...entry,
      id: Date.now(),
    },
  ])
}

type ChordFrame = {
  seenAt: number
  evidence: FrequencyEvidence[]
}

export function useLiveAudioAnalyzer(a4: number, instrumentMode: InstrumentMode = 'general') {
  const [snapshot, setSnapshot] = useState<LiveAudioSnapshot>(EMPTY_SNAPSHOT)
  const [history, setHistory] = useState<LiveHistoryEntry[]>([])
  const [status, setStatus] = useState<AnalyzerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const a4Ref = useRef(a4)
  const instrumentModeRef = useRef<InstrumentMode>(instrumentMode)
  const chordFramesRef = useRef<ChordFrame[]>([])
  const lastVisibleNoteRef = useRef<{ note: NoteReading; seenAt: number } | null>(null)
  const lastVisibleChordRef = useRef<{ chord: ChordCandidate; seenAt: number } | null>(null)
  const noteCandidateRef = useRef<{
    key: string
    firstSeenAt: number
    lastSeenAt: number
    note: NoteReading
    logged: boolean
  } | null>(null)
  const chordCandidateRef = useRef<{
    name: string
    firstSeenAt: number
    lastSeenAt: number
    chord: ChordCandidate
    logged: boolean
  } | null>(null)

  useEffect(() => {
    a4Ref.current = a4
  }, [a4])

  useEffect(() => {
    instrumentModeRef.current = instrumentMode
    chordFramesRef.current = []
    lastVisibleChordRef.current = null
    chordCandidateRef.current = null
  }, [instrumentMode])

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    void audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
    chordFramesRef.current = []
    lastVisibleNoteRef.current = null
    lastVisibleChordRef.current = null
    noteCandidateRef.current = null
    chordCandidateRef.current = null
    setStatus('idle')
    setSnapshot(EMPTY_SNAPSHOT)
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const start = useCallback(async () => {
    if (status === 'running' || status === 'starting') return

    const browserWindow = window as BrowserWindow
    const AudioContextClass = browserWindow.AudioContext ?? browserWindow.webkitAudioContext

    if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
      setError('Este navegador no expone microfono o Web Audio API')
      setStatus('error')
      return
    }

    setStatus('starting')
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      })
      const audioContext = new AudioContextClass()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.68

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      streamRef.current = stream
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      setStatus('running')

      const timeData = new Float32Array(analyser.fftSize)
      const frequencyData = new Float32Array(analyser.frequencyBinCount)

      const tick = () => {
        const now = performance.now()
        analyser.getFloatTimeDomainData(timeData)
        analyser.getFloatFrequencyData(frequencyData)

        const pitch = estimatePitch(timeData, audioContext.sampleRate)
        const peaks = extractSpectrumPeaks(
          frequencyData,
          audioContext.sampleRate,
          analyser.fftSize,
          36,
        )
        const mode = instrumentModeRef.current
        const config = MODE_CONFIG[mode]
        const rawNote = pitch ? frequencyToNote(pitch.frequency, a4Ref.current) : null
        const frameEvidence: FrequencyEvidence[] = peaks.map((peak) => ({
            frequency: peak.frequency,
            strength: peak.strength,
            decibels: peak.decibels,
          }))

        if (pitch) {
          frameEvidence.push({
            frequency: pitch.frequency,
            strength: Math.max(0.25, pitch.clarity),
          })
        }

        chordFramesRef.current = [
          ...chordFramesRef.current.filter((frame) => now - frame.seenAt <= config.chordWindowMs),
          { seenAt: now, evidence: frameEvidence },
        ]

        const chordAnalysis = analyzeChordFromFrequencyEvidence(
          chordFramesRef.current.flatMap((frame) => frame.evidence),
          a4Ref.current,
          mode,
        )
        const rawChord = chordAnalysis.best
        let note = rawNote
        let chord =
          lastVisibleChordRef.current &&
          now - lastVisibleChordRef.current.seenAt <= config.chordHoldMs
            ? lastVisibleChordRef.current.chord
            : null

        if (rawNote) {
          lastVisibleNoteRef.current = { note: rawNote, seenAt: now }
          const key = noteKey(rawNote)
          const candidate = noteCandidateRef.current

          if (!candidate || candidate.key !== key) {
            noteCandidateRef.current = {
              key,
              firstSeenAt: now,
              lastSeenAt: now,
              note: rawNote,
              logged: false,
            }
          } else {
            candidate.lastSeenAt = now
            candidate.note = rawNote

            if (!candidate.logged && now - candidate.firstSeenAt >= config.noteConfirmMs) {
              pushHistoryEntry(setHistory, {
                kind: 'note',
                label: rawNote.spanishName + rawNote.octave,
                detail: rawNote.frequency.toFixed(1) + ' Hz',
                cents: rawNote.cents,
              })
              candidate.logged = true
            }
          }
        } else {
          const lastVisibleNote = lastVisibleNoteRef.current
          if (lastVisibleNote && now - lastVisibleNote.seenAt <= config.noteHoldMs) {
            note = lastVisibleNote.note
          }

          const candidate = noteCandidateRef.current
          if (candidate && now - candidate.lastSeenAt > config.silenceResetMs) {
            noteCandidateRef.current = null
          }
        }

        if (rawChord) {
          const candidate = chordCandidateRef.current

          if (!candidate || candidate.name !== rawChord.name) {
            chordCandidateRef.current = {
              name: rawChord.name,
              firstSeenAt: now,
              lastSeenAt: now,
              chord: rawChord,
              logged: false,
            }
          } else {
            candidate.lastSeenAt = now
            candidate.chord = rawChord

            if (now - candidate.firstSeenAt >= config.chordConfirmMs) {
              lastVisibleChordRef.current = { chord: rawChord, seenAt: now }
              chord = rawChord
              if (!candidate.logged) {
                pushHistoryEntry(setHistory, {
                  kind: 'chord',
                  label: rawChord.name,
                  detail: Math.round(rawChord.confidence * 100) + '%',
                  confidence: rawChord.confidence,
                  pitchClasses: rawChord.pitchClasses,
                })
                candidate.logged = true
              }
            }
          }
        } else {
          const candidate = chordCandidateRef.current
          if (candidate && now - candidate.lastSeenAt > config.silenceResetMs) {
            chordCandidateRef.current = null
          }
        }

        setSnapshot({
          note,
          chord,
          chordAnalysis,
          peaks,
          rms: pitch?.rms ?? 0,
          clarity: pitch?.clarity ?? 0,
        })

        animationFrameRef.current = requestAnimationFrame(tick)
      }

      tick()
    } catch (caught) {
      stop()
      setStatus('error')
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir el microfono')
    }
  }, [status, stop])

  useEffect(() => stop, [stop])

  return {
    snapshot,
    history,
    status,
    error,
    isRunning: status === 'running',
    start,
    stop,
    clearHistory,
  }
}
