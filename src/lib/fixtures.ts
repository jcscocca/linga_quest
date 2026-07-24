// Test-support decks. Small and dependency-free so unit tests never touch the
// network or real content. Imported only by *.test.ts files.

import { itemId, type Deck, type DeckItem } from './deck'

/** A deck of n items with dense ranks 1..n, for probe/queue math. */
export function makeDeck(n: number, lang = 'es'): Deck {
  const items: DeckItem[] = Array.from({ length: n }, (_, i) => {
    const lemma = `w${i + 1}`
    return { id: itemId(lang, lemma, 'noun'), lemma, pos: 'noun', gloss: [`gloss${i + 1}`], rank: i + 1 }
  })
  return { lang, generated: '2026-07-24', sources: [{ name: 'test', url: 'x', license: 'CC BY-SA' }], items }
}

/** A hand-written, realistic tiny deck for mode/queue tests. */
export const SAMPLE_DECK: Deck = {
  lang: 'es',
  generated: '2026-07-24',
  sources: [{ name: 'test', url: 'x', license: 'CC BY-SA 3.0' }],
  items: [
    { id: 'es:casa:noun', lemma: 'casa', pos: 'noun', gloss: ['house', 'home'], rank: 1, ex: { t: 'La casa es grande.', en: 'The house is big.' } },
    { id: 'es:perro:noun', lemma: 'perro', pos: 'noun', gloss: ['dog'], rank: 2 },
    { id: 'es:comer:verb', lemma: 'comer', pos: 'verb', gloss: ['to eat'], rank: 3 },
    { id: 'es:rojo:adj', lemma: 'rojo', pos: 'adj', gloss: ['red'], rank: 4 },
    { id: 'es:aunque:conj', lemma: 'aunque', pos: 'conj', gloss: ['although'], rank: 5 },
    { id: 'es:umbral:noun', lemma: 'umbral', pos: 'noun', gloss: ['threshold'], rank: 6 },
    { id: 'es:soslayar:verb', lemma: 'soslayar', pos: 'verb', gloss: ['to sidestep'], rank: 7 },
    { id: 'es:ceniza:noun', lemma: 'ceniza', pos: 'noun', gloss: ['ash'], rank: 8 },
  ],
}
