import { describe, expect, it } from 'vitest'
import { probeFrontier, probePick, probeRecord, startProbe, type ProbeState } from './probe'
import { makeDeck } from './fixtures'

/** Drive a whole probe against a synthetic learner who knows every word with
 *  rank ≤ R. Returns the estimated frontier. */
function runProbe(deckSize: number, R: number, bands = 15, perBand = 10): number {
  const deck = makeDeck(deckSize)
  let st: ProbeState = startProbe(deckSize, { bands, perBand }, () => 0.5)
  while (!st.done) {
    const item = probePick(st, deck)
    st = probeRecord(st, item.rank <= R)
  }
  return probeFrontier(st)
}

describe('probe frontier estimate', () => {
  const size = 3000
  const bandWidth = size / 15

  it('lands within one band of a mid-list frontier', () => {
    const est = runProbe(size, 1500)
    expect(Math.abs(est - 1500)).toBeLessThanOrEqual(bandWidth)
  })

  it('lands within one band of a high-knowledge frontier', () => {
    const est = runProbe(size, 2600)
    expect(Math.abs(est - 2600)).toBeLessThanOrEqual(bandWidth)
  })

  it('estimates a low frontier for a mostly-unknown learner', () => {
    const est = runProbe(size, 300)
    expect(est).toBeLessThanOrEqual(bandWidth * 2)
  })

  it('tests roughly bands×perBand words', () => {
    const deck = makeDeck(size)
    let st = startProbe(size, { bands: 15, perBand: 10 }, () => 0.5)
    let n = 0
    while (!st.done) { probePick(st, deck); st = probeRecord(st, true); n++ }
    expect(n).toBeGreaterThanOrEqual(120)
    expect(n).toBeLessThanOrEqual(160)
  })
})

import { estimateVocab, seedDeck } from './probe'

describe('seedDeck', () => {
  const deck = makeDeck(100)

  it('seeds words well below the frontier as known, well above as new', () => {
    const seeds = seedDeck(deck, 60, '2026-07-24')
    expect(seeds['es:w10:noun'].level).toBe(4) // deep known
    expect(seeds['es:w10:noun'].origin).toBe('probe')
    expect(seeds['es:w90:noun'].level).toBe(0) // deep unknown
  })

  it('seeds the frontier band at level 1', () => {
    const seeds = seedDeck(deck, 60, '2026-07-24')
    expect(seeds['es:w60:noun'].level).toBe(1) // right at the frontier
  })

  it('produces one seed per deck item', () => {
    expect(Object.keys(seedDeck(deck, 60, '2026-07-24'))).toHaveLength(100)
  })
})

describe('estimateVocab', () => {
  it('is the frontier rank', () => {
    expect(estimateVocab(1500)).toBe(1500)
  })
})
