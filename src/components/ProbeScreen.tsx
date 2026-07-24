// Runs the frequency-triage probe: sweep a fixed set of frequency bands,
// testing a few words per band by typing the English meaning, then use the
// results to estimate the learner's vocabulary frontier and seed the whole
// deck's initial review schedule from it.

import { useRef, useState } from 'react'
import type { Deck } from '../lib/deck'
import { checkText } from '../lib/check'
import { useEngine } from '../lib/engine'
import {
  estimateVocab,
  probeFrontier,
  probePick,
  probeRecord,
  seedDeck,
  startProbe,
  type ProbeState,
} from '../lib/probe'
import { todayString } from '../lib/xp'
import { SpeakButton } from './SpeakButton'

export function ProbeScreen({ deck, lang, voice, onDone }: {
  deck: Deck
  lang: string
  voice: string
  onDone: () => void
}) {
  const [state, setState] = useState<ProbeState>(() => startProbe(deck.items.length, { bands: 15, perBand: 10 }))
  const [text, setText] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [result, setResult] = useState<{ frontier: number; seededCount: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function finalize(finalState: ProbeState) {
    setFinalizing(true)
    const frontier = probeFrontier(finalState)
    const seeds = seedDeck(deck, frontier, todayString())
    await useEngine.getState().applyProbe(lang, seeds, frontier)
    setResult({ frontier, seededCount: Object.keys(seeds).length })
  }

  function advance(knew: boolean) {
    const next = probeRecord(state, knew)
    setState(next)
    setText('')
    if (next.done) void finalize(next)
    else inputRef.current?.focus()
  }

  if (result) {
    const newCount = deck.items.length - result.seededCount
    return (
      <div className="runner completion-card">
        <div className="trophy">🔍</div>
        <h2>Here’s where you stand</h2>
        <p>Estimated vocabulary ≈ <strong>{estimateVocab(result.frontier)}</strong> words.</p>
        <p className="muted">
          {result.seededCount} words start out known (or nearly there) · {newCount} begin fresh as new words.
        </p>
        <button type="button" className="submit" onClick={onDone}>Done</button>
      </div>
    )
  }

  if (finalizing) {
    return (
      <div className="runner completion-card">
        <p className="muted">Finishing up…</p>
      </div>
    )
  }

  const item = probePick(state, deck)

  function submit() {
    if (!text.trim()) return
    advance(checkText(text, item.gloss).correct)
  }

  function dontKnow() {
    advance(false)
  }

  function finishEarly() {
    void finalize(state)
  }

  return (
    <div className="runner">
      <header className="topbar">
        <button type="button" className="back" onClick={finishEarly}>Finish early</button>
        <h2>🔍 Vocabulary Check</h2>
        <span className="progress-count">{state.cursor}/{state.queue.length}</span>
      </header>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(state.cursor / state.queue.length) * 100}%` }} />
      </div>
      <div className="runner-body">
        <div className="card">
          <div className="prompt">
            <span className="label">What does this mean?</span>
            <p className="prompt-text">
              {item.lemma} <SpeakButton text={item.lemma} voice={voice} />
            </p>
          </div>
          <div className="answer-area">
            <input
              ref={inputRef}
              className="text-answer"
              lang="en"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Type the English meaning…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
          <div className="actions" style={{ gap: 10 }}>
            <button type="button" className="submit" disabled={!text.trim()} onClick={submit}>
              Check
            </button>
            <button type="button" onClick={dontKnow}>Don’t know</button>
          </div>
        </div>
      </div>
    </div>
  )
}
