import { PITCH_CLASSES, type PitchClass } from '../lib/music'

type PianoKeyboardProps = {
  activeMidi?: number
  activePitchClasses: PitchClass[]
}

const START_MIDI = 48
const KEY_COUNT = 36

function isBlackKey(noteName: string) {
  return noteName.includes('#')
}

function pitchClassForMidi(midi: number): PitchClass {
  return PITCH_CLASSES[((midi % 12) + 12) % 12]
}

export function PianoKeyboard({ activeMidi, activePitchClasses }: PianoKeyboardProps) {
  const keys = Array.from({ length: KEY_COUNT }, (_, index) => START_MIDI + index)

  return (
    <div className="piano-keyboard" aria-label="Teclado de piano">
      {keys.map((midi) => {
        const pitchClass = pitchClassForMidi(midi)
        const activeByMidi = activeMidi === midi
        const activeByChord = activePitchClasses.includes(pitchClass)
        const octave = Math.floor(midi / 12) - 1

        return (
          <span
            aria-label={`${pitchClass}${octave}`}
            className={[
              'piano-key',
              isBlackKey(pitchClass) ? 'black' : 'white',
              activeByMidi || activeByChord ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={midi}
            title={`${pitchClass}${octave}`}
          />
        )
      })}
    </div>
  )
}
