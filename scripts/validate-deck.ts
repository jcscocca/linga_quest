// Deck gate. Validates every public/content/<lang>/deck.json structurally and
// confirms each item's canonical gloss passes the real grader (self-consistency,
// same principle as the old validate-content). Run: `npm run validate`.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Deck } from '../src/lib/deck'
import { checkText } from '../src/lib/check'

const CONTENT = fileURLToPath(new URL('../public/content/', import.meta.url))

interface Issue { where: string; msg: string }

export function validateDecks(): Issue[] {
  const issues: Issue[] = []
  const add = (where: string, msg: string) => issues.push({ where, msg })
  const langs = readdirSync(CONTENT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  if (langs.length === 0) add('content', 'no language folders found')

  for (const lang of langs) {
    const path = `${CONTENT}${lang}/deck.json`
    if (!existsSync(path)) { add(lang, 'missing deck.json'); continue }
    let deck: Deck
    try { deck = JSON.parse(readFileSync(path, 'utf8')) as Deck } catch (e) { add(`${lang}/deck.json`, `unreadable: ${String(e)}`); continue }

    if (deck.lang !== lang) add(`${lang}/deck.json`, `lang "${deck.lang}" != folder "${lang}"`)
    if (!Array.isArray(deck.sources) || deck.sources.length === 0) add(`${lang}/deck.json`, 'missing sources[] attribution')
    if (!Array.isArray(deck.items) || deck.items.length === 0) { add(`${lang}/deck.json`, 'no items'); continue }
    if (deck.items.length < 100) add(`${lang}/deck.json`, `only ${deck.items.length} items — expected a full deck`)

    const ids = new Set<string>()
    deck.items.forEach((it, i) => {
      const w = `${lang}#${it.id ?? i}`
      if (!it.id) add(w, 'item missing id')
      if (ids.has(it.id)) add(w, 'duplicate id')
      ids.add(it.id)
      if (it.id !== `${lang}:${it.lemma}:${it.pos}`) add(w, `id must equal lang:lemma:pos`)
      if (!it.lemma) add(w, 'missing lemma')
      if (!Array.isArray(it.gloss) || it.gloss.length === 0 || !it.gloss[0]) add(w, 'gloss must be a non-empty list')
      else if (it.gloss[0].length > 60) add(w, `gloss too long: "${it.gloss[0]}"`)
      if (it.rank !== i + 1) add(w, `rank ${it.rank} not dense (expected ${i + 1})`)
      // self-consistency: the canonical gloss must pass the grader against itself
      if (it.gloss?.[0] && !checkText(it.gloss[0], it.gloss).correct) add(w, `gloss "${it.gloss[0]}" fails the checker`)
      if (it.ex && !it.ex.t.toLowerCase().includes(it.lemma.toLowerCase())) add(w, `example does not contain the lemma`)
    })
  }
  return issues
}

if (!process.env.VITEST) {
  const issues = validateDecks()
  if (issues.length === 0) console.log('✓ decks valid — structure, dense ranks, self-consistent glosses, attribution.')
  else { console.error(`✗ ${issues.length} deck issue(s):`); for (const i of issues) console.error(`  [${i.where}] ${i.msg}`); process.exit(1) }
}
