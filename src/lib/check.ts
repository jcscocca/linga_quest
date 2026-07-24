// Answer checking. Language answers are messy — learners forget accents, add
// stray punctuation, or vary capitalization — so we normalize both sides before
// comparing and accept an accent-only miss with a gentle nudge.

export interface CheckResult {
  correct: boolean
  /** A hint shown on a lenient (accent-only) accept. */
  note?: string
}

/** Lowercase, drop punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[¿¡?!.,;:"'“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fold vowel accents (á→a, ü→u) but keep ñ, which is a distinct letter. */
export function foldAccents(s: string): string {
  return s
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ü/g, 'u')
}

/** Match typed text against a set of acceptable answers, leniently. */
export function checkText(given: string, accept: string[]): CheckResult {
  const g = normalize(given)
  if (!g) return { correct: false }
  if (accept.some(a => normalize(a) === g)) return { correct: true }
  const gf = foldAccents(g)
  const near = accept.find(a => foldAccents(normalize(a)) === gf)
  if (near) return { correct: true, note: `¡Casi! Watch the accents — it's “${near}”.` }
  return { correct: false }
}
