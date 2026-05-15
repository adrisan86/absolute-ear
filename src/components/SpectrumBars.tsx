import type { SpectrumPeak } from '../lib/pitch'

type SpectrumBarsProps = {
  peaks: SpectrumPeak[]
}

export function SpectrumBars({ peaks }: SpectrumBarsProps) {
  const visiblePeaks = peaks.slice(0, 10)

  return (
    <div className="spectrum-bars" aria-label="Picos de frecuencia">
      {visiblePeaks.length ? (
        visiblePeaks.map((peak) => (
          <div className="spectrum-row" key={`${peak.frequency.toFixed(1)}-${peak.decibels}`}>
            <span>{peak.frequency.toFixed(0)} Hz</span>
            <div className="spectrum-meter">
              <span style={{ width: `${Math.round(peak.strength * 100)}%` }} />
            </div>
            <strong>{peak.decibels.toFixed(0)} dB</strong>
          </div>
        ))
      ) : (
        <p className="empty-state">Sin picos estables</p>
      )}
    </div>
  )
}
