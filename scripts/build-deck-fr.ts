// French deck generator. Streams the kaikki.org French wiktextract dump
// (lemmas + POS + English glosses + inflected forms) and joins it with the
// hermitdave frequency list. French frequency is surface forms, so each form's
// count is folded up to its lemma via kaikki's forms/inflection links, tracking
// which POS each contribution came from so verb infinitives (frequency from
// conjugations) are classified as verbs, not same-spelled nouns.
//
// Run: `npm run build:deck:fr`.  Raw sources download into a gitignored raw/ dir
// (kaikki dump ~570 MB) and are never shipped; the generated deck is committed.

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Deck, DeckItem } from '../src/lib/deck'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const RAW = `${ROOT}raw`
const N = 3000
const FREQ_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt'
const KAIKKI_URL = 'https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl'

const POS: Record<string, string> = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', prep: 'prep',
  pron: 'pron', conj: 'conj', num: 'num', article: 'art', intj: 'interj', det: 'det',
}
const PRIO: Record<string, number> = { noun: 0, verb: 1, adj: 2, adv: 3, num: 4, pron: 5, prep: 6, conj: 7, art: 8, det: 9, interj: 10 }
const DESC = /\b(article|pronoun|preposition|conjunction|interjection|determiner|used|forms|denotes|indicates|expressing|substitutes?|nominative|reflexive|masculine|feminine|singular|plural|first-person|second-person|third-person|definite|indefinite|disjunctive|subject|participle|prefix|suffix|letter of|inflection of|form of)\b/i
// Homograph/meta junk (e.g. "the note B", "abbreviation of circa", "letter: x",
// "Followed by rank") — never a real translation.
const JUNK = /:|\b(greek letter|the note|abbreviation of|senses? relating|followed by|the name of|points out|prepositional form|circa|clipping of|contraction of|nickname of)\b/i

type Override = { pos?: string; gloss?: string[]; rank?: number; drop?: boolean }
/** Hand-curated accuracy corrections keyed by lemma (scripts/overrides.<lang>.json). */
function loadOverrides(lang: string): Record<string, Override> {
  const path = `${ROOT}scripts/overrides.${lang}.json`
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

/** Reduce raw gloss lines to at most 2 short, clean translation senses. */
function cleanSenses(glossLines: string[]): string[] {
  const out: string[] = []
  for (const g of glossLines) {
    const stripped = g.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
    for (let sense of stripped.split(/;|,/)) {
      sense = sense.replace(/[:：]+\s*$/, '').replace(/\s+/g, ' ').trim()
      if (!sense || sense.length > 32 || !/[a-zàâçéèêëîïôûùüÿñæœ]/i.test(sense)) continue
      if (DESC.test(sense) || JUNK.test(sense)) continue
      const words = new Set(sense.split(/\s+/))
      if (out.some(o => { const ow = new Set(o.split(/\s+/)); return [...words].every(w => ow.has(w)) })) continue
      if (!out.includes(sense)) out.push(sense)
      if (out.length >= 2) return out
    }
  }
  return out
}

async function ensureRaw(name: string, url: string): Promise<string> {
  const path = `${RAW}/${name}`
  if (!existsSync(path)) {
    if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true })
    process.stdout.write(`downloading ${name}…\n`)
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`failed to download ${name} (HTTP ${res.status})`)
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(path))
  }
  return path
}

