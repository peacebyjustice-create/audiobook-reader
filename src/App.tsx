import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HtmlAudioEngine } from './audio/htmlAudioEngine'
import { Player } from './core/player'
import { RepeatController } from './core/repeat'
import { logEvent, watchPlayback } from './io/eventLog'
import { DEFAULT_SETTINGS, getLastBook, getMeta, getSettings, saveSettings, setLastBook, type Settings } from './io/store'
import { Library } from './library/Library'
import { openFixture, openStored, type LoadedBook } from './reader/openBook'
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

  const unwatch = useRef<(() => void) | null>(null)
  const close = () => {
    const s = sessionRef.current
    unwatch.current?.()
    unwatch.current = null
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
    const engine = new HtmlAudioEngine(loaded.audioUrl, loaded.meta.positionMs)
    engine.playbackRate = loaded.meta.rate || 1
    const player = new Player(engine, loaded.timeline.segments)
    player.offsetMs = loaded.meta.offsetMs
    const repeat = new RepeatController(player, st.repeat)
    const s = { loaded, engine, player, repeat }
    sessionRef.current = s
    setSession(s)
    unwatch.current = watchPlayback(engine.el)
    logEvent(`open:${loaded.meta.stored ? 'stored' : 'picked'}`, Math.round(loaded.meta.positionMs / 1000))
    void setLastBook(loaded.meta.id)
  }

  /** 사용자가 서재로 돌아가면 다음 실행 때 자동으로 열지 않음 */
  const closeByUser = () => {
    void setLastBook(null)
    close()
  }

  /** 다시 정렬한 결과로 바꿈: 오디오 엔진(재생 위치)은 그대로 두고 플레이어·반복만 새로 만듦 */
  const replace = (loaded: LoadedBook) => {
    const old = sessionRef.current
    if (!old) return open(loaded)
    old.repeat.dispose()
    const player = new Player(old.engine, loaded.timeline.segments)
    player.offsetMs = old.player.offsetMs
    const repeat = new RepeatController(player, settings.repeat)
    const s = { loaded, engine: old.engine, player, repeat }
    sessionRef.current = s
    setSession(s)
  }

  useEffect(() => {
    void getSettings().then((st) => {
      setSettings(st)
      // 개발용 픽스처: ?fixture=<이름>[&ext=m4a] (md가 있으면 책 모드)
      const q = new URLSearchParams(location.search)
      const name = import.meta.env.DEV ? q.get('fixture') : null
      if (name) return void openFixture(name, q.get('ext') ?? 'mp3').then((b) => open(b, st), (e: Error) => setError(e.message))
      // 앱이 백그라운드에서 종료됐다가 다시 열리면 마지막 책을 이어서 엶(앱에 보관한 오디오가 있을 때)
      if (location.hash !== '#diag')
        void getLastBook().then(async (id) => {
          const meta = id ? await getMeta(id) : undefined
          const l = meta ? await openStored(meta) : null
          if (l && !sessionRef.current) open(l, st)
        })
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
  if (session) return <Reader key={session.loaded.meta.id} session={session} settings={settings} onSettings={updateSettings} onClose={closeByUser} onReplace={replace} />
  return (
    <>
      {error && <p className="error">{error}</p>}
      <Library onOpen={(b) => open(b)} />
    </>
  )
}
