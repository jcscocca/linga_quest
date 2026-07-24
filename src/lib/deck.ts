// The deck: static, generated content fetched at runtime. One item = one word
// to learn. `id` (lang:lemma:pos) is stable across regeneration so per-item
// scheduling state survives a new deck build.

export type Grade = 'right' | 'wrong'

export interface DeckSource {
  name: string
  url: string
  license: string
}

export interface DeckExample {
  t: string
  en: string
}

export interface DeckItem {
  id: string
  lemma: string
  pos: string
  /** English senses; the first is canonical for grading. */
  gloss: string[]
  /** Dense frequency rank, 1..N, no gaps. The probe depends on this. */
  rank: number
  theme?: string | null
  ex?: DeckExample
}

export interface Deck {
  lang: string
  generated: string
  sources: DeckSource[]
  items: DeckItem[]
}

export function itemId(lang: string, lemma: string, pos: string): string {
  return `${lang}:${lemma}:${pos}`
}

/** Fetch a generated deck. Mirrors content.ts loadJson but stands alone so the
 *  engine doesn't depend on the retiring curriculum module. */
export async function loadDeck(base: string, lang: string): Promise<Deck> {
  const res = await fetch(`${base}content/${lang}/deck.json`)
  if (!res.ok) throw new Error(`Failed to load deck ${lang} (HTTP ${res.status})`)
  return res.json() as Promise<Deck>
}
