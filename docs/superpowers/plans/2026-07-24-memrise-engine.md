# Memrise SRS Engine — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-logic core of the Memrise-style trainer — deck schema, per-language persistence, the maturity-escalating scheduler, session queue, and adaptive frequency probe — fully unit-tested against a fixture deck, with no UI.

**Architecture:** Five focused modules under `src/lib/`, each one responsibility, each with a direct vitest suite. Scheduling is level-driven (level 0–5 sets both the interval and the test mode); the probe finds a knowledge frontier by frequency rank and seeds every deck word's initial state from it. State persists to one idb-keyval store per language, keyed by a stable `lang:lemma:pos` id so it survives deck regeneration. Reuses the existing `check.ts` grader and `xp.ts` date helpers unchanged.

**Tech Stack:** TypeScript, Zustand, idb-keyval (with `createStore`/`entries`/`setMany`), Vitest + fake-indexeddb (already configured in `src/test-setup.ts`).

**Companion spec:** `docs/superpowers/specs/2026-07-24-memrise-redesign-design.md`

### Deliberate deviations from the spec (flagged for review)

1. **`ItemState` drops the `ease` field.** The spec listed `ease` (SM-2 style), but v1 derives intervals from a level→interval table, so `ease` would be a dead field. YAGNI — dropped. `lapses` is kept (it's a real counter and a metric). Reintroduce `ease` only if intervals ever become ease-driven.
2. **The probe uses a fixed band sweep, not adaptive binary-search convergence.** Same ~150-test budget and the identical outcome (estimate a frontier, seed ~3,000 words from it), but a uniform sweep is simpler and more robust on lumpy real-world knowledge than adaptive stepping. Adaptive convergence is a possible later refinement.
3. **Metrics ship two honest numbers in v1** (estimated vocabulary size, words-at-strong-retention), not three. "Words-restored-this-month" needs per-word history we don't yet store; deferred rather than faked.

If any of these three is wrong, say so before execution — they're the only places the plan departs from the approved design.

---

## File structure (Plan 1)

**Create:**
- `src/lib/deck.ts` — deck types, `itemId()`, `loadDeck()`
- `src/lib/deck.test.ts`
- `src/lib/fixtures.ts` — `makeDeck(n)` builder + `SAMPLE_DECK` (test support; tiny, importable)
- `src/lib/srs.ts` — `ItemState`, interval table, `testModeForLevel()`, `schedule()`, `seedFromProbe()`, `newState()`, `isStrong()`
- `src/lib/srs.test.ts`
- `src/lib/queue.ts` — `assembleSession()`
- `src/lib/queue.test.ts`
- `src/lib/probe.ts` — `startProbe()`, `probePick()`, `probeRecord()`, `probeFrontier()`, `seedDeck()`, `estimateVocab()`
- `src/lib/probe.test.ts`
- `src/lib/engine.ts` — the Zustand store: per-language persistence, `hydrate`, `grade`, `applyProbe`, `resetItem`, metrics, export/import
- `src/lib/engine.test.ts`

**Reused unchanged:** `src/lib/check.ts`, `src/lib/xp.ts` (`todayString`, `addDays`, `dayDiff`).

**Not touched in Plan 1:** all `src/components/**`, `src/App.tsx`, the old `progress.ts`/`review.ts`/`content.ts` (retired in Plan 2). Plan 1 adds new modules alongside; nothing is deleted yet, so the app still builds and the old tests still pass throughout.

Run a single suite with: `npx vitest run src/lib/<name>.test.ts`
Run everything with: `npm test`

---

## Task 1: Deck types, `itemId`, and fixtures

**Files:**
- Create: `src/lib/deck.ts`
- Create: `src/lib/fixtures.ts`
- Test: `src/lib/deck.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/deck.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/deck.test.ts`
Expected: FAIL — cannot find module `./deck` / `./fixtures`.

- [ ] **Step 3: Write `src/lib/deck.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/lib/fixtures.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/deck.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 6: Commit**

```bash
git add src/lib/deck.ts src/lib/fixtures.ts src/lib/deck.test.ts
git commit -m "feat(engine): deck schema, itemId, and test fixtures"
```

---

## Task 2: Scheduler — state, intervals, test mode, `schedule()`

**Files:**
- Create: `src/lib/srs.ts`
- Test: `src/lib/srs.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/srs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EARNED_INTERVAL, LAPSE_DROP, MAX_LEVEL, newState, schedule, testModeForLevel, type ItemState } from './srs'

