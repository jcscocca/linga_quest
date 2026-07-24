# Lingua Quest → Memrise-style SRS trainer — Design

**Date:** 2026-07-24
**Status:** Approved (design); pending written-spec review before planning.

## Goal

Redesign Lingua Quest from a Duolingo-style fixed-curriculum skill tree into an
old-Memrise-style **per-item spaced-repetition vocabulary trainer** for a
returning AP-level learner (passed AP Spanish and AP French), covering both
languages.

The organizing user goal is **restore + maintain**: reactivate what was once
known, find the gaps quickly, then hold it with a small daily review that never
ends. This breaks a core SRS assumption — most items start *known but
uncertain*, not unknown — which makes fast triage a first-class feature rather
than onboarding.

### Non-goals (v1)

- CSV / Anki deck import (data model allows it later; not built)
- Confusable-pairs / cross-language interference feature
- Theme-filtered study sessions
- Service-worker offline layer
- Hand-authored grammar/phrase exercises (the existing 121 are retired)

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Primary goal | Restore + maintain AP level |
| Content source | Frequency-ranked core list per language (CC BY-SA), ~3,000 items |
| Triage | Adaptive frequency probe (~150 tests places ~3,000 words) |
| Test mode | Escalating with maturity: MC → typed production → audio-only |
| Two languages | Separate queues; user picks which to study each session |
| Motivation | Honest metrics (est. vocab size, % strong, words-restored); **no streak**, no XP, no badges |
| Approach | A — rebuild the core spine, keep the reusable leaves |

## What survives, what goes

**Reused unchanged (the good parts):**
- `src/lib/check.ts` — accent-lenient grading, with its full test suite
- `src/lib/speech.ts` — Web Speech TTS
- `src/lib/xp.ts` date helpers (`todayString`, `addDays`, `dayDiff`) — the XP/streak
  functions themselves are retired
- Expanding-interval math from `src/lib/review.ts` (generalized from skills to items)
- IndexedDB persistence pattern and export/import

**Retired (Duolingo-shaped):**
- `curriculum.json`, units, skills, prerequisites, free-roam unlock
- XP, daily streak, badges
- `LessonScreen`, the five-type exercise bank, `curriculum`-driven `HomeScreen`
- The 121 hand-authored exercises (the ~117 embedded vocab pairs are superseded
  by the generated decks)

## Research findings (grounding)

- **AP framework was revised for 2026-27.** AP Spanish and AP French share one
  six-theme taxonomy: Families and Communities, Language and Culture, Art and
  Creativity, Science and Technology, Contemporary Life, Global Contexts. (Theme
  names shifted from the pre-2026 set the user studied under.) One taxonomy
  serves both languages.
- **Spanish has a ready bundle:** `github.com/doozan/spanish_data` — frequency
  lemmas + POS, Wiktionary ES→EN glosses, Tatoeba sentences, pre-joined,
  ~50k entries. Licenses: CC BY-SA 3.0 (frequency), CC BY-SA (Wiktionary),
  CC BY 2.0 FR (Tatoeba).
- **French needs assembly:** Wiktionary frequency list + kaikki.org wiktextract
  dump (388,993 forms, ~544 MB, build-time only) + Tatoeba. Same pipeline shape,
  different source adapters.
- **Everything viable is CC BY-SA** → attribution + share-alike required; every
  deck ships a `sources[]` block surfaced in-app.
- **Frequency rank and AP themes are orthogonal** — frequency lists carry no
  thematic tags. Frequency bands are the primary axis; `theme` is a
  best-effort filter (from kaikki topic categories) that is sparsely populated.

## Measurements (assumptions checked, not assumed)

- 3,000-item deck with example sentences ≈ 496 KB raw ≈ ~130 KB gzipped →
  ship as one file per language, no lazy-loading.
- Serializing 6,000 item-states ≈ 0.4 ms → the old single-blob write is wasteful
  (468 KB rewritten per answer) but not a jank crisis. Per-language item stores
  fix it cheaply, not urgently.