async function main(): Promise<void> {
  const freqPath = await ensureRaw('fr_50k.txt', FREQ_URL)
  const kaikkiPath = await ensureRaw('kaikki-fr.jsonl', KAIKKI_URL)

  const freq = new Map<string, number>()
  for (const line of readFileSync(freqPath, 'utf8').split('\n')) {
    const sp = line.indexOf(' ')
    if (sp < 0) continue
    freq.set(line.slice(0, sp), Number(line.slice(sp + 1)) || 0)
  }

  const lemmaGloss = new Map<string, { word: string; pos: string; glosses: string[] }>() // key word|pos
  const formToLemma = new Map<string, { word: string; pos: string }>() // surface -> lemma + inflected pos

  const rl = createInterface({ input: createReadStream(kaikkiPath), crlfDelay: Infinity })
  for await (const line of rl) {
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    const word: string = o.word, pos: string = o.pos
    if (!word || !pos || word.includes(' ')) continue
    const display = POS[pos]
    const s0 = o.senses?.[0]
    if (s0?.form_of?.[0]?.word) { // inflection → fold to its lemma, crediting this pos
      if (display && freq.has(word) && !formToLemma.has(word)) formToLemma.set(word, { word: s0.form_of[0].word, pos: display })
      continue
    }
    if (!display) continue
    const glossLines: string[] = (o.senses || []).flatMap((s: any) =>
      s.tags?.some((t: string) => /obsolete|archaic|dated|rare/.test(t)) ? [] : (s.glosses || []))
    if (!glossLines.length) continue
    const key = word + '|' + display
    if (!lemmaGloss.has(key)) lemmaGloss.set(key, { word, pos: display, glosses: glossLines })
    for (const f of o.forms || []) if (f.form && f.form !== word && freq.has(f.form) && !formToLemma.has(f.form)) formToLemma.set(f.form, { word, pos: display })
  }

  // Fold frequency to lemmas, tracking which pos each contribution came from.
  const total = new Map<string, number>()
  const posWeight = new Map<string, Map<string, number>>()
  for (const [surface, count] of freq) {
    const m = formToLemma.get(surface)
    const word = m ? m.word : surface
    total.set(word, (total.get(word) ?? 0) + count)
    if (m) {
      if (!posWeight.has(word)) posWeight.set(word, new Map())
      const pw = posWeight.get(word)!
      pw.set(m.pos, (pw.get(m.pos) ?? 0) + count)
    }
  }

  const byWord = new Map<string, { pos: string; glosses: string[] }[]>()
  for (const e of lemmaGloss.values()) {
    if (!byWord.has(e.word)) byWord.set(e.word, [])
    byWord.get(e.word)!.push(e)
  }

  const overrides = loadOverrides('fr')
  const words = [...total.entries()].filter(([w]) => byWord.has(w)).sort((a, b) => b[1] - a[1])
  const items: DeckItem[] = []
  for (const [word] of words) {
    if (items.length >= N) break
    const ov = overrides[word]
    if (ov) { // curated: drop a spurious lemma, or correct it at its natural rank
      if (!ov.drop && ov.gloss) {
        const pos = ov.pos ?? byWord.get(word)![0].pos
        items.push({ id: `fr:${word}:${pos}`, lemma: word, pos, gloss: ov.gloss, rank: items.length + 1 })
      }
      continue
    }
    const cands = byWord.get(word)!
    const pw = posWeight.get(word)
    const best = [...cands].sort((a, b) =>
      (pw ? (pw.get(b.pos) ?? 0) - (pw.get(a.pos) ?? 0) : 0) || (PRIO[a.pos] ?? 9) - (PRIO[b.pos] ?? 9))[0]
    const gloss = cleanSenses(best.glosses)
    if (!gloss.length) continue
    items.push({ id: `fr:${word}:${best.pos}`, lemma: word, pos: best.pos, gloss, rank: items.length + 1 })
  }

  // Place curated words at their hint rank — moving one that folded to a low
  // residual rank, or inserting one the fold missed entirely (a common noun
  // whose surface folded to a rare homograph verb, e.g. monde→monder).
  for (const [lemma, ov] of Object.entries(overrides)) {
    if (ov.rank == null || ov.drop || !ov.gloss) continue
    const at = items.findIndex(it => it.lemma === lemma)
    const pos = ov.pos ?? (at >= 0 ? items[at].pos : 'noun')
    if (at >= 0) items.splice(at, 1)
    items.splice(Math.min(ov.rank - 1, items.length), 0, { id: `fr:${lemma}:${pos}`, lemma, pos, gloss: ov.gloss, rank: 0 })
  }
  items.length = Math.min(items.length, N)
  items.forEach((it, i) => { it.rank = i + 1 })

  const deck: Deck = {
    lang: 'fr',
    generated: new Date().toISOString().slice(0, 10),
    sources: [
      { name: 'FrequencyWords (hermitdave)', url: 'https://github.com/hermitdave/FrequencyWords', license: 'CC BY-SA 4.0' },
      { name: 'Wiktionary (en) via kaikki.org', url: 'https://kaikki.org/dictionary/French/', license: 'CC BY-SA 4.0' },
    ],
    items,
  }
  writeFileSync(`${ROOT}public/content/fr/deck.json`, JSON.stringify(deck, null, 0) + '\n')
  console.log(`✓ wrote ${items.length} items (${lemmaGloss.size} lemmas w/ glosses, ${formToLemma.size} forms folded)`)
  console.log('\nfirst 12:')
  for (const it of items.slice(0, 12)) console.log(`  ${it.rank}\t${it.lemma} (${it.pos}) → ${it.gloss.join(', ')}`)
  console.log('\nspot-check (every ~350th):')
  for (let i = 175; i < items.length; i += 350) console.log(`  ${items[i].rank}\t${items[i].lemma} (${items[i].pos}) → ${items[i].gloss.join(', ')}`)
}

void main()
