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
