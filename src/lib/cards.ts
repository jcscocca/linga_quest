// Card behaviour the engine didn't need: multiple-choice option generation and
// per-mode grading. Grading reuses check.ts so the deck gate and the runtime
// judge answers identically.

import type { Deck, DeckItem } from './deck'
import { checkText, normalize, type CheckResult } from './check'
import type { TestMode } from './srs'

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** n wrong glosses, preferring words of similar frequency (plausible confusables). */
export function distractors(deck: Deck, item: DeckItem, n: number, rng: () => number = Math.random): string[] {
  const answer = normalize(item.gloss[0])
  const nearby = deck.items
    .filter(o => o.id !== item.id && normalize(o.gloss[0]) !== answer)
    .sort((a, b) => Math.abs(a.rank - item.rank) - Math.abs(b.rank - item.rank))
    .slice(0, Math.max(n * 5, 15))
  const picked: string[] = []
  for (const o of shuffle(nearby, rng)) {
    if (picked.length >= n) break
    if (!picked.some(p => normalize(p) === normalize(o.gloss[0]))) picked.push(o.gloss[0])
  }
  return picked
}

/** The correct gloss plus 3 distractors, shuffled. */
export function choiceOptions(deck: Deck, item: DeckItem, rng: () => number = Math.random): string[] {
  return shuffle([item.gloss[0], ...distractors(deck, item, 3, rng)], rng)
}

/** Judge an answer for a card in a given mode. choice = pick the English gloss;
 *  type/audio = produce the Spanish lemma (accent-lenient via check.ts). */
export function gradeCard(item: DeckItem, mode: TestMode, given: string): CheckResult {
  if (mode === 'choice') return { correct: normalize(given) === normalize(item.gloss[0]) }
  return checkText(given, [item.lemma])
}
