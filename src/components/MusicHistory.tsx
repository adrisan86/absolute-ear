import { Eraser, Music2 } from 'lucide-react'
import type { LiveHistoryEntry } from '../hooks/useLiveAudioAnalyzer'
import { formatCents } from '../lib/music'

type MusicHistoryProps = {
  entries: LiveHistoryEntry[]
  onClear: () => void
}

function centsClass(cents?: number) {
  if (typeof cents !== 'number') return ''
  if (Math.abs(cents) <= 5) return 'in-tune'
  return cents < 0 ? 'flat' : 'sharp'
}

export function MusicHistory({ entries, onClear }: MusicHistoryProps) {
  const notes = entries.filter((entry) => entry.kind === 'note').slice(-32)
  const chords = entries.filter((entry) => entry.kind === 'chord').slice(-16)

  return (
    <section className="panel history-panel" aria-label="Registro musical">
      <div className="history-header">
        <div className="panel-title">
          <Music2 size={18} />
          <h2>Registro</h2>
        </div>
        <button className="ghost-action" disabled={!entries.length} onClick={onClear} type="button">
          <Eraser size={16} />
          Limpiar
        </button>
      </div>

      <div className="notation-block">
        <h3>Notas</h3>
        <div className="notation-strip" aria-label="Notas recientes">
          {notes.length ? (
            notes.map((entry) => (
              <span className={'notation-note ' + centsClass(entry.cents)} key={entry.id}>
                <strong>{entry.label}</strong>
                <small>{typeof entry.cents === 'number' ? formatCents(entry.cents) : entry.detail}</small>
              </span>
            ))
          ) : (
            <span className="muted">Sin notas</span>
          )}
        </div>
      </div>

      <div className="notation-block chord-history-block">
        <h3>Acordes</h3>
        <div className="chord-history" aria-label="Acordes recientes">
          {chords.length ? (
            chords.map((entry) => (
              <span className="history-chord" key={entry.id}>
                <strong>{entry.label}</strong>
                <small>{entry.detail}</small>
              </span>
            ))
          ) : (
            <span className="muted">Sin acordes</span>
          )}
        </div>
      </div>
    </section>
  )
}
