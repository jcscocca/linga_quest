// Thin router: hydrates the engine, loads the active language's deck, and
// switches between the four screens. All behavior lives in the screens/engine.

import { useEffect, useState } from 'react'
import { Collection } from './components/Collection'
import { Home } from './components/Home'
import { ProbeScreen } from './components/ProbeScreen'
import { SessionScreen } from './components/SessionScreen'
import type { Deck } from './lib/deck'
import { loadDeck } from './lib/deck'
import { LANGS, useEngine } from './lib/engine'

type View = 'home' | 'probe' | 'session' | 'collection'

const DEFAULT_LANG = 'es'

export default function App() {
  const [lang, setLang] = useState(DEFAULT_LANG)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('home')
  const hydrated = useEngine(s => s.hydrated)

  useEffect(() => {
    void useEngine.getState().hydrate(DEFAULT_LANG)
  }, [])

  useEffect(() => {
    setDeck(null)
    setError(null)
    setView('home')
    loadDeck(import.meta.env.BASE_URL, lang).then(setDeck).catch(e => setError(String(e)))
  }, [lang])

  function switchLang(next: string) {
    setLang(next)
    void useEngine.getState().hydrate(next)
  }

  if (error)
    return (
      <div className="load-error">
        <p>Failed to load content: {error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    )
  if (!deck || !hydrated) return <div className="loading">Loading… ¡Un momento!</div>

  const voice = lang === 'es' ? 'es-ES' : 'fr-FR'

  switch (view) {
    case 'probe':
      return <ProbeScreen deck={deck} lang={lang} voice={voice} onDone={() => setView('home')} />
    case 'session':
      return <SessionScreen deck={deck} voice={voice} onDone={() => setView('home')} />
    case 'collection':
      return <Collection deck={deck} voice={voice} onBack={() => setView('home')} />
    default:
      return (
        <Home
          deck={deck}
          lang={lang}
          langs={LANGS}
          voice={voice}
          onStartSession={() => setView('session')}
          onStartProbe={() => setView('probe')}
          onOpenCollection={() => setView('collection')}
          onSwitchLang={switchLang}
        />
      )
  }
}
