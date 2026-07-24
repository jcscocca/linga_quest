import { describe, expect, it } from 'vitest'
import { choiceOptions, distractors, gradeCard } from './cards'
import { makeDeck, SAMPLE_DECK } from './fixtures'

describe('distractors', () => {
  const deck = makeDeck(100)
  it('returns n wrong glosses, none equal to the answer, no duplicates', () => {
    const item = deck.items[40]
    const ds = distractors(deck, item, 3, () => 0.5)
    expect(ds).toHaveLength(3)
    expect(ds).not.toContain(item.gloss[0])
    expect(new Set(ds).size).toBe(3)
  })
})

describe('choiceOptions', () => {
  it('includes the correct gloss among 4 unique options', () => {
    const item = SAMPLE_DECK.items[0] // casa → house
    const opts = choiceOptions(SAMPLE_DECK, item, () => 0.5)
    expect(opts).toContain('house')
    expect(opts).toHaveLength(4)
    expect(new Set(opts).size).toBe(4)
  })
})

describe('gradeCard', () => {
  const casa = SAMPLE_DECK.items[0] // lemma casa, gloss ["house","home"]
  it('choice: correct only when the chosen gloss matches', () => {
    expect(gradeCard(casa, 'choice', 'house').correct).toBe(true)
    expect(gradeCard(casa, 'choice', 'dog').correct).toBe(false)
  })
  it('type/audio: grades the typed Spanish lemma, accent-lenient', () => {
    expect(gradeCard(casa, 'type', 'casa').correct).toBe(true)
    expect(gradeCard(casa, 'audio', 'casa').correct).toBe(true)
    const near = gradeCard({ ...casa, lemma: 'árbol' }, 'type', 'arbol')
    expect(near.correct).toBe(true) // accent-lenient accept with a note
    expect(near.note).toBeTruthy()
  })
})
