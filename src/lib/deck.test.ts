import { describe, expect, it } from 'vitest'
import { itemId, type Deck } from './deck'
import { makeDeck, SAMPLE_DECK } from './fixtures'

describe('itemId', () => {
  it('joins lang, lemma and pos with colons', () => {
    expect(itemId('es', 'casa', 'noun')).toBe('es:casa:noun')
  })
  it('distinguishes senses that share a lemma', () => {
    expect(itemId('es', 'poder', 'verb')).not.toBe(itemId('es', 'poder', 'noun'))
  })
})

describe('makeDeck', () => {
  it('produces n items with dense ranks 1..n and matching ids', () => {
    const deck: Deck = makeDeck(50)
    expect(deck.items).toHaveLength(50)
    expect(deck.items.map(i => i.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(deck.items.every(i => i.id === itemId(deck.lang, i.lemma, i.pos))).toBe(true)
  })
})

describe('SAMPLE_DECK', () => {
  it('is a small well-formed deck with unique ids and a source', () => {
    const ids = new Set(SAMPLE_DECK.items.map(i => i.id))
    expect(ids.size).toBe(SAMPLE_DECK.items.length)
    expect(SAMPLE_DECK.items.length).toBeGreaterThanOrEqual(6)
    expect(SAMPLE_DECK.sources.length).toBeGreaterThanOrEqual(1)
  })
})
