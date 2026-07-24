# Memrise Content Pipeline (French) — Implementation Plan (Plan 4 of 4)

> **For agentic workers:** inline/executing-plans. Steps use `- [ ]`.

**Goal:** Add a real ~3,000-word French `deck.json` so the second language works, generated from open CC BY-SA sources by a committed build script.

**Architecture:** A build-time tsx script (`scripts/build-deck-fr.ts`) streams the kaikki.org French wiktextract dump (lemmas + POS + English glosses + inflected `forms`) and joins it with the hermitdave French frequency list. Because French frequency data is surface forms (conjugations), the script **folds each surface form's count up to its lemma** — using kaikki's `forms` and inflection `form_of` links — and tracks *which POS* each contribution came from, so a verb infinitive (frequency from its conjugations) is picked as a verb, not a same-spelled noun. Raw sources download into the gitignored `raw/`; the generated deck is committed. The join + gloss cleanup are **proven against the real data** (prototype produced 3,000 clean items; verbs/nouns correctly classified).

**Tech Stack:** tsx (Node streaming: `readline` over `createReadStream`), the existing `scripts/validate-deck.ts` gate. **Depends on:** Plans 1–3 (done).

### Sources & licensing

- Frequency: `fr_50k.txt` — FrequencyWords (hermitdave), CC BY-SA 4.0. `word count` per line; surface forms.
- Glosses/lemmas/forms: `kaikki.org-dictionary-French.jsonl` (~570 MB) — Wiktionary via kaikki.org, CC BY-SA 4.0. JSONL; each line an entry with `word`, `pos`, `senses[].glosses[]`, `forms[].form`, and (for inflections) `senses[0].form_of[].word`.

### Known limitation (accepted)

A handful of top-frequency **function words** get an imperfect gloss/POS (ambiguous surfaces, e.g. "ça → id", "pas → step") because their frequency doesn't fold from inflections and POS-priority guesses. These are words an AP-level learner knows cold and the probe marks known immediately; content words (the bulk, ranks ~30–3000) are clean and correctly classified. Not worth per-word curation for v1.

---

## Task 1: Add the French generator

**Files:** Create `scripts/build-deck-fr.ts`; Modify `package.json`.

- [ ] **Step 1: Write `scripts/build-deck-fr.ts`** — the proven prototype, productionized: download `raw/fr_50k.txt` and `raw/kaikki-fr.jsonl` if missing; stream-parse kaikki building `lemma→glosses` and `surface→{lemma,pos}` (forms + inflections, no self-map); fold frequency to lemmas with per-POS weights; rank words, pick the primary POS by folded weight (else content-POS priority), dedup by lemma; `cleanSenses`; write `public/content/fr/deck.json` with the two `sources[]`. `N = 3000`.

- [ ] **Step 2: Add npm script**
```json
    "build:deck:fr": "tsx scripts/build-deck-fr.ts",
```

- [ ] **Step 3: Commit** (generator + package.json)
```bash
git add scripts/build-deck-fr.ts package.json
git commit -m "feat(content): French deck generator (kaikki + frequency fold)"
```

---

## Task 2: Generate, verify, commit the French deck

**Files:** Create `public/content/fr/deck.json`.

- [ ] **Step 1: Generate** — `npm run build:deck:fr`. Expect `generated 3000 items` and clean spot-check output (verbs classified as verbs).

- [ ] **Step 2: Spot-check** — eyeball the sampled output; confirm content words read cleanly and verb infinitives are `verb`. Fix systematic issues in the generator and regenerate; isolated function-word imperfections are acceptable.

- [ ] **Step 3: Validate** — `npm run validate` → `✓ decks valid …` (now validates es AND fr: dense ranks, self-consistent glosses, gloss-length, attribution).

- [ ] **Step 4: Full check** — `npm test` green, `npx tsc --noEmit` clean, `DEPLOY_BASE=/lingua_quest/ npm run build` succeeds, `npm run e2e` passes.

- [ ] **Step 5: Browser check** — `npm run dev`; switch the language to **French** (the load-error is now gone), run the probe, start a session, confirm real French words + clean glosses + fr-FR audio. Screenshot for the user.

- [ ] **Step 6: Commit**
```bash
git add public/content/fr/deck.json
git commit -m "feat(content): real 3,000-word French deck"
```

---

## Self-review

- Both languages now ship a real deck; the language switcher works end to end. ✓
- Frequency correctly folded to lemmas with per-POS weighting (verbs classified right). ✓
- Sources + licensing in `deck.sources`; raw kaikki gitignored, deck committed (offline-buildable). ✓
- Gate validates both decks. ✓
- Function-word imperfections documented and accepted. ✓

This completes the Memrise redesign: engine + UI + Spanish + French, all on branch `memrise-redesign`.
