// Spanish deck generator. Joins the doozan/spanish_data frequency list and
// Wiktionary gloss data into public/content/es/deck.json. Raw sources are
// downloaded into a gitignored raw/ dir on first run and never shipped; the
// generated deck is committed so a normal build needs no network.
//
// Run: `npm run build:deck`.  Sources: FrequencyWords (CC BY-SA 3.0) and
// Wiktionary via doozan/spanish_data (CC BY-SA).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Deck, DeckItem } from '../src/lib/deck'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const RAW = `${ROOT}raw`
const BASE = 'https://raw.githubusercontent.com/doozan/spanish_data/master'
const N = 3000

// FreeLing/Wiktionary pos → display pos. Unlisted tags are dropped.
const POS: Record<string, string> = {
  n: 'noun', v: 'verb', adj: 'adj', adv: 'adv', prep: 'prep',
  pron: 'pron', conj: 'conj', num: 'num', art: 'art', interj: 'interj',
}
const RESTRICT = /obsolete|archaic|dated|rare|vulgar|slang|chess|board games|obscure/i
// Grammatical descriptions, not translations — drop so the clean gloss surfaces.
const DESC = /\b(article|pronoun|preposition|conjunction|interjection|used|forms|denotes|indicates|expressing|nominative|reflexive|reciprocal|masculine|feminine|singular|plural|first-person|second-person|third-person|definite|indefinite|disjunctive|subject|participle|prefix|suffix|letter of)\b/i
// Homograph/meta junk (e.g. "letter: t", "the Greek letter", "the note B",
// "abbreviation of X", "prepositional form of se") — never a real translation.
const JUNK = /:|\b(greek letter|the note|abbreviation of|senses? relating|followed by|the name of|points out|prepositional form|circa|clipping of|contraction of|nickname of)\b/i

async function ensureRaw(name: string): Promise<string> {
  const path = `${RAW}/${name}`
  if (!existsSync(path)) {
    if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true })
    process.stdout.write(`downloading ${name}…\n`)
    const res = await fetch(`${BASE}/${name}`)
    if (!res.ok) throw new Error(`failed to download ${name} (HTTP ${res.status})`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(path, 'utf8')
}

export type Override = { pos?: string; gloss?: string[]; rank?: number; drop?: boolean }
/** Hand-curated accuracy corrections keyed by lemma (scripts/overrides.<lang>.json).
 *  Applied inline during construction so a corrected word keeps its natural
 *  frequency rank and is never dropped by gloss filtering. */
