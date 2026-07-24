// Runs one study session end to end: assembles today's queue once, plays
// through it card by card via DeckCard, records each grade, and shows a
// summary once the queue is exhausted.

import { useMemo, useState } from 'react'
import type { Deck } from '../lib/deck'
import { useEngine } from '../lib/engine'
import { assembleSession } from '../lib/queue'
import { todayString } from '../lib/xp'
import { DeckCard } from './DeckCard'

export function SessionScreen({ deck, voice, onDone }: { deck: Deck; voice: string; onDone: () => void }) {
  const states = useEngine(s => s.states)
  // Snapshot the queue once at mount — grading mid-session must not reshuffle
  // or resize the session already in progress.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => assembleSession(deck, states, todayString(), {}), [deck])
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)

  if (queue.length === 0) {
    return (
      <div className="runner completion-card">
        <p className="muted">Nothing due right now — come back later, or run the probe.</p>
        <button type="button" className="submit" onClick={onDone}>Done</button>
      </div>
    )
  }

  if (i >= queue.length) {
    return (
      <div className="runner completion-card">
        <div className="trophy">✅</div>
        <h2>Session complete!</h2>
        <p>{correct} / {queue.length} correct.</p>
        <p className="muted">No XP here — just your memory doing the work.</p>
        <button type="button" className="submit" onClick={onDone}>Done</button>
      </div>
    )
  }

  const card = queue[i]

  async function handleGraded(ok: boolean) {
    await useEngine.getState().grade(card.item.id, ok)
    if (ok) setCorrect(n => n + 1)
    setI(n => n + 1)
  }

  return (
    <div className="runner">
      <header className="topbar">
        <button type="button" className="back" onClick={onDone}>← Exit</button>
        <h2>🧠 Practice</h2>
        <span className="progress-count">{i + 1}/{queue.length}</span>
      </header>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(i / queue.length) * 100}%` }} />
      </div>
      <div className="runner-body">
        <DeckCard key={card.item.id} deck={deck} item={card.item} mode={card.mode} voice={voice} onGraded={handleGraded} />
      </div>
    </div>
  )
}
