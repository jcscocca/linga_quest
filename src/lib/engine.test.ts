import { beforeEach, describe, expect, it } from 'vitest'
import { clear, entries } from 'idb-keyval'
import { useEngine, itemStore } from './engine'
import { todayString } from './xp'
import type { ItemState } from './srs'

// Clear idb (default store + both language stores) so tests don't leak state
// into each other through fake-indexeddb.
async function reset() {
  await clear()
  await clear(itemStore('es'))
  await clear(itemStore('fr'))
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

import { exportAll, importAll, LANGS } from './engine'

describe('export / import', () => {
  it('round-trips profile and every language store', async () => {
    const deck = makeDeck(10)
    await useEngine.getState().applyProbe('es', seedDeck(deck, 6, todayString()), 6)
    await useEngine.getState().grade('es:w1:noun', true)

    const json = await exportAll()
    expect(json.version).toBe(2)
    expect(Object.keys(json.items.es).length).toBe(10)

    // Wipe in-memory and re-import from the exported JSON.
    useEngine.setState({ states: {}, profile: { version: 2, frontier: {}, hydrated: true } })
    await importAll(json)
    await useEngine.getState().hydrate('es')
    expect(useEngine.getState().profile.frontier.es).toBe(6)
    // rank 1 on a 10-item deck at frontier 6 seeds "known" (level 4); the one
    // right answer above matures it to 5, and that must survive the round trip.
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
