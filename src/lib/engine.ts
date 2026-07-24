// The engine store. Holds only the ACTIVE language's item states in memory;
// each language persists to its own idb-keyval store (lingua-quest-<lang>) so an
// answer writes ~80 bytes, not the whole deck, and the inactive language never
// loads. Profile (frontier estimates) lives in the default store.

import { create } from 'zustand'
import { createStore, entries, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval'
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
    // Always reload the (tiny) profile from idb so an import is reflected.
    const saved = await idbGet<Profile>(PROFILE_KEY).catch(() => undefined)
    const profile: Profile = saved && saved.version === 2 ? { ...saved, hydrated: true } : { ...emptyProfile, hydrated: true }
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
