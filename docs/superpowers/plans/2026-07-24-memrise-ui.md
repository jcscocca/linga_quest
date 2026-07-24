# Memrise UI & Wiring — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For component construction, implementers should also load **frontend-design:frontend-design** for the quality bar.

**Goal:** Turn the finished engine (`src/lib/`) into a usable app: a probe flow, a study session with maturity-escalating cards, a metrics home screen, and a vocabulary browser — replacing the retired Duolingo skill-tree UI.

**Architecture:** New screens under `src/components/` drive the engine store (`useEngine`) and pure helpers. A small `cards.ts` adds the two bits of card logic the engine didn't need (multiple-choice distractors, per-mode grading via the reused `check.ts`). `App.tsx` becomes a thin router over `home | probe | session | vocab`, hydrating the engine and loading the active language's deck on mount. A hand-written placeholder `deck.json` (~24 words) ships so the app runs and e2e passes; Plan 3 replaces it with the generated 3,000-word decks. All the retired curriculum/skill/XP code is deleted in one task at the end.

**Tech Stack:** React 19, Zustand (via `useEngine`), the existing CSS design system in `src/styles.css`, Vitest + Playwright. Reuses `check.ts`, `speech.ts`, and the engine modules from Plan 1.

**Companion spec:** `docs/superpowers/specs/2026-07-24-memrise-redesign-design.md`
**Depends on:** Plan 1 (engine) — complete.

### Granularity note

Pure logic (distractors, grading, session/probe orchestration state, deck validation, routing) is specified with complete code and unit tests, TDD. Pure-presentational component markup is specified structurally — the exact CSS classes to reuse, the elements, the wiring, and explicit **acceptance criteria + a browser/e2e verification step** — rather than pinning every line, because visual detail is iterated in the browser and guided by the frontend-design skill. This matches the project's existing testing shape (unit + Playwright smoke, no component-snapshot tests).

### UI approach (flag for reviewer)

Match-and-refine the existing warm design system (`--bg` cream, `--primary` green, `--accent` amber, `.card`/`.feedback`/`.text-answer`, `SpeakButton`), rather than a from-scratch visual redesign. It's already clean, it fits a focused tool, and it maximizes reuse. If you want the new trainer to look deliberately distinct from the retired Duolingo look, say so — that becomes a larger styling task.

---

## File structure (Plan 2)

**Create:**
- `public/content/es/deck.json` — placeholder ~24-word Spanish deck (Plan 3 replaces)
- `src/lib/cards.ts` — `choiceOptions()`, `distractors()`, `gradeCard()`
- `src/lib/cards.test.ts`
- `src/components/DeckCard.tsx` — one card in choice/type/audio mode
- `src/components/SessionScreen.tsx` — runs a study session
- `src/components/ProbeScreen.tsx` — runs the triage probe
- `src/components/Home.tsx` — metrics + actions (replaces old `HomeScreen`)
- `src/components/Collection.tsx` — deck/vocabulary browser (replaces old `VocabScreen`)
- `scripts/validate-deck.ts` — minimal deck gate (Plan 3 extends)

**Modify:**
- `src/App.tsx` — router + engine hydrate + deck load (full rewrite)
- `src/components/exercises/inputs.tsx` — keep `SpeakButton` only; move it or re-export (see Task 3)
- `package.json` — `validate` script → `tsx scripts/validate-deck.ts`
- `e2e/smoke.spec.ts` — repoint to the new flow
- `src/styles.css` — additive classes for new screens (append only)

**Delete (Task 9, all at once):**
- `src/components/HomeScreen.tsx`, `LessonScreen.tsx`, `ReviewScreen.tsx`, `VocabScreen.tsx`
- `src/components/exercises/ExerciseCard.tsx`
- `src/lib/content.ts`, `progress.ts`, `review.ts` (+ their `.test.ts`)
- `public/content/courses.json`, `public/content/es/curriculum.json`, `public/content/es/skills/`
- `scripts/validate-content.ts`