function loadOverrides(lang: string): Record<string, Override> {
  const path = `${ROOT}scripts/overrides.${lang}.json`
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

/** Reduce raw gloss lines to at most 2 short, clean translation senses. */
function cleanSenses(glossLines: string[]): string[] {
  const out: string[] = []
  for (const g of glossLines) {
    const stripped = g.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
    for (let sense of stripped.split(';')) {
      sense = sense.replace(/[:：]+\s*$/, '').replace(/\s+/g, ' ').replace(/^,|,$/g, '').trim()
      if (!sense || sense.length > 40 || !/[a-záéíóúñ]/i.test(sense)) continue
      if (DESC.test(sense) || JUNK.test(sense)) continue
      const words = new Set(sense.split(/[,\s]+/))
      const covered = out.some(o => { const ow = new Set(o.split(/[,\s]+/)); return [...words].every(w => ow.has(w)) })
      if (covered || out.includes(sense)) continue
      out.push(sense)
      if (out.length >= 2) return out
    }
  }
  return out
}

/** Parse es-en.data into lemma → pos → raw gloss lines (single-word headwords). */
function parseGlosses(data: string): Map<string, Map<string, string[]>> {
  const gloss = new Map<string, Map<string, string[]>>()
  for (const block of data.split('\n_____\n')) {
    const lines = block.split('\n')
    const head = lines[0]?.trim()
    if (!head || head.includes(' ')) continue
    let pos = ''
    for (let i = 1; i < lines.length; i++) {
      const pm = lines[i].match(/^pos: (\w+)/)
      if (pm) { pos = pm[1]; continue }
      const gm = lines[i].match(/^  gloss: (.+)/)
      if (gm && pos) {
        const q = lines[i + 1]?.match(/^    q: (.+)/)?.[1]
        if (q && RESTRICT.test(q)) continue
        if (!gloss.has(head)) gloss.set(head, new Map())
        const byPos = gloss.get(head)!
        if (!byPos.has(pos)) byPos.set(pos, [])
        byPos.get(pos)!.push(gm[1])
      }
    }
  }
  return gloss
}

async function main(): Promise<void> {
  const [freq, data] = await Promise.all([ensureRaw('frequency.csv'), ensureRaw('es-en.data')])
  const gloss = parseGlosses(data)

  const overrides = loadOverrides('es')
  const overridden = new Set<string>()
  const items: DeckItem[] = []
  const seen = new Set<string>()
  let noGloss = 0, skippedPos = 0
  const rows = freq.split('\n')
  for (let r = 1; r < rows.length && items.length < N; r++) {
    const row = rows[r]
    if (!row) continue
    const c1 = row.indexOf(','), c2 = row.indexOf(',', c1 + 1), c3 = row.indexOf(',', c2 + 1)
    const lemma = row.slice(c1 + 1, c2)
    const rawPos = row.slice(c2 + 1, c3)
    const flags = row.slice(c3 + 1, row.indexOf(',', c3 + 1))
    if (flags.includes('NOUSAGE') || rawPos === 'none' || !lemma || lemma.includes(' ')) continue
    const display = POS[rawPos]
    if (!display) { skippedPos++; continue }
    const ov = overrides[lemma]
    if (ov) { // curated: drop a spurious lemma, or correct it at its natural rank
      if (!ov.drop && ov.gloss && !overridden.has(lemma)) {
        overridden.add(lemma)
        const pos = ov.pos ?? display
        items.push({ id: `es:${lemma}:${pos}`, lemma, pos, gloss: ov.gloss, rank: items.length + 1 })
      }
      overridden.add(lemma)
      continue
    }
    const byPos = gloss.get(lemma)
    const rawGlosses = byPos?.get(rawPos) ?? (byPos ? [...byPos.values()][0] : undefined)
    if (!rawGlosses) { noGloss++; continue }
    const senses = cleanSenses(rawGlosses)
    if (senses.length === 0) { noGloss++; continue }
    const id = `es:${lemma}:${display}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({ id, lemma, pos: display, gloss: senses, rank: items.length + 1 })
  }

  // Place curated words at their hint rank — moving a low residual, or inserting
  // one the frequency data missed entirely.
  for (const [lemma, ov] of Object.entries(overrides)) {
    if (ov.rank == null || ov.drop || !ov.gloss) continue
    const at = items.findIndex(it => it.lemma === lemma)
    const pos = ov.pos ?? (at >= 0 ? items[at].pos : 'noun')
    if (at >= 0) items.splice(at, 1)
    items.splice(Math.min(ov.rank - 1, items.length), 0, { id: `es:${lemma}:${pos}`, lemma, pos, gloss: ov.gloss, rank: 0 })
  }
  items.length = Math.min(items.length, N)
  items.forEach((it, i) => { it.rank = i + 1 })

  const deck: Deck = {
    lang: 'es',
    generated: new Date().toISOString().slice(0, 10),
    sources: [
      { name: 'FrequencyWords (hermitdave)', url: 'https://github.com/hermitdave/FrequencyWords', license: 'CC BY-SA 3.0' },
      { name: 'Wiktionary (en) via doozan/spanish_data', url: 'https://github.com/doozan/spanish_data', license: 'CC BY-SA 3.0' },
    ],
    items,
  }
  writeFileSync(`${ROOT}public/content/es/deck.json`, JSON.stringify(deck, null, 0) + '\n')
  console.log(`✓ wrote ${items.length} items (dropped ${noGloss} no-gloss, ${skippedPos} unmapped-pos)`)
  console.log('\nfirst 12:')
  for (const it of items.slice(0, 12)) console.log(`  ${it.rank}\t${it.lemma} (${it.pos}) → ${it.gloss.join(', ')}`)
  console.log('\nspot-check (every ~350th):')
  for (let i = 175; i < items.length; i += 350) console.log(`  ${items[i].rank}\t${items[i].lemma} (${items[i].pos}) → ${items[i].gloss.join(', ')}`)
}

void main()
