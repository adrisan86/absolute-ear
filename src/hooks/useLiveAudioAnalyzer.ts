import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectChordFromFrequencies,
  frequencyToNote,
  type ChordCandidate,
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
  peaks: SpectrumPeak[]
  rms: number
  clarity: number
}

const EMPTY_SNAPSHOT: LiveAudioSnapshot = {
  note: null,
  chord: null,
  peaks: [],
  rms: 0,
  clarity: 0,
}

export function useLiveAudioAnalyzer(a4: number) {
  const [snapshot, setSnapshot] = useState<LiveAudioSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState<AnalyzerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const a4Ref = useRef(a4)

  useEffect(() => {
    a4Ref.current = a4
  }, [a4])

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
    setStatus('idle')
    setSnapshot(EMPTY_SNAPSHOT)
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
        analyser.getFloatTimeDomainData(timeData)
        analyser.getFloatFrequencyData(frequencyData)

        const pitch = estimatePitch(timeData, audioContext.sampleRate)
        const peaks = extractSpectrumPeaks(
          frequencyData,
          audioContext.sampleRate,
          analyser.fftSize,
        )
        const note = pitch ? frequencyToNote(pitch.frequency, a4Ref.current) : null
        const chord = detectChordFromFrequencies(
          peaks.map((peak) => peak.frequency),
          a4Ref.current,
        )

        setSnapshot({
          note,
          chord,
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
    status,
    error,
    isRunning: status === 'running',
    start,
    stop,
  }
}
