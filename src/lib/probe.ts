// The adaptive triage probe. Vocabulary knowledge tracks frequency rank, so
// instead of testing every word we sweep a fixed set of frequency bands, test
// a few words per band, and estimate the FRONTIER — the rank where "know it"
// crosses below half. That frontier seeds initial state for the whole deck and
// doubles as an estimated vocabulary size.

import type { Deck, DeckItem } from './deck'

export interface ProbeOpts {
  bands: number
  perBand: number
}

export interface ProbeState {
  deckSize: number
  bands: number
  perBand: number
  /** ranks (1-based) queued to test, in order */
  queue: number[]
  /** index into queue of the next word to test */
  cursor: number
  /** knew[i] aligns with queue[i] */
  knew: boolean[]
  done: boolean
}

/** Build the fixed sweep: perBand evenly-spaced ranks inside each band. */
export function startProbe(deckSize: number, opts: ProbeOpts, rng: () => number = Math.random): ProbeState {
  const { bands, perBand } = opts
  const width = deckSize / bands
  const queue: number[] = []
  for (let b = 0; b < bands; b++) {
    const lo = b * width
    for (let k = 0; k < perBand; k++) {
      const frac = (k + 0.5 + (rng() - 0.5) * 0.5) / perBand
      queue.push(Math.min(deckSize, Math.max(1, Math.round(lo + frac * width))))
    }
  }
  return { deckSize, bands, perBand, queue, cursor: 0, knew: [], done: queue.length === 0 }
}

/** The next word to show, chosen by its queued rank. */
export function probePick(state: ProbeState, deck: Deck): DeckItem {
  const rank = state.queue[state.cursor]
  return deck.items.find(i => i.rank === rank) ?? deck.items[Math.min(deck.items.length - 1, rank - 1)]
}

export function probeRecord(state: ProbeState, knew: boolean): ProbeState {
  const knewNext = [...state.knew, knew]
  const cursor = state.cursor + 1
  return { ...state, knew: knewNext, cursor, done: cursor >= state.queue.length }
}

/** Estimate the frontier: the highest band-boundary rank still known ≥ 50%.
 *  Interpolates within the crossover band for a smoother number. */
export function probeFrontier(state: ProbeState): number {
  const width = state.deckSize / state.bands
  const knewByBand: { known: number; total: number }[] = Array.from({ length: state.bands }, () => ({ known: 0, total: 0 }))
  for (let i = 0; i < state.knew.length; i++) {
    const band = Math.min(state.bands - 1, Math.floor((state.queue[i] - 1) / width))
    knewByBand[band].total++
    if (state.knew[i]) knewByBand[band].known++
  }
  let frontier = 0
  for (let b = 0; b < state.bands; b++) {
    const { known, total } = knewByBand[b]
    const rate = total ? known / total : 0
    if (rate >= 0.5) {
      // Fully-known band: frontier at least its top edge, plus the partial share.
      frontier = b * width + rate * width
    } else {
      // First band under half: interpolate the crossover and stop.
      if (b > 0 && knewByBand[b - 1].total) frontier = b * width + rate * width
      break
    }
  }
  return Math.round(Math.min(state.deckSize, frontier))
}