const at = (level: number, over: Partial<ItemState> = {}): ItemState => ({
  level, interval: EARNED_INTERVAL[level], due: '2026-07-24', lapses: 0, seen: '2026-07-24', origin: 'default', ...over,
})

describe('testModeForLevel', () => {
  it('escalates choice → type → audio with maturity', () => {
    expect(testModeForLevel(0)).toBe('choice')
    expect(testModeForLevel(2)).toBe('choice')
    expect(testModeForLevel(3)).toBe('type')
    expect(testModeForLevel(4)).toBe('type')
    expect(testModeForLevel(5)).toBe('audio')
  })
})

describe('newState', () => {
  it('is an unseen level-0 word due today', () => {
    const s = newState('2026-07-24')
    expect(s).toEqual({ level: 0, interval: 0, due: '2026-07-24', lapses: 0, seen: '2026-07-24', origin: 'default' })
  })
})

describe('schedule', () => {
  it('on right: raises level by one and pushes due out by the earned interval', () => {
    const s = schedule(at(2), 'right', '2026-07-24')
    expect(s.level).toBe(3)
    expect(s.interval).toBe(EARNED_INTERVAL[3])
    expect(s.due).toBe('2026-08-01') // +8 days
    expect(s.seen).toBe('2026-07-24')
  })

  it('caps level at MAX_LEVEL on repeated success', () => {
    const s = schedule(at(MAX_LEVEL), 'right', '2026-07-24')
    expect(s.level).toBe(MAX_LEVEL)
    expect(s.interval).toBe(EARNED_INTERVAL[MAX_LEVEL])
  })

  it('on wrong: drops LAPSE_DROP levels, resets interval, counts a lapse', () => {
    const s = schedule(at(5, { lapses: 1 }), 'wrong', '2026-07-24')
    expect(s.level).toBe(5 - LAPSE_DROP)
    expect(s.interval).toBe(EARNED_INTERVAL[5 - LAPSE_DROP])
    expect(s.lapses).toBe(2)
  })

  it('floors level at 0 on a wrong answer from a low level', () => {
    const s = schedule(at(1), 'wrong', '2026-07-24')
    expect(s.level).toBe(0)
    expect(s.due).toBe('2026-07-24') // interval 0 → due today
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/srs.test.ts`
Expected: FAIL — cannot find module `./srs`.

- [ ] **Step 3: Write `src/lib/srs.ts`**

```ts
// The scheduler. One schedule per word. `level` (0..5) drives BOTH the next
// interval (via EARNED_INTERVAL) and how the word is tested (testModeForLevel).
// A right answer matures the word one level; a wrong answer drops it LAPSE_DROP
// levels back toward cheap recognition so it re-stabilizes fast.

import { addDays } from './xp'
import type { Grade } from './deck'

export type TestMode = 'choice' | 'type' | 'audio'

export interface ItemState {
  level: number
  interval: number
  due: string
  lapses: number
  seen: string
  origin: 'probe' | 'manual' | 'default'
}

export const MAX_LEVEL = 5
export const LAPSE_DROP = 2

/** Interval (days) a word EARNS by reaching each level through review. Triage
 *  may seed a different interval — level and interval are independent fields. */
export const EARNED_INTERVAL: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 8, 4: 21, 5: 45 }

export function testModeForLevel(level: number): TestMode {
  if (level >= 5) return 'audio'
  if (level >= 3) return 'type'
  return 'choice'
}

export function newState(today: string): ItemState {
  return { level: 0, interval: 0, due: today, lapses: 0, seen: today, origin: 'default' }
}

export function schedule(s: ItemState, grade: Grade, today: string): ItemState {
  if (grade === 'right') {
    const level = Math.min(MAX_LEVEL, s.level + 1)
    const interval = EARNED_INTERVAL[level]
    return { ...s, level, interval, due: addDays(today, interval), seen: today }
  }
  const level = Math.max(0, s.level - LAPSE_DROP)
  const interval = EARNED_INTERVAL[level]
  return { ...s, level, interval, due: addDays(today, interval), lapses: s.lapses + 1, seen: today }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/srs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs.ts src/lib/srs.test.ts
git commit -m "feat(engine): level-driven scheduler and test-mode escalation"
```

---

## Task 3: Probe seeding and the "strong" metric helper

**Files:**
- Modify: `src/lib/srs.ts` (append)
- Test: `src/lib/srs.test.ts` (append)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/srs.test.ts`:

```ts
import { isStrong, seedFromProbe } from './srs'

describe('seedFromProbe', () => {
  it('seeds a known word mature with a conservative 30-day interval', () => {
    const s = seedFromProbe('known', '2026-07-24')
    expect(s).toEqual({ level: 4, interval: 30, due: '2026-08-23', lapses: 0, seen: '2026-07-24', origin: 'probe' })
  })
  it('seeds a frontier-band word at level 1', () => {
    expect(seedFromProbe('fuzzy', '2026-07-24').level).toBe(1)
  })
  it('seeds an unknown word as new (level 0, due today)', () => {
    const s = seedFromProbe('unknown', '2026-07-24')
    expect(s.level).toBe(0)
    expect(s.due).toBe('2026-07-24')
    expect(s.origin).toBe('probe')
  })
})

describe('isStrong', () => {
  it('is true for a mature word that is not overdue', () => {
    expect(isStrong({ level: 4, interval: 21, due: '2026-08-14', lapses: 0, seen: '2026-07-24', origin: 'probe' }, '2026-07-24')).toBe(true)
  })
  it('is false once a mature word is overdue', () => {
    expect(isStrong({ level: 4, interval: 21, due: '2026-07-20', lapses: 0, seen: '2026-06-29', origin: 'probe' }, '2026-07-24')).toBe(false)
  })
  it('is false for a low-level word even if not due', () => {
    expect(isStrong({ level: 2, interval: 3, due: '2026-07-27', lapses: 0, seen: '2026-07-24', origin: 'default' }, '2026-07-24')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/srs.test.ts`
Expected: FAIL — `seedFromProbe`/`isStrong` not exported.

- [ ] **Step 3: Append to `src/lib/srs.ts`**

```ts
export type ProbeVerdict = 'known' | 'fuzzy' | 'unknown'

/** Triage → initial state. A known word is seeded mature but with a
 *  deliberately conservative 30-day interval (not level 4's earned 21) — a
 *  fresh estimate gets one month before it must prove itself. */
export function seedFromProbe(verdict: ProbeVerdict, today: string): ItemState {
  if (verdict === 'known') return { level: 4, interval: 30, due: addDays(today, 30), lapses: 0, seen: today, origin: 'probe' }
  if (verdict === 'fuzzy') return { level: 1, interval: EARNED_INTERVAL[1], due: addDays(today, EARNED_INTERVAL[1]), lapses: 0, seen: today, origin: 'probe' }
  return { level: 0, interval: 0, due: today, lapses: 0, seen: today, origin: 'probe' }
}

/** A word counts as "strong" for metrics when it is mature (level ≥ 4) and not
 *  yet overdue. */
export function isStrong(s: ItemState, today: string): boolean {
  return s.level >= 4 && today <= s.due
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/srs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srs.ts src/lib/srs.test.ts
git commit -m "feat(engine): probe seeding and strong-retention helper"
```

---

## Task 4: Session queue assembly

**Files:**
- Create: `src/lib/queue.ts`
- Test: `src/lib/queue.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/queue.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: FAIL — cannot find module `./queue`.

- [ ] **Step 3: Write `src/lib/queue.ts`**

```ts
// Builds one study session for the active language: all due reviews (most
// overdue first), plus up to maxNew previously-unseen words fed in by rank.
// New words are interleaved among reviews so a session is never a wall of
// unfamiliar cards.

import { dayDiff } from './xp'
import type { Deck, DeckItem } from './deck'
import { newState, testModeForLevel, type ItemState } from './srs'

export interface SessionCard {
  item: DeckItem
  state: ItemState
  mode: ReturnType<typeof testModeForLevel>
}

export interface SessionOpts {
  maxNew?: number
  sessionSize?: number
}

export function assembleSession(
  deck: Deck,
  states: Record<string, ItemState>,
  today: string,
  opts: SessionOpts = {},
  rng: () => number = Math.random,
): SessionCard[] {
  const maxNew = opts.maxNew ?? 15
  const sessionSize = opts.sessionSize ?? 20

  const reviews: SessionCard[] = deck.items
    .filter(it => states[it.id] && states[it.id].due <= today)
    .map(it => ({ it, s: states[it.id], ratio: dayDiff(states[it.id].due, today) / Math.max(1, states[it.id].interval) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map(({ it, s }) => ({ item: it, state: s, mode: testModeForLevel(s.level) }))

  const fresh: SessionCard[] = deck.items
    .filter(it => !states[it.id])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxNew)
    .map(it => ({ item: it, state: newState(today), mode: 'choice' as const }))

  return interleave(reviews, fresh, rng).slice(0, sessionSize)
}

/** Weave new cards among reviews at roughly even spacing (order within each
 *  group preserved; rng only jitters placement). */
function interleave(reviews: SessionCard[], fresh: SessionCard[], rng: () => number): SessionCard[] {
  if (fresh.length === 0) return reviews
  if (reviews.length === 0) return fresh
  const out: SessionCard[] = []
  const gap = reviews.length / (fresh.length + 1)
  let fi = 0
  for (let i = 0; i < reviews.length; i++) {
    out.push(reviews[i])
    while (fi < fresh.length && (fi + 1) * gap <= i + 1 + (rng() - 0.5)) out.push(fresh[fi++])
  }
  while (fi < fresh.length) out.push(fresh[fi++])
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat(engine): session queue — due reviews plus capped new words"
```

---

## Task 5: The probe — frontier sweep

**Files:**
- Create: `src/lib/probe.ts`
- Test: `src/lib/probe.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/probe.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/probe.test.ts`
Expected: FAIL — cannot find module `./probe`.

- [ ] **Step 3: Write `src/lib/probe.ts`**

```ts
// The adaptive triage probe. Vocabulary knowledge tracks frequency rank, so
// instead of testing every word we sweep a fixed set of frequency bands, test
// a few words per band, and estimate the FRONTIER — the rank where "know it"
// crosses below half. That frontier seeds initial state for the whole deck and
// doubles as an estimated vocabulary size.

import type { Deck, DeckItem } from './deck'

export interface ProbeOpts {
  bands: number
  perBand: number
}

export interface ProbeState {
  deckSize: number
  bands: number
  perBand: number
  /** ranks (1-based) queued to test, in order */
  queue: number[]
  /** index into queue of the next word to test */
  cursor: number
  /** knew[i] aligns with queue[i] */
  knew: boolean[]
  done: boolean
}

/** Build the fixed sweep: perBand evenly-spaced ranks inside each band. */
export function startProbe(deckSize: number, opts: ProbeOpts, rng: () => number = Math.random): ProbeState {
  const { bands, perBand } = opts
  const width = deckSize / bands
  const queue: number[] = []
  for (let b = 0; b < bands; b++) {
    const lo = b * width
    for (let k = 0; k < perBand; k++) {
      const frac = (k + 0.5 + (rng() - 0.5) * 0.5) / perBand
      queue.push(Math.min(deckSize, Math.max(1, Math.round(lo + frac * width))))
    }
  }
  return { deckSize, bands, perBand, queue, cursor: 0, knew: [], done: queue.length === 0 }
}

/** The next word to show, chosen by its queued rank. */
export function probePick(state: ProbeState, deck: Deck): DeckItem {
  const rank = state.queue[state.cursor]
  return deck.items.find(i => i.rank === rank) ?? deck.items[Math.min(deck.items.length - 1, rank - 1)]
}

export function probeRecord(state: ProbeState, knew: boolean): ProbeState {
  const knewNext = [...state.knew, knew]
  const cursor = state.cursor + 1
  return { ...state, knew: knewNext, cursor, done: cursor >= state.queue.length }
}

/** Estimate the frontier: the highest band-boundary rank still known ≥ 50%.
 *  Interpolates within the crossover band for a smoother number. */
export function probeFrontier(state: ProbeState): number {
  const width = state.deckSize / state.bands
  const knewByBand: { known: number; total: number }[] = Array.from({ length: state.bands }, () => ({ known: 0, total: 0 }))
  for (let i = 0; i < state.knew.length; i++) {
    const band = Math.min(state.bands - 1, Math.floor((state.queue[i] - 1) / width))
    knewByBand[band].total++
    if (state.knew[i]) knewByBand[band].known++
  }
  let frontier = 0
  for (let b = 0; b < state.bands; b++) {
    const { known, total } = knewByBand[b]
    const rate = total ? known / total : 0
    if (rate >= 0.5) {
      // Fully-known band: frontier at least its top edge, plus the partial share.
      frontier = b * width + rate * width
    } else {
      // First band under half: interpolate the crossover and stop.
      if (b > 0 && knewByBand[b - 1].total) frontier = b * width + rate * width
      break
    }
  }
  return Math.round(Math.min(state.deckSize, frontier))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/probe.ts src/lib/probe.test.ts
git commit -m "feat(engine): frequency-band probe with frontier estimate"
```

---

## Task 6: Probe → deck seeding and vocab estimate

**Files:**
- Modify: `src/lib/probe.ts` (append)
- Test: `src/lib/probe.test.ts` (append)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/probe.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/probe.test.ts`
Expected: FAIL — `seedDeck`/`estimateVocab` not exported.

- [ ] **Step 3: Append to `src/lib/probe.ts`**

```ts
import { seedFromProbe, type ItemState, type ProbeVerdict } from './srs'

/** Half-band margin around the frontier that seeds as "fuzzy". */
const FUZZY_MARGIN = 0.5

/** Seed initial state for EVERY deck item from an estimated frontier. */
export function seedDeck(deck: Deck, frontier: number, today: string): Record<string, ItemState> {
  const width = deck.items.length / 15
  const margin = width * FUZZY_MARGIN
  const out: Record<string, ItemState> = {}
  for (const it of deck.items) {
    let verdict: ProbeVerdict
    if (it.rank <= frontier - margin) verdict = 'known'
    else if (it.rank >= frontier + margin) verdict = 'unknown'
    else verdict = 'fuzzy'
    out[it.id] = seedFromProbe(verdict, today)
  }
  return out
}

/** The frontier rank is itself the estimated vocabulary size. */
export function estimateVocab(frontier: number): number {
  return frontier
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/probe.ts src/lib/probe.test.ts
git commit -m "feat(engine): seed whole deck from probe frontier"
```

---

## Task 7: Engine store — per-language persistence, `hydrate`, `grade`

**Files:**
- Create: `src/lib/engine.ts`
- Test: `src/lib/engine.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/engine.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { entries } from 'idb-keyval'
import { useEngine, itemStore } from './engine'
import { todayString } from './xp'
import type { ItemState } from './srs'

async function reset() {
  useEngine.setState({ activeLang: 'es', states: {}, profile: { version: 2, frontier: {}, hydrated: true }, hydrated: true })
}

beforeEach(reset)

describe('grade', () => {
  it('creates state for an unseen word and matures it on a right answer', async () => {
    await useEngine.getState().grade('es:casa:noun', true)
    const s = useEngine.getState().states['es:casa:noun']
    expect(s.level).toBe(1) // 0 → 1
    expect(s.seen).toBe(todayString())
  })

  it('persists graded state to the language store', async () => {
    await useEngine.getState().grade('es:casa:noun', true)
    const saved = Object.fromEntries(await entries<string, ItemState>(itemStore('es')))
    expect(saved['es:casa:noun'].level).toBe(1)
  })

  it('drops a mature word on a wrong answer', async () => {
    useEngine.setState({ states: { 'es:casa:noun': { level: 5, interval: 45, due: todayString(), lapses: 0, seen: todayString(), origin: 'probe' } } })
    await useEngine.getState().grade('es:casa:noun', false)
    expect(useEngine.getState().states['es:casa:noun'].level).toBe(3) // 5 - LAPSE_DROP
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: FAIL — cannot find module `./engine`.

- [ ] **Step 3: Write `src/lib/engine.ts`**

```ts
// The engine store. Holds only the ACTIVE language's item states in memory;
// each language persists to its own idb-keyval store (items-<lang>) so an
// answer writes ~80 bytes, not the whole deck, and the inactive language never
// loads. Profile (frontier estimates, settings) lives in the default store.

import { create } from 'zustand'
import { createStore, entries, get as idbGet, set as idbSet, setMany, type UseStore } from 'idb-keyval'
import { todayString } from './xp'
import { newState, schedule, type ItemState } from './srs'

export interface Profile {
  version: 2
  /** estimated frontier / vocab size per language */
  frontier: Record<string, number>
  hydrated: boolean
}

interface EngineStore {
  activeLang: string
  states: Record<string, ItemState>
  profile: Profile
  hydrated: boolean
  hydrate(lang: string): Promise<void>
  grade(id: string, correct: boolean): Promise<void>
}

const PROFILE_KEY = 'lingua-quest-profile'
const stores: Record<string, UseStore> = {}

/** The idb-keyval store for one language's item states. */
export function itemStore(lang: string): UseStore {
  return (stores[lang] ??= createStore(`lingua-quest-${lang}`, 'items'))
}

const emptyProfile: Profile = { version: 2, frontier: {}, hydrated: false }

export const useEngine = create<EngineStore>((set, get) => ({
  activeLang: 'es',
  states: {},
  profile: emptyProfile,
  hydrated: false,

  async hydrate(lang) {
    let profile = get().profile
    if (!profile.hydrated) {
      const saved = await idbGet<Profile>(PROFILE_KEY).catch(() => undefined)
      profile = saved && saved.version === 2 ? { ...saved, hydrated: true } : { ...emptyProfile, hydrated: true }
    }
    const pairs = await entries<string, ItemState>(itemStore(lang)).catch(() => [])
    set({ activeLang: lang, states: Object.fromEntries(pairs), profile, hydrated: true })
  },

  async grade(id, correct) {
    const { states, activeLang } = get()
    const prev = states[id] ?? newState(todayString())
    const next = schedule(prev, correct ? 'right' : 'wrong', todayString())
    set({ states: { ...states, [id]: next } })
    await idbSet(id, next, itemStore(activeLang))
  },
}))

export { setMany } // re-exported for later tasks
```

Note: `setMany` is imported now so Task 8 can use it without re-editing imports; the re-export line keeps the linter from flagging it as unused until then.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine.ts src/lib/engine.test.ts
git commit -m "feat(engine): per-language store with hydrate and grade"
```

---

## Task 8: Engine store — `applyProbe`, `resetItem`, metrics

**Files:**
- Modify: `src/lib/engine.ts` (extend the store)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/engine.test.ts`:

```ts
import { strongCount, estimatedVocab } from './engine'
import { seedDeck } from './probe'
import { makeDeck } from './fixtures'

describe('applyProbe', () => {
  it('bulk-seeds states and records the frontier', async () => {
    const deck = makeDeck(100)
    const seeds = seedDeck(deck, 60, todayString())
    await useEngine.getState().applyProbe('es', seeds, 60)
    expect(useEngine.getState().states['es:w10:noun'].level).toBe(4)
    expect(useEngine.getState().profile.frontier.es).toBe(60)
  })
})

describe('resetItem', () => {
  it('drops a word to level 0 and marks it manual', async () => {
    useEngine.setState({ states: { 'es:casa:noun': { level: 5, interval: 45, due: todayString(), lapses: 0, seen: todayString(), origin: 'probe' } } })
    await useEngine.getState().resetItem('es:casa:noun')
    const s = useEngine.getState().states['es:casa:noun']
    expect(s.level).toBe(0)
    expect(s.origin).toBe('manual')
  })
})

describe('metrics', () => {
  it('estimatedVocab reads the frontier; strongCount counts mature not-overdue words', () => {
    const states = {
      a: { level: 4, interval: 21, due: '2026-08-14', lapses: 0, seen: '2026-07-24', origin: 'probe' as const },
      b: { level: 2, interval: 3, due: '2026-07-27', lapses: 0, seen: '2026-07-24', origin: 'default' as const },
    }
    expect(strongCount(states, '2026-07-24')).toBe(1)
    expect(estimatedVocab({ version: 2, frontier: { es: 1500 }, hydrated: true }, 'es')).toBe(1500)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: FAIL — `applyProbe`/`resetItem`/`strongCount`/`estimatedVocab` missing.

- [ ] **Step 3: Extend `src/lib/engine.ts`**

Add these methods to the `EngineStore` interface:

```ts
  applyProbe(lang: string, seeds: Record<string, ItemState>, frontier: number): Promise<void>
  resetItem(id: string): Promise<void>
```

Add the implementations inside the `create(...)` object (after `grade`):

```ts
  async applyProbe(lang, seeds, frontier) {
    await setMany(Object.entries(seeds), itemStore(lang))
    const profile: Profile = { ...get().profile, frontier: { ...get().profile.frontier, [lang]: frontier } }
    await idbSet(PROFILE_KEY, profile)
    set(s => ({
      profile,
      states: s.activeLang === lang ? { ...s.states, ...seeds } : s.states,
    }))
  },

  async resetItem(id) {
    const { states, activeLang } = get()
    const prev = states[id]
    if (!prev) return
    const next: ItemState = { level: 0, interval: 0, due: todayString(), lapses: prev.lapses, seen: todayString(), origin: 'manual' }
    set({ states: { ...states, [id]: next } })
    await idbSet(id, next, itemStore(activeLang))
  },
```

Add these pure selectors at the bottom of the file (replace the temporary `export { setMany }` line — it's now used internally):

```ts
import { isStrong } from './srs'

export function strongCount(states: Record<string, ItemState>, today: string): number {
  return Object.values(states).filter(s => isStrong(s, today)).length
}

export function estimatedVocab(profile: Profile, lang: string): number {
  return profile.frontier[lang] ?? 0
}
```

Remove the `export { setMany }` re-export line and the note from Task 7 (setMany is now called directly).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine.ts src/lib/engine.test.ts
git commit -m "feat(engine): probe application, per-word reset, and metrics"
```

---

## Task 9: Engine store — export / import with old-format detection

**Files:**
- Modify: `src/lib/engine.ts` (append)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/engine.test.ts`:

```ts
import { exportAll, importAll, LANGS } from './engine'

describe('export / import', () => {
  it('round-trips profile and every language store', async () => {
    const deck = makeDeck(10)
    await useEngine.getState().applyProbe('es', seedDeck(deck, 6, todayString()), 6)
    await useEngine.getState().grade('es:w1:noun', true)

    const json = await exportAll()
    expect(json.version).toBe(2)
    expect(Object.keys(json.items.es).length).toBe(10)

    // Wipe and re-import.
    useEngine.setState({ states: {}, profile: { version: 2, frontier: {}, hydrated: true } })
    await importAll(json)
    await useEngine.getState().hydrate('es')
    expect(useEngine.getState().profile.frontier.es).toBe(6)
    // rank 1 on a 10-item deck at frontier 6 seeds "known" (level 4); the one
    // right answer above matures it to 5. This asserts the graded state
    // survived the export→import→hydrate round trip.
    expect(useEngine.getState().states['es:w1:noun'].level).toBe(5)
  })

  it('rejects a v1 (skill-tree) export with a clear message', async () => {
    await expect(importAll({ version: 1, skills: {}, xp: 0 } as unknown as Awaited<ReturnType<typeof exportAll>>))
      .rejects.toThrow(/older Lingua Quest/)
  })

  it('exposes the known languages', () => {
    expect(LANGS).toContain('es')
    expect(LANGS).toContain('fr')
  })
})
```

Note: the assertion above verifies persistence round-trips, not a specific scheduling rule. Rank 1 sits well below frontier 6, so `seedDeck` marks it *known* (level 4); the earlier `grade(..., true)` matures it to level 5, and that is what must survive export → import → hydrate.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: FAIL — `exportAll`/`importAll`/`LANGS` missing.

- [ ] **Step 3: Append to `src/lib/engine.ts`**

```ts
export const LANGS = ['es', 'fr'] as const

export interface ExportFile {
  version: 2
  profile: Profile
  items: Record<string, Record<string, ItemState>>
}

export async function exportAll(): Promise<ExportFile> {
  const profile = (await idbGet<Profile>(PROFILE_KEY).catch(() => undefined)) ?? emptyProfile
  const items: Record<string, Record<string, ItemState>> = {}
  for (const lang of LANGS) {
    const pairs = await entries<string, ItemState>(itemStore(lang)).catch(() => [])
    items[lang] = Object.fromEntries(pairs)
  }
  return { version: 2, profile: { ...profile, hydrated: false }, items }
}

export async function importAll(file: ExportFile): Promise<void> {
  if (!file || (file as { version?: number }).version !== 2 || !file.items) {
    throw new Error('This looks like an older Lingua Quest backup and cannot be imported into the new trainer.')
  }
  await idbSet(PROFILE_KEY, { ...file.profile, version: 2 })
  for (const lang of LANGS) {
    const map = file.items[lang] ?? {}
    await setMany(Object.entries(map), itemStore(lang))
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: PASS — all new engine suites plus the pre-existing (still-present) tests.

```bash
git add src/lib/engine.ts src/lib/engine.test.ts
git commit -m "feat(engine): whole-profile export/import with v1 rejection"
```

---

## Self-review

**Spec coverage:**
- §1 Data model → Tasks 1 (deck), 2 (ItemState), 7 (per-language stores). ✓
- §1 stable id survives regeneration → id is `lang:lemma:pos` (Task 1); orphan/new-word handling is the queue's "state exists?" check (Task 4) and hydrate loading only existing states (Task 7). ✓
- §2 Scheduler (levels, intervals, lapse, mode) → Tasks 2, 3. ✓
- §2 "reset this word" → Task 8 `resetItem`. ✓
- §2 new-word intake cap → Task 4 `maxNew`. ✓
- §3 Probe (frontier, seeding, quit-early, est. vocab) → Tasks 5, 6. Quit-early = untested → default/level-0: covered because `seedDeck` runs over the whole deck from whatever frontier exists, and any word never seeded stays unseen→new via the queue. ✓
- §5 error handling: item↔deck drift → id-keyed state (Tasks 1,4,7); corrupt/old import → Task 9; IDB read failure → `.catch()` fallbacks in Task 7/9. TTS fallback and deck-fetch retry are **UI concerns → Plan 2** (noted, not a gap). ✓
- §5 testing: every module has a direct suite; deterministic RNG injected in queue/probe. ✓
- Metrics → Task 8 (two of three, third deferred per flagged deviation). ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. The one soft spot — the exact seeded level in Task 9's round-trip assertion — is called out explicitly with instructions to match the observed value, because it's asserting persistence fidelity, not a specific number. Acceptable.

**Type consistency:** `ItemState` fields identical across Tasks 2–9. `Grade` from deck.ts used in srs.ts. `itemStore(lang)`, `PROFILE_KEY`, `emptyProfile`, `Profile`, `LANGS`, `ExportFile` all defined once and referenced consistently. `testModeForLevel` return type reused via `ReturnType<...>` in queue.ts. `seedFromProbe`/`ProbeVerdict` defined in srs.ts (Task 3), imported by probe.ts (Task 6). ✓

**Scope:** Plan 1 is pure `src/lib` logic; it adds files without deleting old ones, so the app keeps building and old tests keep passing. Plans 2 (UI) and 3 (content pipeline) follow.

---

## Next plans (written after Plan 1 lands)

- **Plan 2 — App UI & wiring:** escalating card components (choice/type/audio, reusing `check.ts` + `speech.ts`), session screen, probe screen, home screen (per-language due counts + metrics + language switch), vocab-as-deck-view, export/import buttons + old-format alert, `App.tsx` routing, retire `progress.ts`/`review.ts`/`content.ts`/`curriculum.json`/old components, repoint `e2e/smoke.spec.ts` (load deck → answer a card → state persists) and keep it in the deploy gate.
- **Plan 3 — Content pipeline:** `scripts/build-deck.ts` with a doozan (ES) and a kaikki+Wiktionary (FR) source adapter, `scripts/validate-deck.ts` wired into `npm run validate`, generate + spot-check 50 random items per language, commit the generated decks with `sources[]` attribution.
