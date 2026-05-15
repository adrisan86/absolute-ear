import {
  Activity,
  Gauge,
  Mic,
  Music2,
  Piano,
  Settings2,
  Square,
  UploadCloud,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import './App.css'
import { CentsGauge } from './components/CentsGauge'
import { PianoKeyboard } from './components/PianoKeyboard'
import { ScoreUpload } from './components/ScoreUpload'
import { SpectrumBars } from './components/SpectrumBars'
import { useLiveAudioAnalyzer } from './hooks/useLiveAudioAnalyzer'
import { centsStatus, formatCents } from './lib/music'

type Tab = 'listen' | 'score'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('listen')
  const [a4, setA4] = useState(440)
  const analyzer = useLiveAudioAnalyzer(a4)
  const note = analyzer.snapshot.note
  const tuningStatus = centsStatus(note?.cents)

  const detectedSummary = useMemo(() => {
    if (!note) return 'Sin nota estable'
    return `${note.spanishName}${note.octave} · ${note.frequency.toFixed(2)} Hz`
  }, [note])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Absolute Ear</p>
          <h1>Analizador musical</h1>
        </div>
        <div className="tabbar" aria-label="Vistas">
          <button
            className={activeTab === 'listen' ? 'active' : ''}
            onClick={() => setActiveTab('listen')}
            type="button"
          >
            <Mic size={18} />
            Micro
          </button>
          <button
            className={activeTab === 'score' ? 'active' : ''}
            onClick={() => setActiveTab('score')}
            type="button"
          >
            <UploadCloud size={18} />
            Partitura
          </button>
        </div>
      </header>

      {activeTab === 'listen' ? (
        <section className="workbench" aria-label="Analizador de micro">
          <section className="panel hero-panel">
            <div className="meter-header">
              <span className={`status-pill ${analyzer.isRunning ? 'live' : ''}`}>
                <Activity size={16} />
                {analyzer.isRunning ? 'Escuchando' : 'Listo'}
              </span>
              <label className="a4-control">
                <Settings2 size={16} />
                A4
                <input
                  min="415"
                  max="466"
                  step="0.5"
                  type="number"
                  value={a4}
                  onChange={(event) => setA4(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="note-readout">
              <span className="note-name">{note ? note.spanishName : '--'}</span>
              <span className="note-octave">{note ? note.octave : ''}</span>
            </div>
            <p className="detected-line">{detectedSummary}</p>
            <CentsGauge cents={note?.cents} status={tuningStatus} />

            <div className="control-row">
              <button
                className="primary-action"
                disabled={analyzer.status === 'starting'}
                onClick={analyzer.isRunning ? analyzer.stop : analyzer.start}
                type="button"
              >
                {analyzer.isRunning ? <Square size={18} /> : <Mic size={18} />}
                {analyzer.isRunning ? 'Parar' : 'Escuchar'}
              </button>
              <div className="metric">
                <Gauge size={18} />
                <span>{note ? formatCents(note.cents) : '-- cents'}</span>
              </div>
            </div>

            {analyzer.error ? <p className="error-line">{analyzer.error}</p> : null}
          </section>

          <section className="panel chord-panel">
            <div className="panel-title">
              <Piano size={18} />
              <h2>Acorde estimado</h2>
            </div>
            <div className="chord-name">
              {analyzer.snapshot.chord?.name ?? 'Sin acorde claro'}
            </div>
            <p className="confidence-line">
              Confianza{' '}
              {analyzer.snapshot.chord
                ? `${Math.round(analyzer.snapshot.chord.confidence * 100)}%`
                : '--'}
            </p>
            <PianoKeyboard
              activeMidi={note?.midi}
              activePitchClasses={analyzer.snapshot.chord?.pitchClasses ?? []}
            />
          </section>

          <section className="panel spectrum-panel">
            <div className="panel-title">
              <Music2 size={18} />
              <h2>Espectro</h2>
            </div>
            <SpectrumBars peaks={analyzer.snapshot.peaks} />
          </section>
        </section>
      ) : (
        <ScoreUpload />
      )}
    </main>
  )
}

export default App