**Reused unchanged:** `src/lib/check.ts`, `speech.ts`, `xp.ts`, and all Plan 1 engine modules (`deck.ts`, `srs.ts`, `queue.ts`, `probe.ts`, `engine.ts`).

Run one suite: `npx vitest run src/lib/cards.test.ts`. Full check: `npm test && npx tsc --noEmit`.

---

## Task 1: Placeholder deck + deck validation gate

Ships a real (small) deck so the app runs, and replaces the now-obsolete `validate-content.ts` so `npm run validate` and the deploy gate keep working.

**Files:**
- Create: `public/content/es/deck.json`
- Create: `scripts/validate-deck.ts`
- Modify: `package.json`

- [ ] **Step 1: Write `public/content/es/deck.json`** (24 common words, dense ranks 1..24, valid per the `Deck` schema)

```json
{
  "lang": "es",
  "generated": "2026-07-24",
  "sources": [{ "name": "Placeholder (hand-written)", "url": "https://github.com/jcscocca/lingua_quest", "license": "CC BY-SA 3.0" }],
  "items": [
    { "id": "es:el:art", "lemma": "el", "pos": "art", "gloss": ["the"], "rank": 1 },
    { "id": "es:de:prep", "lemma": "de", "pos": "prep", "gloss": ["of", "from"], "rank": 2 },
    { "id": "es:que:conj", "lemma": "que", "pos": "conj", "gloss": ["that", "which"], "rank": 3 },
    { "id": "es:y:conj", "lemma": "y", "pos": "conj", "gloss": ["and"], "rank": 4 },
    { "id": "es:ser:verb", "lemma": "ser", "pos": "verb", "gloss": ["to be"], "rank": 5, "ex": { "t": "Quiero ser médico.", "en": "I want to be a doctor." } },
    { "id": "es:casa:noun", "lemma": "casa", "pos": "noun", "gloss": ["house", "home"], "rank": 6, "ex": { "t": "La casa es grande.", "en": "The house is big." } },
    { "id": "es:tiempo:noun", "lemma": "tiempo", "pos": "noun", "gloss": ["time", "weather"], "rank": 7 },
    { "id": "es:hacer:verb", "lemma": "hacer", "pos": "verb", "gloss": ["to do", "to make"], "rank": 8 },
    { "id": "es:año:noun", "lemma": "año", "pos": "noun", "gloss": ["year"], "rank": 9 },
    { "id": "es:día:noun", "lemma": "día", "pos": "noun", "gloss": ["day"], "rank": 10 },
    { "id": "es:vida:noun", "lemma": "vida", "pos": "noun", "gloss": ["life"], "rank": 11 },
    { "id": "es:mundo:noun", "lemma": "mundo", "pos": "noun", "gloss": ["world"], "rank": 12 },
    { "id": "es:mano:noun", "lemma": "mano", "pos": "noun", "gloss": ["hand"], "rank": 13 },
    { "id": "es:agua:noun", "lemma": "agua", "pos": "noun", "gloss": ["water"], "rank": 14 },
    { "id": "es:comer:verb", "lemma": "comer", "pos": "verb", "gloss": ["to eat"], "rank": 15 },
    { "id": "es:grande:adj", "lemma": "grande", "pos": "adj", "gloss": ["big", "large"], "rank": 16 },
    { "id": "es:pequeño:adj", "lemma": "pequeño", "pos": "adj", "gloss": ["small"], "rank": 17 },
    { "id": "es:mujer:noun", "lemma": "mujer", "pos": "noun", "gloss": ["woman"], "rank": 18 },
    { "id": "es:hombre:noun", "lemma": "hombre", "pos": "noun", "gloss": ["man"], "rank": 19 },
    { "id": "es:libro:noun", "lemma": "libro", "pos": "noun", "gloss": ["book"], "rank": 20 },
    { "id": "es:ciudad:noun", "lemma": "ciudad", "pos": "noun", "gloss": ["city"], "rank": 21 },
    { "id": "es:trabajar:verb", "lemma": "trabajar", "pos": "verb", "gloss": ["to work"], "rank": 22 },
    { "id": "es:hablar:verb", "lemma": "hablar", "pos": "verb", "gloss": ["to speak", "to talk"], "rank": 23 },
    { "id": "es:noche:noun", "lemma": "noche", "pos": "noun", "gloss": ["night"], "rank": 24 }
  ]
}
```

