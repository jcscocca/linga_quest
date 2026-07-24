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

export type ProbeVerdict = 'known' | 'fuzzy' | 'unknown'

// Seed intervals are jittered across a window so a probe doesn't schedule every
// known word on the same day (a maintenance avalanche a month out); the spread
// turns that wall into a steady daily load.
export const KNOWN_SEED_MIN = 21
export const KNOWN_SEED_MAX = 40
export const FUZZY_SEED_MIN = 1
export const FUZZY_SEED_MAX = 8

function jitter(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Triage → initial state. A known word is seeded mature with a jittered
 *  multi-week interval so a fresh estimate gets time to prove itself and the
 *  first maintenance reviews land spread out, not all on one day. */
export function seedFromProbe(verdict: ProbeVerdict, today: string, rng: () => number = Math.random): ItemState {
  if (verdict === 'known') {
    const interval = jitter(KNOWN_SEED_MIN, KNOWN_SEED_MAX, rng)
    return { level: 4, interval, due: addDays(today, interval), lapses: 0, seen: today, origin: 'probe' }
  }
  if (verdict === 'fuzzy') {
    const interval = jitter(FUZZY_SEED_MIN, FUZZY_SEED_MAX, rng)
    return { level: 1, interval, due: addDays(today, interval), lapses: 0, seen: today, origin: 'probe' }
  }
  return { level: 0, interval: 0, due: today, lapses: 0, seen: today, origin: 'probe' }
}

/** A word counts as "strong" for metrics when it is mature (level ≥ 4) and not
 *  yet overdue. */
export function isStrong(s: ItemState, today: string): boolean {
  return s.level >= 4 && today <= s.due
}
