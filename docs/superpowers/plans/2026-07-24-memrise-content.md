# Memrise Content Pipeline (Spanish) — Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or inline. Steps use `- [ ]`.

**Goal:** Replace the 24-word placeholder with a real ~3,000-word Spanish `deck.json` generated from open CC BY-SA sources, via a committed build script.

**Architecture:** A build-time Node/tsx script (`scripts/build-deck.ts`) joins the doozan/spanish_data frequency list and Wiktionary gloss data into `public/content/es/deck.json`. Raw sources (~21 MB) are downloaded into a gitignored `raw/` dir and never shipped; the generated deck is committed so `npm install && build` needs no network. The generator, join, and gloss-cleanup rules are already **proven against the real data** (prototype produced 3,000 clean items, 94% yield, passes the deck gate, 69 KB gzip).

**Tech Stack:** tsx, the existing `scripts/validate-deck.ts` gate, `src/lib/check.ts`.

**Companion spec:** `docs/superpowers/specs/2026-07-24-memrise-redesign-design.md`. **Depends on:** Plans 1–2 (done).

### Scope

**This plan: Spanish only.** French has no equivalent pre-joined bundle (its source is a 544 MB kaikki dump), so it's a **follow-on (Plan 4)**. The app already shows the load-error state for the missing French deck, which is correct until then.

### Sources & licensing (all CC BY-SA / CC BY)

- `frequency.csv` — FrequencyWords (hermitdave), CC BY-SA 3.0. Format: `count,spanish,pos,flags,usage`; row order = frequency rank; `pos` is a FreeLing tag; `NOUSAGE`/`none` rows are skipped.
- `es-en.data` — Wiktionary (en) via doozan/spanish_data, CC BY-SA. Format: `_____`-delimited blocks; a headword line, then `pos:` blocks each with ordered `gloss:` lines (first = primary), optional `q:` qualifiers.
Both fetched from `https://raw.githubusercontent.com/doozan/spanish_data/master/`.

---

## Task 1: Gitignore raw sources; add the generator

**Files:** Modify `.gitignore`; Create `scripts/build-deck.ts`; Modify `package.json`.

- [ ] **Step 1: Add to `.gitignore`**
```
raw/
```

- [ ] **Step 2: Write `scripts/build-deck.ts`** (the proven generator, productionized). It:
  1. Ensures `raw/frequency.csv` and `raw/es-en.data` exist; if missing, downloads them from the doozan raw URLs (via `fetch`), writing into `raw/`.
  2. Parses `es-en.data` into `lemma → pos → rawGloss[]` (single-word headwords only).
  3. Walks `frequency.csv` in rank order, skips `NOUSAGE`/`none`/unmapped-pos/multiword, joins glosses (exact pos, else any pos for the lemma), runs `cleanSenses`, and keeps the first `N=3000` with ≥1 clean gloss, assigning dense ranks.
  4. Writes `public/content/es/deck.json` with the two `sources[]` attribution entries.

The exact logic (verbatim from the proven prototype — pos map, `RESTRICT`, `DESC`, `cleanSenses` with subset-dedup, the frequency walk, the deck shape). Reproduce it as-is; it has been validated end-to-end against the real data. Constants: `N = 3000`.

- [ ] **Step 3: Add npm scripts to `package.json`**
```json
    "build:deck": "tsx scripts/build-deck.ts",
```

- [ ] **Step 4: Commit** (generator + gitignore + package.json; NOT raw/ or the deck yet)
```bash
git add scripts/build-deck.ts .gitignore package.json
git commit -m "feat(content): Spanish deck generator from CC BY-SA sources"
```

---

## Task 2: Strengthen the deck gate

**Files:** Modify `scripts/validate-deck.ts`.

Add two assertions so a botched regeneration can't ship: a minimum item count and a gloss sanity bound. Keep everything else.

- [ ] **Step 1:** In `validateDecks`, after the per-item loop for a deck, add:
```ts
    if (deck.items.length < 100) add(`${lang}/deck.json`, `only ${deck.items.length} items — expected a full deck`)
```
  and inside the per-item checks, add a gloss-length guard:
```ts
      if (it.gloss?.[0] && it.gloss[0].length > 60) add(w, `gloss too long: "${it.gloss[0]}"`)
```
  (The placeholder deck has 24 items, so this gate now expects the real deck — run Task 3 before committing so validate passes.)

- [ ] **Step 2: Commit** (with the generated deck in Task 3, since the min-count check needs it — defer this commit into Task 3's commit).

---

## Task 3: Generate the real deck, verify, commit

**Files:** overwrite `public/content/es/deck.json` (was the placeholder).

- [ ] **Step 1: Generate** — `npm run build:deck`. Expect `generated 3000 items` and the printed spot-check (first 20 + every ~300th) to read as clean glosses.

- [ ] **Step 2: Spot-check 50 items** — eyeball the generator's sampled output (and grep ~30 random ranks). Fix any systematic gloss-cleanup issue in `cleanSenses` and regenerate. Isolated imperfect glosses on rare function words are acceptable; systematic breakage is not.

- [ ] **Step 3: Validate** — `npm run validate` → `✓ decks valid …` (now over 3,000 items, min-count + gloss-length pass).

- [ ] **Step 4: Full check** — `npm test` green, `npx tsc --noEmit` clean, `DEPLOY_BASE=/lingua_quest/ npm run build` succeeds. Update `e2e/smoke.spec.ts` if it assumed a placeholder-specific word (it uses "el" → "the", which is rank 1 in the real deck too, so it should still pass — confirm with `npm run e2e`).

- [ ] **Step 5: Browser check** — `npm run dev`; run the probe (now ~150 questions over real frequency bands), start a session, confirm real words with clean glosses render. Screenshot for the user.

- [ ] **Step 6: Commit** (the real deck + the strengthened gate from Task 2)
```bash
git add public/content/es/deck.json scripts/validate-deck.ts
git commit -m "feat(content): real 3,000-word Spanish deck (replaces placeholder)"
```

---

## Self-review

- Sources + licensing documented and carried in `deck.sources`. ✓
- Generator proven against real data (3,000 items, 94% yield, gate passes, 69 KB gzip). ✓
- Gate strengthened (min count + gloss length) so a bad regen fails CI. ✓
- Raw sources gitignored; generated deck committed (offline-buildable). ✓
- Scope: Spanish only; French is Plan 4 (no ready bundle). App handles missing FR deck. ✓
- e2e "el → the" still valid (rank 1 in the real deck). ✓

## Next plan

- **Plan 4 — French deck:** assemble from a French frequency list + kaikki wiktextract (or a lighter French bilingual source), same generator shape with a FR source adapter; generate + spot-check `public/content/fr/deck.json`.
