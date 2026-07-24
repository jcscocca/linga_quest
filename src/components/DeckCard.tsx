// One vocabulary card in one of three escalating modes. choice = recognize the
// English gloss; type = produce the Spanish lemma from its meaning; audio =
// produce the Spanish lemma from hearing it (falls back to a visible-text
// transcription task when the browser has no TTS). Grading is delegated to
// cards.ts so this component only owns presentation and local answer state.

import { useEffect, useMemo, useState } from 'react'
import type { Deck, DeckItem } from '../lib/deck'
import type { TestMode } from '../lib/srs'
import { choiceOptions, gradeCard } from '../lib/cards'
import { speak, speechSupported } from '../lib/speech'
import { SpeakButton } from './exercises/inputs'

const MODE_LABEL: Record<TestMode, string> = { choice: 'Choice', type: 'Type', audio: 'Audio' }

export function DeckCard({ deck, item, mode, voice, onGraded }: {
  deck: Deck
  item: DeckItem
  mode: TestMode
  voice: string
  onGraded: (correct: boolean) => void
}) {
  // Keyed off item.id so a parent that reuses (rather than remounts) this
  // component between cards still gets a clean slate for each new word.
  const [cardId, setCardId] = useState(item.id)
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [result, setResult] = useState<{ correct: boolean; note?: string } | null>(null)
  if (item.id !== cardId) {
    setCardId(item.id)
    setText('')
    setChosen(null)
    setResult(null)
  }

  const options = useMemo(() => (mode === 'choice' ? choiceOptions(deck, item) : []), [deck, item.id, mode])
  const audioBroken = mode === 'audio' && !speechSupported()

  useEffect(() => {
    if (mode === 'audio' && speechSupported()) speak(item.lemma, voice)
  }, [item.id, mode, voice])

  const locked = result !== null

  function submit() {
    if (locked) return
    const given = mode === 'choice' ? (chosen ?? '') : text
    if (!given.trim()) return
    setResult(gradeCard(item, mode, given))
  }

  const canSubmit = mode === 'choice' ? chosen != null : text.trim() !== ''

  return (
    <div className="card">
      <div className="prompt">
        <span className="label">{MODE_LABEL[mode]}</span>
        {mode === 'choice' && (
          <p className="prompt-text">
            {item.lemma} <SpeakButton text={item.lemma} voice={voice} />
          </p>
        )}
        {mode === 'type' && <p className="prompt-text">{item.gloss.join(', ')}</p>}
        {mode === 'audio' && (
          <p className="prompt-text">{audioBroken ? item.lemma : 'Listen and type what you hear.'}</p>
        )}
      </div>

      <div className="answer-area">
        {mode === 'choice' && (
          <div className="choices">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                className={`choice${chosen === opt ? ' selected' : ''}`}
                disabled={locked}
                onClick={() => setChosen(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {mode === 'type' && (
          <input
            className="text-answer"
            lang="es"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Escribe en español…"
            value={text}
            disabled={locked}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
            }}
          />
        )}

        {mode === 'audio' && (
          <div className="listen">
            {!audioBroken && (
              <div className="listen-controls">
                <button type="button" className="speak big" title="Play" onClick={() => speak(item.lemma, voice)}>
                  🔊 Play
                </button>
              </div>
            )}
            {audioBroken && <span className="muted">Audio isn’t available in this browser — type the word shown above.</span>}
            <input
              className="text-answer"
              lang="es"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Escribe en español…"
              value={text}
              disabled={locked}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
        )}
      </div>

      <div className="actions">
        <button type="button" className="submit" disabled={locked || !canSubmit} onClick={submit}>
          Check
        </button>
      </div>

      {result && (
        <div className={`feedback ${result.correct ? 'correct' : 'wrong'}`}>
          <div className="feedback-body">
            <strong>{result.correct ? '✓ ¡Correcto!' : '✗ Not quite'}</strong>
            {result.note && <p className="note">{result.note}</p>}
            <p className="reveal">
              <strong>{item.lemma}</strong> <SpeakButton text={item.lemma} voice={voice} /> — {item.gloss.join(', ')}
            </p>
            {item.ex && (
              <p className="reveal">
                <em>{item.ex.t}</em> — {item.ex.en}
              </p>
            )}
          </div>
          <button type="button" className="continue" autoFocus onClick={() => onGraded(result.correct)}>
            Continue →
          </button>
        </div>
      )}
    </div>
  )
}
