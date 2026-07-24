import { speak, speechSupported } from '../lib/speech'

export function SpeakButton({ text, voice, label = '🔊', title = 'Listen' }: {
  text: string
  voice: string
  label?: string
  title?: string
}) {
  if (!speechSupported()) return null
  return (
    <button type="button" className="speak" title={title} onClick={() => speak(text, voice)}>
      {label}
    </button>
  )
}