- [ ] **Step 2: Write `scripts/validate-deck.ts`** — structural + self-consistency gate (keeps the CI/deploy gate meaningful; Plan 3 extends it)

```ts
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

    const ids = new Set<string>()
    deck.items.forEach((it, i) => {
      const w = `${lang}#${it.id ?? i}`
      if (!it.id) add(w, 'item missing id')
      if (ids.has(it.id)) add(w, 'duplicate id')
      ids.add(it.id)
      if (it.id !== `${lang}:${it.lemma}:${it.pos}`) add(w, `id must equal lang:lemma:pos`)
      if (!it.lemma) add(w, 'missing lemma')
      if (!Array.isArray(it.gloss) || it.gloss.length === 0 || !it.gloss[0]) add(w, 'gloss must be a non-empty list')
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
```

- [ ] **Step 3: Point `validate` at the new gate** — in `package.json` change the script:
```json
    "validate": "tsx scripts/validate-deck.ts",
```

- [ ] **Step 4: Run it** — `npm run validate` → expect `✓ decks valid …`. Fix any real issue the gate reports in `deck.json` (e.g. a non-dense rank).

- [ ] **Step 5: Commit**
```bash
git add public/content/es/deck.json scripts/validate-deck.ts package.json
git commit -m "feat(ui): placeholder es deck and deck-validation gate"
```

---

## Task 2: Card logic — distractors and grading

The two card behaviors the engine didn't need. Pure, TDD.

**Files:** Create `src/lib/cards.ts`, Test `src/lib/cards.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/cards.test.ts`**

```ts
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
```

- [ ] **Step 2: Run `npx vitest run src/lib/cards.test.ts`** — expect FAIL (no module).

- [ ] **Step 3: Write `src/lib/cards.ts`**

```ts
// Card behaviour the engine didn't need: multiple-choice option generation and
// per-mode grading. Grading reuses check.ts so the deck gate and the runtime
// judge answers identically.

import type { Deck, DeckItem } from './deck'
import { checkText, normalize, type CheckResult } from './check'
import type { TestMode } from './srs'

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** n wrong glosses, preferring words of similar frequency (plausible confusables). */
export function distractors(deck: Deck, item: DeckItem, n: number, rng: () => number = Math.random): string[] {
  const answer = normalize(item.gloss[0])
  const nearby = deck.items
    .filter(o => o.id !== item.id && normalize(o.gloss[0]) !== answer)
    .sort((a, b) => Math.abs(a.rank - item.rank) - Math.abs(b.rank - item.rank))
    .slice(0, Math.max(n * 5, 15))
  const picked: string[] = []
  for (const o of shuffle(nearby, rng)) {
    if (picked.length >= n) break
    if (!picked.some(p => normalize(p) === normalize(o.gloss[0]))) picked.push(o.gloss[0])
  }
  return picked
}

/** The correct gloss plus 3 distractors, shuffled. */
export function choiceOptions(deck: Deck, item: DeckItem, rng: () => number = Math.random): string[] {
  return shuffle([item.gloss[0], ...distractors(deck, item, 3, rng)], rng)
}

/** Judge an answer for a card in a given mode. choice = pick the English gloss;
 *  type/audio = produce the Spanish lemma (accent-lenient via check.ts). */
