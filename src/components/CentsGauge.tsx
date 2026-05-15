import type { TuningStatus } from '../lib/music'

type CentsGaugeProps = {
  cents?: number
  status: TuningStatus
}

const STATUS_LABELS: Record<TuningStatus, string> = {
  flat: 'Bajo',
  sharp: 'Alto',
  'in-tune': 'Afinado',
  unknown: 'Sin lectura',
}

export function CentsGauge({ cents, status }: CentsGaugeProps) {
  const safeCents = typeof cents === 'number' ? Math.max(-50, Math.min(50, cents)) : 0
  const markerPosition = 50 + safeCents

  return (
    <div className="cents-gauge" data-status={status}>
      <div className="gauge-labels" aria-hidden="true">
        <span>-50</span>
        <span>0</span>
        <span>+50</span>
      </div>
      <div className="gauge-track">
        <span className="gauge-center" />
        <span className="gauge-marker" style={{ left: `${markerPosition}%` }} />
      </div>
      <div className="gauge-result">{STATUS_LABELS[status]}</div>
    </div>
  )
}