---

## Section 1 — Data model and persistence

Three kinds of data, split by change frequency.

### Deck (static, generated, fetched at runtime)

`public/content/<lang>/deck.json`:

```jsonc
{
  "lang": "es",
  "generated": "2026-07-24",
  "sources": [{ "name": "...", "url": "...", "license": "CC BY-SA 3.0" }],
  "items": [{
    "id": "es:casa:noun",            // lang:lemma:pos — STABLE across regeneration
    "lemma": "casa",
    "pos": "noun",
    "gloss": ["house", "home"],      // first is canonical for grading
    "rank": 312,                     // dense 1..N frequency rank; probe depends on it
    "theme": "families-communities", // optional, often null
    "ex": { "t": "La casa es grande.", "en": "The house is big." } // optional
  }]
}
```

The id is `lang:lemma:pos`, not bare lemma, so distinct senses (*poder* verb vs.
noun; *el/la capital*) never collapse into one card and corrupt history on
regeneration.

### Item state (per word, the only thing that mutates during a session)

```jsonc
{ "level": 3, "due": "2026-09-01", "interval": 35,
  "ease": 2.5, "lapses": 1, "seen": "2026-07-24", "origin": "probe" }
```

`origin` ∈ `probe | manual | default` — records how the word was seeded so a
misfire is traceable and reversible.

### Profile (one small blob)

Probe results per language, estimated vocabulary size, settings.

### Persistence change

Replace today's single `lingua-quest-progress` key (holding everything) with:
- `profile` — one record
- **one idb-keyval store per language** (`items-es`, `items-fr`), one record
  per word

Answering a card writes ~80 bytes, not 468 KB. The inactive language never loads
into memory — falls out of the separate-queues decision, not extra machinery.

Export/import: dump `profile` + both item stores into one JSON file (same spirit
as today).

### Notes

- `theme` is sparsely populated by design; frequency bands are primary.
- The old `Vocab`/`VocabEntry` split collapses into the deck item — the
  vocabulary collection becomes a *view over the deck*, which is precisely the
  "collect words but never schedule them" bug this redesign fixes.

---

## Section 2 — The scheduler

Keeps the shape of `review.ts` (expanding intervals, overdue decay,
drop-on-failure); moves it from skills to items with three changes.

### Level drives the test mode

One schedule per word; `level` (0–5) decides how it is tested (the old-Memrise
mechanic):

| Level | Interval | Tested as |
|---|---|---|
| 0 new | — | multiple choice, ES→EN |
| 1–2 | 1, 3 days | multiple choice |
| 3 | ~8 days | typed production, EN→ES |
| 4 | ~21 days | typed production |
| 5 mature | 45+ days | audio-only → type what you hear |

- **Right:** `level + 1`, interval roughly doubles.
- **Wrong:** drop **two** levels (tunable constant `LAPSE_DROP`; Memrise-style
  drop-to-zero and gentle drop-one are the alternatives), reset interval. A
  lapsed mature word falls back to cheap MC to re-stabilize fast.
- Ease/lapses carry the SM-2-ish tuning already present.

### Triage seeds the schedule directly

The piece ordinary SRS cannot do. Probe verdict writes state immediately:
- **known** → `level 4, interval 30, due today+30` (never enters as new)
- **fuzzy (frontier band)** → `level 1`
- **unknown** → `level 0`

`level` and `interval` are independent state fields. The table above shows the
interval a word *earns by review* at each level; triage instead seeds a known
word with a deliberately conservative 30-day interval (a fresh probe estimate
gets one month before it must prove itself, regardless of the level-4 review
default). The two need not match.

### Queue assembly (per language)

