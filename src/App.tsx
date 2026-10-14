import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HtmlAudioEngine } from './audio/htmlAudioEngine'
import { Player } from './core/player'
import { RepeatController } from './core/repeat'
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from './io/store'
import { Library } from './library/Library'
import { openFixture, type LoadedBook } from './reader/openBook'
import { Reader, type ReaderSession } from './reader/Reader'
import './App.css'

const Diag = lazy(() => import('./diag/Diag'))

const subscribeHash = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}

export default function App() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash)
  const [session, setSession] = useState<ReaderSession | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [error, setError] = useState('')
  const sessionRef = useRef<ReaderSession | null>(null)

  const close = () => {
    const s = sessionRef.current
    if (s) {
      s.repeat.dispose()
      s.engine.dispose()
      s.loaded.revoke?.()
    }
    sessionRef.current = null
    setSession(null)
  }

  const open = (loaded: LoadedBook, st: Settings = settings) => {
    close()
    const engine = new HtmlAudioEngine(loaded.audioUrl)
    engine.playbackRate = loaded.meta.rate || 1
    if (loaded.meta.positionMs > 0) engine.seek(loaded.meta.positionMs)
    const player = new Player(engine, loaded.timeline.segments)
    player.offsetMs = loaded.meta.offsetMs
    const repeat = new RepeatController(player, st.repeat)
    const s = { loaded, engine, player, repeat }
    sessionRef.current = s
    setSession(s)
  }

  useEffect(() => {
    void getSettings().then((st) => {
      setSettings(st)
      // 개발용 픽스처: ?fixture=<이름>[&ext=m4a] (md가 있으면 책 모드)
      const q = new URLSearchParams(location.search)
      const name = import.meta.env.DEV ? q.get('fixture') : null
      if (name) openFixture(name, q.get('ext') ?? 'mp3').then((b) => open(b, st), (e: Error) => setError(e.message))
    })
    return close
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 로드에 한 번만
  }, [])

  const updateSettings = (s: Settings) => {
    setSettings(s)
    void saveSettings(s)
  }

  if (hash === '#diag')
    return (
      <Suspense fallback={<p className="notice">불러오는 중…</p>}>
        <Diag />
      </Suspense>
    )
  if (session) return <Reader key={session.loaded.meta.id} session={session} settings={settings} onSettings={updateSettings} onClose={close} />
  return (
    <>
      {error && <p className="error">{error}</p>}
      <Library onOpen={(b) => open(b)} />
    </>
  )
}
