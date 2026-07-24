// Builds one study session for the active language: all due reviews (most
// overdue first), plus up to maxNew previously-unseen words fed in by rank.
// New words are interleaved among reviews so a session is never a wall of
// unfamiliar cards.

import { dayDiff } from './xp'
import type { Deck, DeckItem } from './deck'
import { newState, testModeForLevel, type ItemState } from './srs'

export interface SessionCard {
  item: DeckItem
  state: ItemState
  mode: ReturnType<typeof testModeForLevel>
}

export interface SessionOpts {
  maxNew?: number
  sessionSize?: number
}

export function assembleSession(
  deck: Deck,
  states: Record<string, ItemState>,
  today: string,
  opts: SessionOpts = {},
  rng: () => number = Math.random,
): SessionCard[] {
  const maxNew = opts.maxNew ?? 15
  const sessionSize = opts.sessionSize ?? 20

  const reviews: SessionCard[] = deck.items
    .filter(it => states[it.id] && states[it.id].due <= today)
    .map(it => ({ it, s: states[it.id], ratio: dayDiff(states[it.id].due, today) / Math.max(1, states[it.id].interval) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map(({ it, s }) => ({ item: it, state: s, mode: testModeForLevel(s.level) }))

  const fresh: SessionCard[] = deck.items
    .filter(it => !states[it.id])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxNew)
    .map(it => ({ item: it, state: newState(today), mode: 'choice' as const }))

  return interleave(reviews, fresh, rng).slice(0, sessionSize)
}

/** Weave new cards among reviews at roughly even spacing (order within each
 *  group preserved; rng only jitters placement). */
function interleave(reviews: SessionCard[], fresh: SessionCard[], rng: () => number): SessionCard[] {
  if (fresh.length === 0) return reviews
  if (reviews.length === 0) return fresh
  const out: SessionCard[] = []
  const gap = reviews.length / (fresh.length + 1)
  let fi = 0
  for (let i = 0; i < reviews.length; i++) {
    out.push(reviews[i])
    while (fi < fresh.length && (fi + 1) * gap <= i + 1 + (rng() - 0.5)) out.push(fresh[fi++])
  }
  while (fi < fresh.length) out.push(fresh[fi++])
  return out
}