export function gradeCard(item: DeckItem, mode: TestMode, given: string): CheckResult {
  if (mode === 'choice') return { correct: normalize(given) === normalize(item.gloss[0]) }
  return checkText(given, [item.lemma])
}
```

- [ ] **Step 4: Run `npx vitest run src/lib/cards.test.ts`** — expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/cards.ts src/lib/cards.test.ts
git commit -m "feat(ui): card distractors and per-mode grading"
```

---

## Task 3: `DeckCard` component

One card, three modes, reusing the existing `.card`/`.choices`/`.text-answer`/`.feedback` CSS and `SpeakButton`.

**Files:**
- Create: `src/components/DeckCard.tsx`
- Modify: `src/components/exercises/inputs.tsx` (nothing to change yet — `SpeakButton` stays exported here and is imported by `DeckCard`; it is the one widget that survives Task 9's deletion, so leave `inputs.tsx` in place until Task 9 relocates `SpeakButton`).

**Behavior / acceptance criteria:**
- Props: `{ deck, item, mode, voice, onGraded }` where `onGraded(correct: boolean) => void`.
- **choice** mode: prompt shows the Spanish `item.lemma` (with a `SpeakButton`), renders `choiceOptions(deck, item)` as `.choice` buttons; the learner picks; Check grades via `gradeCard(item, 'choice', chosen)`.
- **type** mode: prompt shows the English `item.gloss.join(', ')`; a `.text-answer` input (Spanish); Enter or Check grades via `gradeCard(item, 'type', text)`.
- **audio** mode: on mount `speak(item.lemma, voice)`; a Play button; a `.text-answer` input; grades via `gradeCard(item, 'audio', text)`. If `!speechSupported()`, reveal the lemma text and behave like `type` (TTS-unavailable fallback from the spec).
- After grading: show `.feedback correct`/`.feedback wrong` with the answer revealed (lemma + gloss + example sentence if present + `SpeakButton`), and a Continue button that calls `onGraded` then advances. A wrong answer still reveals the answer and continues (SRS handles the lapse; no retry loop).
- Options are memoized per `item.id` so they don't reshuffle on re-render.

- [ ] **Step 1: Write `src/components/DeckCard.tsx`** implementing the above. Reference structure (fill in the JSX using the existing classes; this compiles and is the contract):

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Deck, DeckItem } from '../lib/deck'
import type { TestMode } from '../lib/srs'
import { choiceOptions, gradeCard } from '../lib/cards'
import { speak, speechSupported } from '../lib/speech'
import { SpeakButton } from './exercises/inputs'

