import { FileMusic, UploadCloud } from 'lucide-react'
import { useState } from 'react'

type ScoreNote = {
  name: string
  octave?: number
  measure?: number
  duration?: string
}

type ScoreChord = {
  name: string
  notes: string[]
  measure?: number
}

type ScoreAnalysis = {
  filename: string
  kind: string
  status: string
  message: string
  measures: number
  notes: ScoreNote[]
  chords: ScoreChord[]
  warnings: string[]
}

export function ScoreUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const apiBaseUrl = (import.meta.env.VITE_SCORE_API_BASE_URL ?? '').replace(/\/$/, '')
  const isScoreApiEnabled = import.meta.env.VITE_SCORE_API_ENABLED !== 'false'

  async function submitScore() {
    if (!file) return
    if (!isScoreApiEnabled) {
      setError('La API de partituras no esta conectada en este despliegue')
      return
    }

    const body = new FormData()
    body.append('file', file)
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/scores/analyze`, {
        method: 'POST',
        body,
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setAnalysis((await response.json()) as ScoreAnalysis)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo analizar el archivo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="score-layout" aria-label="Analizador de partitura">
      <div className="panel upload-panel">
        <div className="panel-title">
          <FileMusic size={18} />
          <h2>Partitura</h2>
        </div>
        <label className="drop-zone">
          <UploadCloud size={32} />
          <span>{file ? file.name : 'PDF, imagen, MusicXML o MIDI'}</span>
          <input
            accept=".xml,.musicxml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button
          className="primary-action"
          disabled={!file || isLoading || !isScoreApiEnabled}
          onClick={submitScore}
          type="button"
        >
          <UploadCloud size={18} />
          {isLoading ? 'Analizando' : isScoreApiEnabled ? 'Analizar partitura' : 'API no conectada'}
        </button>
        {error ? <p className="error-line">{error}</p> : null}
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <FileMusic size={18} />
          <h2>Resultado</h2>
        </div>
        {analysis ? (
          <div className="score-results">
            <div className="result-grid">
              <span>Tipo</span>
              <strong>{analysis.kind}</strong>
              <span>Compases</span>
              <strong>{analysis.measures}</strong>
              <span>Estado</span>
              <strong>{analysis.status}</strong>
            </div>
            <p>{analysis.message}</p>

            <section>
              <h3>Notas detectadas</h3>
              <div className="tag-row">
                {analysis.notes.slice(0, 24).map((note, index) => (
                  <span className="tag" key={`${note.name}-${index}`}>
                    {note.name}
                    {note.octave ?? ''}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h3>Acordes</h3>
              <div className="tag-row">
                {analysis.chords.length ? (
                  analysis.chords.slice(0, 16).map((chord, index) => (
                    <span className="tag chord-tag" key={`${chord.name}-${index}`}>
                      {chord.name}
                    </span>
                  ))
                ) : (
                  <span className="muted">Sin acordes explicitos</span>
                )}
              </div>
            </section>

            {analysis.warnings.length ? (
              <section>
                <h3>Avisos</h3>
                <ul className="warning-list">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">Sin analisis cargado</p>
        )}
      </div>
    </section>
  )
}
