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
