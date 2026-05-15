import { Piano, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeChordFromFrequencyEvidence,
  midiToFrequency,
  midiToNote,
  type PitchClass,
} from '../lib/music'

type VirtualPianoProps = {
  a4: number
}

type BrowserWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

type Voice = {
  gain: GainNode
  oscillators: OscillatorNode[]
  stopTimer?: number
}

const RANGE_SIZE = 24
const OCTAVE_RANGES = [
  { label: 'Grave', startMidi: 36 },
  { label: 'Medio', startMidi: 48 },
  { label: 'Agudo', startMidi: 60 },
]

function isBlackKey(noteName: string) {
  return noteName.includes('#')
}

function sortedUnique(values: number[]) {
  return Array.from(new Set(values)).sort((left, right) => left - right)
}

export function VirtualPiano({ a4 }: VirtualPianoProps) {
  const [rangeStart, setRangeStart] = useState(48)
  const [activeMidis, setActiveMidis] = useState<number[]>([])
  const [holdNotes, setHoldNotes] = useState(false)
  const [volume, setVolume] = useState(0.42)
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Map<number, Voice>>(new Map())

  const keys = useMemo(
    () => Array.from({ length: RANGE_SIZE }, (_, index) => rangeStart + index),
    [rangeStart],
  )

  const activeNotes = useMemo(
    () => activeMidis.map((midi) => midiToNote(midi, a4)),
    [activeMidis, a4],
  )

  const chordAnalysis = useMemo(
    () =>
      analyzeChordFromFrequencyEvidence(
        activeMidis.map((midi) => ({
          frequency: midiToFrequency(midi, a4),
          strength: 1,
        })),
        a4,
        'piano',
      ),
    [activeMidis, a4],
  )

  async function getAudioContext() {
    if (!audioContextRef.current) {
      const browserWindow = window as BrowserWindow
      const AudioContextClass = browserWindow.AudioContext ?? browserWindow.webkitAudioContext
      if (!AudioContextClass) {
        throw new Error('Este navegador no expone Web Audio API')
      }

      const audioContext = new AudioContextClass()
      const masterGain = audioContext.createGain()
      masterGain.gain.value = 0.9
      masterGain.connect(audioContext.destination)
      audioContextRef.current = audioContext
      masterGainRef.current = masterGain
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  async function startNote(midi: number) {
    if (voicesRef.current.has(midi)) {
      if (holdNotes) stopNote(midi)
      return
    }

    const audioContext = await getAudioContext()
    const now = audioContext.currentTime
    const frequency = midiToFrequency(midi, a4)
    const noteGain = audioContext.createGain()
    const body = audioContext.createOscillator()
    const color = audioContext.createOscillator()

    body.type = 'triangle'
    body.frequency.setValueAtTime(frequency, now)
    color.type = 'sine'
    color.frequency.setValueAtTime(frequency * 2, now)

    noteGain.gain.setValueAtTime(0.0001, now)
    noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.012)
    noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.42), now + 0.34)

    body.connect(noteGain)
    color.connect(noteGain)
    noteGain.connect(masterGainRef.current ?? audioContext.destination)

    body.start(now)
    color.start(now)
    voicesRef.current.set(midi, { gain: noteGain, oscillators: [body, color] })
    setActiveMidis((current) => sortedUnique([...current, midi]))
  }

  function stopNote(midi: number) {
    const voice = voicesRef.current.get(midi)
    const audioContext = audioContextRef.current
    if (!voice || !audioContext) return

    const now = audioContext.currentTime
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.055)
    voice.stopTimer = window.setTimeout(() => {
      voice.oscillators.forEach((oscillator) => oscillator.stop())
      voice.oscillators.forEach((oscillator) => oscillator.disconnect())
      voice.gain.disconnect()
    }, 260)

    voicesRef.current.delete(midi)
    setActiveMidis((current) => current.filter((activeMidi) => activeMidi !== midi))
  }

  function stopAll() {
    Array.from(voicesRef.current.keys()).forEach(stopNote)
  }

  useEffect(
    () => () => {
      voicesRef.current.forEach((voice) => {
        if (voice.stopTimer) window.clearTimeout(voice.stopTimer)
        voice.oscillators.forEach((oscillator) => {
          try {
            oscillator.stop()
          } catch {
            // Oscillator may already be stopped after release.
          }
          oscillator.disconnect()
        })
        voice.gain.disconnect()
      })
      voicesRef.current.clear()
      void audioContextRef.current?.close()
      audioContextRef.current = null
      masterGainRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (!masterGainRef.current) return
    masterGainRef.current.gain.value = Math.max(0, Math.min(1, volume * 1.4))
  }, [volume])

  const activePitchClasses = new Set<PitchClass>(chordAnalysis.activePitchClasses)
  const chordLabel =
    chordAnalysis.best?.name ??
    chordAnalysis.alternatives[0]?.name ??
    (activeNotes.length ? activeNotes.map((note) => note.spanishName + note.octave).join(' ') : '--')

  return (
    <section className="virtual-piano-layout" aria-label="Piano virtual">
      <section className="panel virtual-piano-panel">
        <div className="virtual-piano-header">
          <div className="panel-title">
            <Piano size={18} />
            <h2>Piano virtual</h2>
          </div>
          <div className="virtual-controls">
            <button
              className={holdNotes ? 'ghost-action active' : 'ghost-action'}
              onClick={() => setHoldNotes((value) => !value)}
              type="button"
            >
              Sostener
            </button>
            <button className="ghost-action" disabled={!activeMidis.length} onClick={stopAll} type="button">
              <VolumeX size={16} />
              Silenciar
            </button>
          </div>
        </div>

        <div className="mode-toggle range-toggle" aria-label="Rango del piano" role="group">
          {OCTAVE_RANGES.map((range) => (
            <button
              className={rangeStart === range.startMidi ? 'active' : ''}
              key={range.startMidi}
              onClick={() => {
                stopAll()
                setRangeStart(range.startMidi)
              }}
              type="button"
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="virtual-keyboard" aria-label="Teclado sonoro">
          {keys.map((midi) => {
            const note = midiToNote(midi, a4)
            const isActive = activeMidis.includes(midi)
            const chordActive = activePitchClasses.has(note.noteName)

            return (
              <button
                aria-label={note.spanishName + note.octave}
                aria-pressed={isActive}
                className={[
                  'virtual-key',
                  isBlackKey(note.noteName) ? 'black' : 'white',
                  isActive ? 'active' : '',
                  chordActive ? 'chord-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={midi}
                onContextMenu={(event) => event.preventDefault()}
                onPointerCancel={() => {
                  if (!holdNotes) stopNote(midi)
                }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  void startNote(midi)
                }}
                onPointerLeave={() => {
                  if (!holdNotes) stopNote(midi)
                }}
                onPointerUp={() => {
                  if (!holdNotes) stopNote(midi)
                }}
                title={note.spanishName + note.octave}
                type="button"
              >
                <span>{note.spanishName}</span>
                <small>{note.octave}</small>
              </button>
            )
          })}
        </div>

        <label className="volume-control">
          <Volume2 size={17} />
          Volumen
          <input
            max="0.8"
            min="0.08"
            onChange={(event) => setVolume(Number(event.target.value))}
            step="0.02"
            type="range"
            value={volume}
          />
        </label>
      </section>

      <section className="panel virtual-summary-panel">
        <div className="panel-title">
          <Piano size={18} />
          <h2>Lo que estas tocando</h2>
        </div>
        <div className="virtual-chord-name">{chordLabel}</div>
        <p className="confidence-line">
          {chordAnalysis.best
            ? 'Acorde claro'
            : chordAnalysis.alternatives.length
              ? 'Acorde posible'
              : activeNotes.length
                ? 'Notas sueltas'
                : 'Pulsa una tecla'}
        </p>
        <div className="pressed-notes">
          {activeNotes.length ? (
            activeNotes.map((note) => (
              <span className="tag" key={note.midi}>
                {note.spanishName}
                {note.octave}
              </span>
            ))
          ) : (
            <span className="muted">Sin teclas activas</span>
          )}
        </div>
      </section>
    </section>
  )
}