export function DeckCard({ deck, item, mode, voice, onGraded }: {
  deck: Deck
  item: DeckItem
  mode: TestMode
  voice: string
  onGraded: (correct: boolean) => void
}) {
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [result, setResult] = useState<{ correct: boolean; note?: string } | null>(null)
  const options = useMemo(() => (mode === 'choice' ? choiceOptions(deck, item) : []), [deck, item.id, mode])
  const audioBroken = mode === 'audio' && !speechSupported()

  useEffect(() => {
    if (mode === 'audio' && speechSupported()) speak(item.lemma, voice)
  }, [item.id, mode, voice])

  function submit() {
    if (result) return
    const given = mode === 'choice' ? chosen ?? '' : text
    if (!given.trim()) return
    setResult(gradeCard(item, mode, given))
  }

  // ...render prompt per mode, inputs using .choices/.choice/.text-answer,
  // a .submit button, then a .feedback block revealing lemma + gloss + ex +
  // SpeakButton and a .continue button that calls onGraded(result.correct).
  // For audioBroken, render the lemma text visibly and treat as type mode.
  return null // replace with the JSX described above
}
```

- [ ] **Step 2: Verify by rendering** — this is exercised end-to-end by the e2e test in Task 10 and the browser check there. To sanity-check now, temporarily mount `DeckCard` in `App.tsx` (or rely on Task 4's SessionScreen). Do not add a snapshot test; the project has none. Ensure `npx tsc --noEmit` is clean.

- [ ] **Step 3: Commit**
```bash
git add src/components/DeckCard.tsx
git commit -m "feat(ui): DeckCard — choice/type/audio with escalation and TTS fallback"
```

---

## Task 4: `SessionScreen`

Runs one study session: builds the queue, plays cards, records each grade, shows a summary.

**Files:** Create `src/components/SessionScreen.tsx`.

**Behavior / acceptance criteria:**
- Props: `{ deck, voice, onDone }`.
- On mount, compute `assembleSession(deck, useEngine.getState().states, todayString(), {})` once (memoize; don't reshuffle mid-session).
- Render the current `SessionCard` with `<DeckCard deck item mode voice onGraded={handle} />`.
- `handle(correct)`: `await useEngine.getState().grade(item.id, correct)`, push the result, advance the index.
- Header shows progress (`i+1 / total`) using the existing `.progress-bar`/`.progress-fill` classes and a Back button (`.back`) that calls `onDone`.
- When the index passes the end, show a summary card (`.completion-card`): "n / total correct", the honest line (no XP), and a "Done" button → `onDone`.
- If the assembled session is empty (nothing due, no new): show a friendly empty state ("Nothing due right now — come back later, or run the probe") with a Done button.

- [ ] **Step 1: Write `src/components/SessionScreen.tsx`** per the contract:

```tsx
import { useMemo, useState } from 'react'
import type { Deck } from '../lib/deck'
import { useEngine } from '../lib/engine'
import { assembleSession } from '../lib/queue'
import { todayString } from '../lib/xp'
import { DeckCard } from './DeckCard'

