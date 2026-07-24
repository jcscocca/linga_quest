import { useMemo, useState } from 'react'
import type { Deck, DeckItem } from '../lib/deck'
import { useEngine } from '../lib/engine'
import type { ItemState } from '../lib/srs'
import { SpeakButton } from './SpeakButton'

export function Collection({ deck, voice, onBack }: {
  deck: Deck
  voice: string
  onBack: () => void
}) {
  const states = useEngine(s => s.states)
  const [q, setQ] = useState('')

  const known = useMemo(
    () => deck.items.filter(it => (states[it.id]?.level ?? 0) >= 4).length,
    [deck.items, states],
  )

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return deck.items
    return deck.items.filter(
      it => it.lemma.toLowerCase().includes(query) || it.gloss.some(g => g.toLowerCase().includes(query)),
    )
  }, [deck.items, q])

  return (
    <div className="collection">
      <header className="topbar">
        <button className="back" onClick={onBack}>← Back</button>
        <h2>📖 Collection</h2>
        <span className="progress-count">{deck.items.length} words · {known} known</span>
      </header>

      <div className="vocab-search">
        <input
          className="text-answer"
          placeholder="Search words…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="vocab-grid">
        {filtered.map(item => (
          <VocabCard key={item.id} item={item} voice={voice} state={states[item.id]} />
        ))}
        {filtered.length === 0 && <p className="empty">No matches for “{q}”.</p>}
      </div>
    </div>
  )
}

function VocabCard({ item, voice, state }: { item: DeckItem; voice: string; state: ItemState | undefined }) {
  return (
    <div className="vocab-card">
      <div className="vocab-es">
        {item.lemma} <SpeakButton text={item.lemma} voice={voice} />
      </div>
      <div className="vocab-en">{item.gloss.join(', ')}</div>
      <div className="vocab-pos">{item.pos}</div>
      <div className="status">
        {!state ? (
          <span className="muted">new</span>
        ) : (
          <span>
            <span className="pips">{'●'.repeat(state.level)}{'○'.repeat(5 - state.level)}</span>{' '}
            <span className="count">due {state.due}</span>
          </span>
        )}
      </div>
      <button disabled={!state} onClick={() => void useEngine.getState().resetItem(item.id)}>
        Reset
      </button>
    </div>
  )
}