- Most-overdue-first ordering (as today's `assembleReview`), over items.
- **Daily new-word intake cap** (default ~15), separate from the review queue,
  so a 3,000-word deck feeds in gradually as reviews leave room.
- Session = all due reviews + up to N new, interleaved (not a wall of new words).
- No per-skill cap (no skills); just overall session size.

### Explicitly not doing

- **Not adopting full FSRS** — heavier than a maintenance deck needs; the
  expanding-interval math already has passing tests to extend.
- **"Reset this word" action** lives here: any card → level 0, so an
  over-optimistic probe self-corrects the instant a false-known surfaces.

---

## Section 3 — The adaptive probe

Place ~3,000 words in ~15 min by testing ~150. Works because vocabulary
knowledge tracks frequency rank tightly — the probe **finds the frontier** (the
rank where "know it" flips to "don't"), it does not test every word.

### Mechanic

- Bin the deck into frequency bands (~15 bands of ~200).
- Sample a few words per band; test them **production-style** (type the answer —
  honest frontier; showing the translation would inflate it).
- Walk outward binary-search style: strong in a band → jump harder; failing →
  step back easier. Spend the ~150 tests near the frontier.

### Output

1. **A seed for every deck word:** above frontier → `level 4` (known); below →
   `level 0` (new); words inside the frontier band → `level 1` (matches
   Section 2's seeding). This is what makes 15 min place 3,000 words. (A
   distance-graded ramp across the band is a possible later refinement; v1 seeds
   the whole band at level 1 for simplicity.)
2. **Estimated vocabulary size** — frontier rank ≈ vocab size; the honest
   headline metric, free.
3. Recorded test results, so a later re-probe can show the frontier move.

### Honest limits (it is an estimate)

- Nails the aggregate, misplaces individuals (a forgotten word deep in the known
  zone; a lucky guess past the frontier). Self-correcting: the scheduler's
  "reset this word" catches false-knowns; false-unknowns re-confirm cheaply once.
- Frequency-rank knowledge is monotonic *on average*, lumpy in practice; the
  graded frontier band absorbs most of the lumpiness.
- Per-language and re-runnable.

### Escape valves

- Quit early → all untested words seed to `level 0` (partial probe still works).
- Skip a word → counts as not-known (the safe direction).
- No probe-marked-known word is unrecoverable (comes back in review, reset it).

### Scope call

Probe is **production-tested** even though known words later *start* at MC. This
under-claims rather than over-claims the frontier — the error direction you want
when a false "known" means a word silently rots for 30 days.

---

## Section 4 — The content pipeline

A build-time Node script under `scripts/` — never shipped, never in the browser.
Turns raw CC BY-SA sources into `public/content/<lang>/deck.json`. Runs rarely;
may be slow/heavy. The 544 MB French dump lives here and never leaves.

### The join (per language)

```
frequency list (rank) ──┐
                        ├──> merge on lemma+POS ──> filter ──> deck.json
Wiktionary (gloss, POS)─┤
Tatoeba (example)──────┘
```

Spanish: doozan data is pre-joined. French: assembled from Wiktionary frequency
+ kaikki wiktextract + Tatoeba. One script, two source adapters.

### Hard parts and the ruling on each

- **Surface forms vs. lemmas:** collapse *hablo/hablas/habla* → *hablar*, sum
  frequencies, keep lemma rank. (doozan pre-lemmatized; kaikki carries lemma
  links.)
- **Noisy glosses:** keep top 1–2 senses, drop parenthetical/domain-tagged rare
  senses. Lossy but acceptable (user self-grades; example sentence gives
  context).
- **Dense rank:** after collapse + filter, re-rank 1..N with no holes so the
  probe's band math is exact.
- **Multiword & function words:** keep top function words (gradeable,
  high-value); drop multiword expressions in v1 (need phrase grading — out of
  scope). Logged, not silent.
- **Example sentences optional:** no Tatoeba hit → field absent; card still
  works, loses only the context line.

### Size discipline

Cut each deck at **~3,000 items** — matches the restore target, ~130 KB gzipped,
stays in the range where vocab-tracks-rank holds (degrades past ~5k).

### The gate (`validate-deck.ts`, wired into `npm run validate`)

Keeps the principle of today's `validate-content.ts` — replay through the *real*
checker so content can't drift from the grader. Asserts:
- every id unique and well-formed
- dense 1..N ranks, no gaps
- gloss non-empty
- `check()` passes the canonical gloss against itself (self-consistency)
- example sentence, when present, contains the lemma
- required `sources[]` attribution block present

### Licensing

Every deck carries `sources[]` (names, URLs, CC BY-SA notices), surfaced on an
"About the data" screen. Generated decks are committed (so `npm install && build`
needs no network and no 544 MB download); raw sources + generator are documented,
giant dumps gitignored.

### The thing that can't be guaranteed mechanically

Exact gloss quality per word. Structure, self-consistency, and attribution are
mechanical guarantees; "is *casa*'s gloss the one you'd pick" is not. → The plan
includes a **"generate, then spot-check 50 random items per language"** step
before either deck is considered done.

---

## Section 5 — Error handling and testing

### Runtime failure modes

- **Deck fetch fails:** reuse existing `loadJson` throw + retry screen. Cache
  after fetch; **no service worker in v1**.
- **Item-state ↔ deck drift** (regenerated deck renumbers ranks / drops a
  lemma): state is keyed by stable `lang:lemma:pos`, so it survives
  regeneration. Orphaned state (word left deck) is **ignored, not deleted** (so
  re-adding restores history). Deck items with no state are new words. This is
  the integrity rule the system rests on → directly tested.
- **Corrupt/old import or IDB read failure:** validate on the way in,
  `console.warn` + fall back to empty (as today's `progress.ts`). A v1
  (skill-tree) export imported into v2 can't convert → detect the old shape and
  say so plainly.
- **TTS unavailable:** audio-level cards must not become unanswerable → reveal
  text, degrade that card to typed production.
- **Probe abandoned midway:** handled by design (untested → level 0); tested.

### Testing (pure logic in small modules, tested directly — as today)

- **Scheduler:** level transitions, interval expansion, lapse/`LAPSE_DROP`,
  overdue decay. Extends `review.test.ts` rather than replacing proven cases.
- **Probe:** synthetic learner (knows everything above rank R); assert estimated
  frontier ≈ R across several R and deck sizes; assert early-quit seeds rest to
  level 0. Deterministic injected RNG (like `assembleReview` today).
- **Queue assembly:** due-first ordering, new-word cap, session size,
  empty-when-nothing-due.
- **Persistence/integrity:** export/import round-trip; deck-regeneration drift
  cases; old-format-import rejection. `fake-indexeddb` already a dev dep.
- **Grading:** `check.ts` reused unchanged → its suite carries over.
- **Content gate:** `validate-deck.ts` as above, wired into `npm run validate`
  and CI.
- **E2E:** repoint the smoke test — load deck → answer a card → state persists.
  Still runs against the built sub-path site, so it keeps guarding the deploy.

---

## Build order and independence (for planning)

The deck schema (Section 1) is the contract between two largely independent
tracks:

1. **App runtime** (Sections 1–3, 5) — scheduler, probe, queue, screens,
   persistence. Can be built and fully tested against a small hand-written
   fixture deck, before any real content exists.
2. **Content pipeline** (Section 4) — the generator + `validate-deck.ts`.
   Produces real `deck.json` files; depends only on the frozen schema, not on
   the app.

So the recommended order is: freeze the schema → build the runtime on a fixture
deck → build the pipeline → generate + spot-check the real Spanish deck →
generate French. Spanish ships first; French follows once its source adapter is
done. The planning step may split this into more than one plan along that seam.

## Follow-on features (clean extensions, out of v1 scope)

- CSV / Anki import (format already designed to allow it — imported deck is
  structurally identical to a generated one)
- Confusable-pairs / interference surfacing (Spanish↔French false friends)
- Theme-filtered study sessions
- Focus mode with frozen intervals (restore one language while the other pauses
  without accruing an overdue avalanche)
- Service-worker offline layer