export function SessionScreen({ deck, voice, onDone }: { deck: Deck; voice: string; onDone: () => void }) {
  const states = useEngine(s => s.states)
  const queue = useMemo(() => assembleSession(deck, states, todayString(), {}), [deck])
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  // ...render: empty state, or DeckCard for queue[i] with a progress header, or
  // the summary once i >= queue.length. handle(c) => { if (c) setCorrect(n=>n+1);
  // void useEngine.getState().grade(queue[i].item.id, c); setI(n => n+1) }
  return null // replace with JSX per the contract above
}
```

- [ ] **Step 2: `npx tsc --noEmit`** clean. (Full behavior verified in Task 10.)

- [ ] **Step 3: Commit**
```bash
git add src/components/SessionScreen.tsx
git commit -m "feat(ui): SessionScreen — queue, cards, grade, summary"
```

---

## Task 5: `ProbeScreen`

Runs the triage probe: show a Spanish word, learner types its English meaning, ~150 words, then seed the deck and show the estimate.

**Files:** Create `src/components/ProbeScreen.tsx`.

**Behavior / acceptance criteria:**
- Props: `{ deck, lang, voice, onDone }`.
- State machine via the probe controller: `startProbe(deck.items.length, { bands: 15, perBand: 10 })`, then per step `probePick(state, deck)` → show `item.lemma` (+ optional `SpeakButton`) and a `.text-answer` input for the **English meaning**; on submit, `knew = checkText(typed, item.gloss).correct`; `state = probeRecord(state, knew)`. Also a "Don't know" button → `probeRecord(state, false)`.
- Progress: `state.cursor / state.queue.length` via `.progress-bar`.
- A "Finish early" button: stop now (untested words simply never get seeded → they stay in the new-word pool).
- On `state.done` (or finish early): `const frontier = probeFrontier(state)`, `const seeds = seedDeck(deck, frontier, todayString())`, `await useEngine.getState().applyProbe(lang, seeds, frontier)`, then show a results card: **estimated vocabulary ≈ `estimateVocab(frontier)` words**, how many the probe will treat as known vs new, and a Done button → `onDone`.
- Deck too small for a full sweep (placeholder deck has 24 words): the probe still works — bands collapse, `probePick` clamps by rank. Keep going; it just tests most words.

- [ ] **Step 1: Write `src/components/ProbeScreen.tsx`** per the contract, importing `startProbe, probePick, probeRecord, probeFrontier, seedDeck, estimateVocab` from `../lib/probe`, `checkText` from `../lib/check`, `useEngine` from `../lib/engine`, `todayString` from `../lib/xp`.

```tsx
// structure only — implement the state machine described above
import { useMemo, useState } from 'react'
import type { Deck } from '../lib/deck'
import { estimateVocab, probeFrontier, probePick, probeRecord, seedDeck, startProbe, type ProbeState } from '../lib/probe'
import { checkText } from '../lib/check'
import { useEngine } from '../lib/engine'
import { todayString } from '../lib/xp'
// ...component: hold ProbeState in useState, render current word + input, advance
// on submit/"don't know", finalize on done/finish-early, show the estimate.
```

- [ ] **Step 2: `npx tsc --noEmit`** clean. (Verified in Task 10.)

- [ ] **Step 3: Commit**
```bash
git add src/components/ProbeScreen.tsx
git commit -m "feat(ui): ProbeScreen — frequency probe to estimate and seed"
```

---

## Task 6: `Home` screen

Replaces the skill tree with honest metrics and the two actions.

**Files:** Create `src/components/Home.tsx`.

**Behavior / acceptance criteria:**
- Props: `{ deck, lang, langs, voice, onStartSession, onStartProbe, onOpenCollection, onSwitchLang }`.
- Header (`.topbar`): title "🗺️ Lingua Quest" + a language selector over `LANGS` (Spanish/French) that calls `onSwitchLang`.
- **Metrics row** (reuse `.stats`): estimated vocabulary size = `estimatedVocab(profile, lang)`; words at strong retention = `strongCount(states, today)`; due today = `assembleSession(deck, states, today, {}).length` (or a lighter due count). Show these as labeled figures. No streak, no XP.
- **Primary actions:** "Start session — N due" (calls `onStartSession`; if N is 0 and there are new words, label "Learn new words"); "Run the probe" (or "Re-run the probe" if `profile.frontier[lang]` exists) → `onStartProbe`. If the language has never been probed, surface the probe prominently ("Estimate what you already know").
- Export / Import buttons: Export downloads `JSON.stringify(await exportAll(), null, 2)` as `lingua-quest-backup.json`; Import reads a file → `await importAll(parsed)` in a try/catch, `alert` on the old-format / malformed messages, then re-`hydrate` the active language.
- A link/button to the collection (`onOpenCollection`) and a small "About the data" note listing `deck.sources` (attribution).

- [ ] **Step 1: Write `src/components/Home.tsx`** per the contract, importing `estimatedVocab, strongCount, exportAll, importAll, LANGS, useEngine` from `../lib/engine`, `assembleSession` from `../lib/queue`, `todayString` from `../lib/xp`. Reuse the export/import download pattern from the retired `HomeScreen` (Blob + anchor click).

- [ ] **Step 2: `npx tsc --noEmit`** clean.

- [ ] **Step 3: Commit**
```bash
git add src/components/Home.tsx
git commit -m "feat(ui): Home — honest metrics, probe/session actions, backup"
```

---

## Task 7: `Collection` (vocabulary browser)

The vocabulary collection is now a **view over the deck** (the fix for "collect words but never schedule them"): browse/search every deck word and see its state.

**Files:** Create `src/components/Collection.tsx`.

**Behavior / acceptance criteria:**
- Props: `{ deck, voice, onBack }`.
- Reuse the old `VocabScreen` search pattern (`.collection`, `.vocab-search`, `.text-answer`, a grid). List `deck.items` filtered by a query over lemma/gloss.
- Each row: lemma + `SpeakButton`, gloss, pos, and its **status** from `useEngine().states[item.id]`: unseeded → "new"; else a level pip (`●`×level `○`×(5−level)) and "due <date>". This makes the deck double as the collection.
- A per-word **"Reset"** action calling `useEngine.getState().resetItem(item.id)` (the escape hatch for an over-optimistic probe).
- Count in the header: "N words · M known" (M = states with level ≥ 4).

- [ ] **Step 1: Write `src/components/Collection.tsx`** per the contract.

- [ ] **Step 2: `npx tsc --noEmit`** clean.

- [ ] **Step 3: Commit**
```bash
git add src/components/Collection.tsx
git commit -m "feat(ui): Collection — deck browser with per-word SRS status"
```

---

## Task 8: `App.tsx` — router + hydrate + deck load

**Files:** Modify `src/App.tsx` (full rewrite).

**Behavior / acceptance criteria:**
- On mount: `await useEngine.getState().hydrate('es')` (default language).
- Load the active language's deck: `loadDeck(import.meta.env.BASE_URL, lang)` into state; show the existing `.loading` / `.load-error` (+ Retry) states around it (reuse the fetch-error pattern).
- View state: `'home' | 'probe' | 'session' | 'collection'`. Render the matching screen, passing `deck`, `lang`, `voice` (`lang === 'es' ? 'es-ES' : 'fr-FR'`), and the navigation callbacks.
- Switching language: set `lang`, re-`hydrate(lang)`, re-`loadDeck(lang)`, return to home. (French has no deck until Plan 3 — a failed `loadDeck` shows the load-error state, which is correct and expected until then.)

- [ ] **Step 1: Rewrite `src/App.tsx`** per the contract. Keep it thin — routing + hydrate + deck fetch only; all logic lives in the screens/engine.

- [ ] **Step 2: `npx tsc --noEmit`** clean; `npm run dev` and confirm the app loads to Home without console errors (quick manual check; full flow in Task 10).

- [ ] **Step 3: Commit**
```bash
git add src/App.tsx
git commit -m "feat(ui): App router with engine hydrate and deck loading"
```

---

## Task 9: Retire the Duolingo-era code

Delete everything the pivot supersedes, in one commit, then confirm nothing references it.

**Files:** delete the list under "Delete" in the file-structure section. Relocate `SpeakButton`.

- [ ] **Step 1: Move `SpeakButton`** out of the doomed `exercises/inputs.tsx` into a small `src/components/SpeakButton.tsx` (cut the component + its imports verbatim), and update the imports in `DeckCard.tsx`, `Collection.tsx`, `ProbeScreen.tsx`, `Home.tsx` to `from './SpeakButton'` (or `'../components/SpeakButton'` as appropriate).

- [ ] **Step 2: Delete** the retired files:
```bash
git rm src/components/HomeScreen.tsx src/components/LessonScreen.tsx src/components/ReviewScreen.tsx src/components/VocabScreen.tsx
git rm src/components/exercises/ExerciseCard.tsx src/components/exercises/inputs.tsx
git rm src/lib/content.ts src/lib/content.test.ts src/lib/progress.ts src/lib/progress.test.ts src/lib/review.ts src/lib/review.test.ts
git rm scripts/validate-content.ts
git rm public/content/courses.json public/content/es/curriculum.json
git rm -r public/content/es/skills
```

- [ ] **Step 3: Fix fallout** — `npx tsc --noEmit` will list every dangling import. Resolve each (they should only be the deleted screens, now unreferenced since Task 8 rewired `App.tsx`). `src/lib/xp.ts`, `check.ts`, `speech.ts`, `deck.ts`, `srs.ts`, `queue.ts`, `probe.ts`, `engine.ts`, `cards.ts` all stay.

- [ ] **Step 4: Full check** — `npm test` (engine + cards suites green; the deleted `content/progress/review` suites are gone), `npx tsc --noEmit` clean, `npm run validate` green (deck gate), `DEPLOY_BASE=/lingua_quest/ npm run build` succeeds.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "refactor(ui): retire the Duolingo-era skill tree, curriculum, and XP code"
```

