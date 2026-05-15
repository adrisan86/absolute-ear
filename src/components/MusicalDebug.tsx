import { Activity, ListMusic } from 'lucide-react'
import type { ChordAnalysis } from '../lib/music'

type MusicalDebugProps = {
  analysis: ChordAnalysis
}

const STATUS_LABELS: Record<ChordAnalysis['status'], string> = {
  idle: 'Sin evidencia',
  insufficient: 'Pocas notas',
  candidate: 'Acorde posible',
  matched: 'Acorde claro',
}

function percent(value: number) {
  return Math.round(value * 100)
}

export function MusicalDebug({ analysis }: MusicalDebugProps) {
  const visibleNotes = analysis.pitchClassEvidence
    .filter((entry) => entry.weight >= 0.08)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8)
  const alternatives = analysis.alternatives.slice(0, 4)

  return (
    <section className="panel debug-panel" aria-label="Depuracion musical">
      <div className="panel-title">
        <Activity size={18} />
        <h2>Analisis musical</h2>
      </div>

      <div className={'debug-status ' + analysis.status}>
        <strong>{STATUS_LABELS[analysis.status]}</strong>
        <span>{analysis.bass ? 'Bajo ' + analysis.pitchClassEvidence.find((entry) => entry.pitchClass === analysis.bass)?.label : 'Bajo --'}</span>
      </div>

      <div className="debug-section">
        <h3>Notas del acorde</h3>
        <div className="tone-evidence-list">
          {visibleNotes.length ? (
            visibleNotes.map((entry) => (
              <div className="tone-evidence" key={entry.pitchClass}>
                <span>{entry.label}</span>
                <div className="tone-meter">
                  <span style={{ width: percent(entry.weight) + '%' }} />
                </div>
                <strong>{percent(entry.weight)}%</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">Sin notas suficientes</p>
          )}
        </div>
      </div>

      <div className="debug-section">
        <h3>Alternativas</h3>
        <div className="alternative-list">
          {alternatives.length ? (
            alternatives.map((candidate) => (
              <span className="alternative-chip" key={candidate.name}>
                <ListMusic size={14} />
                <strong>{candidate.name}</strong>
                <small>{percent(candidate.confidence)}%</small>
              </span>
            ))
          ) : (
            <p className="empty-state">Sin alternativa clara</p>
          )}
        </div>
      </div>
    </section>
  )
}
