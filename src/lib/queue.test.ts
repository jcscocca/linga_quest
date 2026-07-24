import { describe, expect, it } from 'vitest'
import { assembleSession } from './queue'
import { makeDeck } from './fixtures'
import { EARNED_INTERVAL, type ItemState } from './srs'

const today = '2026-07-24'
const state = (over: Partial<ItemState>): ItemState => ({
  level: 2, interval: EARNED_INTERVAL[2], due: today, lapses: 0, seen: today, origin: 'default', ...over,
})

describe('assembleSession', () => {
  const deck = makeDeck(20) // ids es:w1..es:w20, ranks 1..20

  it('includes due reviews and caps new words at maxNew', () => {
    const states: Record<string, ItemState> = {
      'es:w1:noun': state({ due: '2026-07-20' }), // overdue
      'es:w2:noun': state({ due: '2026-07-24' }), // due today
      'es:w3:noun': state({ due: '2026-07-30' }), // not due
    }
    const cards = assembleSession(deck, states, today, { maxNew: 2, sessionSize: 10 }, () => 0)
    const ids = cards.map(c => c.item.id)
    expect(ids).toContain('es:w1:noun')
    expect(ids).toContain('es:w2:noun')
    expect(ids).not.toContain('es:w3:noun') // not due
    // new words are unseen deck items, lowest rank first, capped at 2
    const newIds = cards.filter(c => c.state.origin === 'default' && !states[c.item.id]).map(c => c.item.id)
    expect(newIds.length).toBeLessThanOrEqual(2)
    expect(newIds).toEqual(['es:w4:noun', 'es:w5:noun']) // lowest-rank unseen, in order
  })

  it('orders the most-overdue review first', () => {
    const states: Record<string, ItemState> = {
      'es:w1:noun': state({ due: '2026-07-23', interval: 1 }), // ratio 1
      'es:w2:noun': state({ due: '2026-07-14', interval: 1 }), // ratio 10 — most overdue
    }
    const cards = assembleSession(deck, states, today, { maxNew: 0, sessionSize: 10 }, () => 0)
    expect(cards[0].item.id).toBe('es:w2:noun')
  })

  it('assigns the test mode from each item level', () => {
    const states: Record<string, ItemState> = { 'es:w1:noun': state({ level: 5, due: today }) }
    const cards = assembleSession(deck, states, today, { maxNew: 0, sessionSize: 10 }, () => 0)
    expect(cards.find(c => c.item.id === 'es:w1:noun')!.mode).toBe('audio')
  })

  it('returns nothing when no review is due and maxNew is 0', () => {
    expect(assembleSession(deck, {}, today, { maxNew: 0, sessionSize: 10 }, () => 0)).toEqual([])
  })

  it('never lets new words displace due reviews when the backlog fills the session', () => {
    const big = makeDeck(50)
    const states: Record<string, ItemState> = {}
    for (let i = 1; i <= 25; i++) states[`es:w${i}:noun`] = state({ due: '2026-07-20' })
    const cards = assembleSession(big, states, today, { maxNew: 15, sessionSize: 20 }, () => 0)
    expect(cards).toHaveLength(20)
    expect(cards.every(c => states[c.item.id])).toBe(true) // all reviews, zero new
  })

  it('prioritises overdue-relative-to-interval, not absolute days late', () => {
    const states: Record<string, ItemState> = {
      'es:w1:noun': state({ due: '2026-07-14', interval: 45 }), // 10 days late, ratio ~0.22
      'es:w2:noun': state({ due: '2026-07-22', interval: 1 }),  // 2 days late, ratio 2
    }
    const cards = assembleSession(deck, states, today, { maxNew: 0, sessionSize: 10 }, () => 0)
    expect(cards[0].item.id).toBe('es:w2:noun')
  })
})