---

## Task 10: Repoint e2e; verify the whole flow

**Files:** Modify `e2e/smoke.spec.ts`.

**Behavior / acceptance criteria:** the smoke test loads the app, runs a minimal path, and asserts persistence — and still runs against the built sub-path site so it keeps guarding the deploy.

- [ ] **Step 1: Rewrite `e2e/smoke.spec.ts`** to the new flow:

```ts
import { expect, test } from '@playwright/test'

test('home renders with the deck loaded', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Lingua Quest/ })).toBeVisible()
  // Home shows the probe/session actions once the deck has loaded.
  await expect(page.getByRole('button', { name: /probe/i })).toBeVisible()
})

test('a study session grades a card and persists', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Start session|Learn new words/i }).click()
  // First card is a new word in choice mode — pick any option and continue.
  await expect(page.getByRole('button', { name: /Check/i })).toBeVisible()
  // (Select the first choice, Check, Continue — selectors per the DeckCard markup.)
})
```
Adjust selectors to the actual `DeckCard`/`Home` markup produced in Tasks 3/6. Keep assertions resilient (roles/text, not brittle DOM paths).

- [ ] **Step 2: Run e2e both ways**
  - Dev: `npm run e2e` → expect PASS.
  - Built sub-path: `DEPLOY_BASE=/lingua_quest/ npm run build && DEPLOY_BASE=/lingua_quest/ npm run e2e` → expect PASS (guards the deploy).

