import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { HtmlAudioEngine } from './audio/htmlAudioEngine'
import { baseName, classifyFile } from './core/classify'
import { groupBySilence } from './core/paragraphs'
import { Player } from './core/player'
import { parseSrt, type Cue } from './core/srt'
import { readTextFile } from './io/decodeText'
import { useEngine } from './useEngine'
import './App.css'

interface Session {
  title: string
  audioUrl: string
  /** objectURL이면 해제 함수 */
  revoke?: () => void
  cues: Cue[]
}

async function sessionFromFiles(files: File[]): Promise<Session> {
  const audio = files.find((f) => classifyFile(f.name, f.type) === 'audio')
  const sub = files.find((f) => classifyFile(f.name, f.type) === 'subtitle')
  if (!audio || !sub) throw new Error('오디오 파일 1개와 자막(.srt/.vtt) 1개를 함께 골라 주세요.')
  const { text } = await readTextFile(sub)
  const { cues } = parseSrt(text)
  if (cues.length === 0) throw new Error('자막에서 큐를 찾지 못했습니다.')
  const audioUrl = URL.createObjectURL(audio)
  return { title: baseName(audio.name), audioUrl, revoke: () => URL.revokeObjectURL(audioUrl), cues }
}

/** 개발 전용: ?fixture=<파일명(확장자 제외)>[&ext=m4a]이면 samples/에서 HTTP Range로 불러옴(NFR-10) */
async function sessionFromFixture(name: string, ext = 'mp3'): Promise<Session> {
  const base = `/samples/${encodeURIComponent(name)}`
  const res = await fetch(`${base}.srt`)
  if (!res.ok) throw new Error(`픽스처 자막 없음: ${name}`)
  const { cues } = parseSrt(await res.text())
  return { title: name, audioUrl: `${base}.${ext}`, cues }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const CueText = memo(function CueText({ cues, onTap }: { cues: Cue[]; onTap: (i: number) => void }) {
  const paragraphs = useMemo(() => groupBySilence(cues), [cues])
  return (
    <article
      className="reader"
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
        if (el) onTap(Number(el.dataset.i))
      }}
    >
      {paragraphs.map(([a, b]) => (
        <p key={a}>
          {cues.slice(a, b).map((c) => (
            <span key={c.index} data-i={c.index} className="cue">
              {c.text}{' '}
            </span>
          ))}
        </p>
      ))}
    </article>
  )
})

interface Loaded {
  session: Session
  engine: HtmlAudioEngine
  player: Player
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const session = loaded?.session ?? null
  const engine = loaded?.engine ?? null
  const player = loaded?.player ?? null
  const snap = useEngine(engine)

  const loadedRef = useRef<Loaded | null>(null)
  const open = (s: Session) => {
    const old = loadedRef.current
    if (old) {
      old.engine.dispose()
      old.session.revoke?.()
    }
    const eng = new HtmlAudioEngine(s.audioUrl)
    const next = { session: s, engine: eng, player: new Player(eng, s.cues) }
    loadedRef.current = next
    setLoaded(next)
  }

  // 개발용 픽스처
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const name = import.meta.env.DEV ? q.get('fixture') : null
    if (name) sessionFromFixture(name, q.get('ext') ?? undefined).then(open, (e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 첫 로드에 한 번만
  }, [])
  const current = player ? player.currentIndex() : -1

  // 강조와 자동 스크롤: 바뀐 두 문장만 직접 갱신(전체 다시 그리기 방지)
  const lastRef = useRef(-1)
  useEffect(() => {
    document.querySelector(`[data-i="${lastRef.current}"]`)?.classList.remove('current')
    lastRef.current = current
    const el = document.querySelector<HTMLElement>(`[data-i="${current}"]`)
    if (!el) return
    el.classList.add('current')
    const offset = () => el.getBoundingClientRect().top - window.innerHeight / 3
    if (Math.abs(offset()) < window.innerHeight * 1.5) {
      window.scrollBy({ top: offset(), behavior: 'smooth' })
      return
    }
    // 먼 이동: content-visibility가 화면 밖 문단 높이를 추정값으로 두므로, 즉시 이동한 뒤
    // 새로 그려진 문단의 실제 높이로 위치가 안정될 때까지 몇 프레임 다시 맞춤
    let raf = 0
    let tries = 8
    const settle = () => {
      const d = offset()
      if (Math.abs(d) < 2 || tries-- === 0) return
      window.scrollBy({ top: d, behavior: 'instant' })
      raf = requestAnimationFrame(settle)
    }
    settle()
    return () => cancelAnimationFrame(raf)
  }, [current, session])

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setError('')
    try {
      open(await sessionFromFiles([...list]))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onTap = useMemo(() => (i: number) => void player?.playFrom(i), [player])

  return (
    <div className="app">
      <header className="top">
        <h1>{session?.title ?? '오디오북리더'}</h1>
        <label className="open">
          파일 열기
          {/* accept를 비워 둠: Android에서 .srt가 회색으로 막히는 문제 회피(FR-01) */}
          <input type="file" multiple hidden onChange={(e) => onFiles(e.currentTarget.files)} />
        </label>
      </header>

      {(error || snap.error) && <p className="error">{error || snap.error}</p>}

      {session ? (
        <CueText cues={session.cues} onTap={onTap} />
      ) : (
        <section className="empty">
          <p>낭독 오디오(mp3·m4a)와 자막(.srt)을 함께 골라 주세요.</p>
          <p>재생 중인 문장이 강조되고, 문장을 누르면 거기서부터 재생합니다.</p>
        </section>
      )}

      {session && (
        <footer className="bar">
          <div className="progress">
            <input
              type="range"
              aria-label="재생 위치"
              min={0}
              max={Math.max(1, snap.durationMs)}
              step={1000}
              value={snap.currentMs}
              onChange={(e) => engine?.seek(Number(e.currentTarget.value))}
            />
            <span className="time">
              {formatTime(snap.currentMs)} / {formatTime(snap.durationMs)}
            </span>
          </div>
          <div className="buttons">
            <button type="button" onClick={() => player?.prev()} aria-label="이전 문장">
              ⏮
            </button>
            <button type="button" className="play" onClick={() => player?.togglePlay()} aria-label={snap.paused ? '재생' : '일시정지'}>
              {snap.paused ? '▶' : '⏸'}
            </button>
            <button type="button" onClick={() => player?.next()} aria-label="다음 문장">
              ⏭
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}