- [ ] **Step 3: Browser verification (manual, with the frontend-design eye)** — `npm run dev`, then: Home renders with metrics; Run the probe → answer a few, finish → see an estimate; Start session → grade a card in choice mode, see feedback + continue → summary; open Collection → search, see per-word status, reset a word; Export → Import a backup. Fix visual/UX rough edges here (this is where frontend-design judgment applies). Take a screenshot for the user.

- [ ] **Step 4: Commit**
```bash
git add e2e/smoke.spec.ts
git commit -m "test(ui): repoint smoke test to the probe/session flow"
```

---

## Self-review

**Spec coverage:** escalating cards (choice/type/audio) → Tasks 2,3; session + queue → Task 4; probe UI + seeding + estimate → Task 5; honest metrics home (no streak/XP) → Task 6; vocab-as-deck-view + reset escape hatch → Task 7; per-language switch + export/import + v1-reject alert → Tasks 6,8; TTS-unavailable fallback → Task 3; deck fetch error/retry → Task 8; retire Duolingo code → Task 9; e2e guarding the built sub-path → Task 10. Content pipeline + real decks are **Plan 3** (this ships a 24-word placeholder). ✓

**Placeholder scan:** Logic (Tasks 1,2) is complete code + tests. Component tasks (3–8) are contracts (props, behavior, CSS classes, imports, acceptance criteria) with structural skeletons, not full JSX — deliberate per the granularity note, and each has a tsc/e2e/browser verification. No "TBD"/"handle later".

**Type consistency:** `TestMode` from `srs.ts` used in `cards.ts`/`DeckCard`; `gradeCard`/`choiceOptions` signatures match between `cards.ts` and their consumers; `useEngine` selectors (`states`, `profile`), `assembleSession`, `estimatedVocab`, `strongCount`, `exportAll`/`importAll`, `resetItem`, `loadDeck`, `seedDeck`/`probeFrontier`/`estimateVocab` all match the Plan-1 engine exports. ✓

**Scope:** One coherent UI layer over a frozen engine. Ends with a runnable, deploy-gated app on placeholder content; Plan 3 swaps in real decks.

---

## Next plan

- **Plan 3 — Content pipeline:** `scripts/build-deck.ts` (doozan adapter for ES, kaikki+Wiktionary for FR), extend `validate-deck.ts`, generate + spot-check 50 items/language, commit real `deck.json`s with attribution — replacing the placeholder from Task 1.
