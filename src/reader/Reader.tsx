import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { HtmlAudioEngine } from '../audio/htmlAudioEngine'
import type { Player } from '../core/player'
import type { Tolerance } from '../core/align'
import type { RepeatController, RepeatState } from '../core/repeat'
import { formatTime } from '../format'
import { downloadJson, safeFileName } from '../io/download'
import { exportBooks, patchMeta, type Bookmark, type BookMeta, type Settings } from '../io/store'
import { chapterAt } from '../core/chapters'
import { useEngine } from '../useEngine'
import { BookView } from './BookView'
import { realign, type LoadedBook } from './openBook'
import { Sheet } from './Sheet'
import { useMediaSession } from './useMediaSession'

export interface ReaderSession {
  loaded: LoadedBook
  engine: HtmlAudioEngine
  player: Player
  repeat: RepeatController
}

const LONG_PRESS_MS = 500
/** 이 길이 이상인 VBR mp3는 변환 전까지 위치 이동을 잠금(F23, Q11 B) */
const VBR_LOCK_MS = 30 * 60_000
const CONVERT_CMD = 'ffmpeg -i 입력.mp3 -map 0:a -c:a aac -b:a 64k -ac 1 -movflags +faststart 출력.m4a'
const SAVE_EVERY_MS = 5000

function useRepeatState(repeat: RepeatController): RepeatState {
  return useSyncExternalStore(
    useCallback((l) => repeat.subscribe(l), [repeat]),
    () => repeat.state,
  )
}

type Menu = null | { kind: 'more' } | { kind: 'toc' } | { kind: 'report' } | { kind: 'sentence'; seg: number; sent: number | null }

export function Reader({
  session,
  settings,
  onSettings,
  onClose,
  onReplace,
}: {
  session: ReaderSession
  settings: Settings
  onSettings: (s: Settings) => void
  onClose: () => void
  onReplace: (l: LoadedBook) => void
}) {
  const { loaded, engine, player, repeat } = session
  const { timeline, chapters } = loaded
  const snap = useEngine(engine)
  const rep = useRepeatState(repeat)
  const [busy, setBusy] = useState('')
  /** 허용치·앵커·보기 방식을 바꿔 다시 정렬(F16·F17) */
  const redo = async (label: string, patch: Parameters<typeof realign>[1]) => {
    setMenu(null)
    setBusy(label)
    try {
      onReplace(await realign(loaded, patch))
    } catch (e) {
      setToast({ text: (e as Error).message, backTo: -1 })
    } finally {
      setBusy('')
    }
  }
  const anchorHere = (sent: number) => {
    const anchors = [...(loaded.meta.anchors ?? []).filter((a) => a.sentence !== sent), { sentence: sent, ms: Math.round(player.textTime()) }]
    void redo('이 문장을 지금 위치에 맞춰 다시 정렬하는 중…', { anchors })
  }
  const [meta, setMeta] = useState<BookMeta>(loaded.meta)
  const [following, setFollowing] = useState(true)
  const [menu, setMenu] = useState<Menu>(null)
  const [toast, setToast] = useState<{ text: string; backTo: number } | null>(null)
  const articleRef = useRef<HTMLElement>(null)

  const vbr = loaded.mp3?.kind === 'vbr'
  const seekLocked = vbr && snap.durationMs >= VBR_LOCK_MS
  const lockedToast = () => setToast({ text: 'VBR 파일이라 위치 이동이 잠겨 있습니다', backTo: -1 })

  const current = repeat.displayIndex()
  const curSeg = timeline.segments[current]

  const updateMeta = useCallback(
    (patch: Partial<BookMeta>) => {
      setMeta((m) => ({ ...m, ...patch }))
      void patchMeta(loaded.meta.id, patch)
    },
    [loaded.meta.id],
  )

  // 진도 저장: 재생 중 5초마다, 일시정지·화면 숨김·닫기 때(FR-10)
  const save = useCallback(() => {
    const i = player.currentIndex()
    void patchMeta(loaded.meta.id, {
      positionMs: Math.round(engine.currentMs),
      segId: timeline.segments[i]?.id ?? null,
      durationMs: Math.round(engine.durationMs),
    })
  }, [engine, player, loaded.meta.id, timeline])
  useEffect(() => {
    const id = setInterval(() => !engine.paused && save(), SAVE_EVERY_MS)
    const onHide = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      save()
    }
  }, [engine, save])
  useEffect(() => {
    if (snap.paused && snap.durationMs > 0) save()
  }, [snap.paused, snap.durationMs, save])

  // 강조와 자동 스크롤: 바뀐 요소의 클래스만 직접 갱신
  const lastRef = useRef(-1)
  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    // 낭독 안 된 문장은 data-seg="-1"이므로 음수는 찾지 않음
    if (lastRef.current >= 0) root.querySelector(`[data-seg="${lastRef.current}"]`)?.classList.remove('current')
    lastRef.current = current
    if (current < 0) return
    const el = root.querySelector<HTMLElement>(`[data-seg="${current}"]`)
    if (!el) return
    el.classList.add('current')
    if (!following) return
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
  }, [current, following, loaded])

  // 반복 구간 표시
  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    root.querySelectorAll('.in-loop, .loop-start').forEach((e) => e.classList.remove('in-loop', 'loop-start'))
    if (rep.mode === 'armed') root.querySelector(`[data-seg="${rep.start}"]`)?.classList.add('loop-start')
    if (rep.mode === 'loop')
      for (let i = rep.start; i <= rep.end; i++) root.querySelector(`[data-seg="${i}"]`)?.classList.add('in-loop')
  }, [rep, loaded])

  // 손으로 스크롤하면 자동 추적 멈춤(FR-09)
  useEffect(() => {
    const stop = () => setFollowing(false)
    const onKey = (e: KeyboardEvent) => ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) && stop()
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchmove', stop, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  // 문장 탭·길게 누르기
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
  const targetOf = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest<HTMLElement>('[data-seg]')
    if (!el) return null
    return { seg: Number(el.dataset.seg), sent: el.dataset.sent !== undefined ? Number(el.dataset.sent) : null }
  }
  /** 시각 없는 문장을 누르면 가장 가까운 낭독 문장으로(Q18 A) */
  const nearestSeg = (sent: number) => {
    const map = timeline.sentenceSeg
    for (let i = sent; i < map.length; i++) if (map[i] >= 0) return map[i]
    for (let i = sent; i >= 0; i--) if (map[i] >= 0) return map[i]
    return -1
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const t = targetOf(e.target)
    if (!t) return
    const timer = window.setTimeout(() => {
      if (press.current) press.current.fired = true
      navigator.vibrate?.(15)
      setMenu({ kind: 'sentence', ...t })
    }, LONG_PRESS_MS)
    press.current = { timer, x: e.clientX, y: e.clientY, fired: false }
  }
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer)
  }
  const onClick = (e: React.MouseEvent) => {
    const fired = press.current?.fired
    press.current = null
    if (fired) return
    const t = targetOf(e.target)
    if (!t) return
    const seg = t.seg >= 0 ? t.seg : t.sent !== null ? nearestSeg(t.sent) : -1
    if (seg < 0) return
    if (seekLocked) return lockedToast()
    const backTo = engine.currentMs
    void repeat.tap(seg)
    setFollowing(true)
    setToast({ text: '여기부터 재생합니다', backTo })
  }
  const onContextMenu = (e: React.MouseEvent) => {
    const t = targetOf(e.target)
    if (!t) return
    e.preventDefault()
    cancelPress()
    if (press.current) press.current.fired = true
    setMenu({ kind: 'sentence', ...t })
  }

  // 반복 버튼: 누르기 = 토글, 길게 = 이 문장 반복
  const repPress = useRef<{ timer: number; fired: boolean } | null>(null)
  const repDown = () => {
    if (seekLocked) return
    const timer = window.setTimeout(() => {
      if (repPress.current) repPress.current.fired = true
      navigator.vibrate?.(15)
      repeat.repeatCurrent()
    }, LONG_PRESS_MS)
    repPress.current = { timer, fired: false }
  }
  const repUp = () => {
    if (repPress.current) clearTimeout(repPress.current.timer)
  }
  const repClick = () => {
    const fired = repPress.current?.fired
    repPress.current = null
    if (!fired) repeat.press()
  }

  const addBookmark = (seg: number, ms: number) => {
    const s = timeline.segments[seg]
    const label = segmentText(loaded, seg).slice(0, 80)
    const bm: Bookmark = { ms: Math.round(ms), segId: s?.id ?? '', label, createdAt: Date.now() }
    updateMeta({ bookmarks: [...meta.bookmarks, bm].sort((a, b) => a.ms - b.ms) })
  }

  const setRate = (r: number) => {
    const rate = Math.round(Math.min(2, Math.max(0.5, r)) * 10) / 10
    engine.setRate(rate)
    updateMeta({ rate })
  }
  const setOffset = (ms: number) => {
    player.setOffset(ms)
    updateMeta({ offsetMs: ms })
  }
  const setRepeat = (patch: Partial<Settings['repeat']>) => {
    const next = { ...settings, repeat: { ...settings.repeat, ...patch } }
    repeat.setSettings(next.repeat)
    onSettings(next)
  }

  const repLabel = rep.mode === 'off' ? '반복' : rep.mode === 'armed' ? 'A–' : rep.start === rep.end ? '1문장' : 'A–B'
  const repCount = rep.mode === 'loop' && settings.repeat.count > 0 ? ` ${rep.done + 1}/${settings.repeat.count}` : ''
  const chapterIdx = chapterAt(chapters, current)
  const chapterLabel = (() => {
    const c = chapters[chapterIdx]
    if (!c) return null
    if (c.depth === 0) return c.title
    let p = chapterIdx
    while (p >= 0 && chapters[p].depth !== 0) p--
    return p >= 0 ? `${chapters[p].title} › ${c.title}` : c.title
  })()
  useMediaSession({ engine, player, repeat, chapters, title: meta.title, chapterTitle: chapterLabel, unit: settings.remoteUnit, seekLocked })
  const jumpTo = (seg: number) => {
    if (seekLocked) return lockedToast()
    repeat.seekManual(player.audioStart(seg))
    setFollowing(true)
    setMenu(null)
  }
  const stats = loaded.alignment?.stats

  return (
    <div className="app" style={{ ['--reader-size' as string]: `${settings.fontSize}px` }}>
      <header className="top">
        <button type="button" className="icon" onClick={onClose} aria-label="서재로">
          ‹
        </button>
        <h1>{meta.title}</h1>
      </header>

      {loaded.notice && <p className="notice">{loaded.notice}</p>}
      {busy && <p className="notice">{busy}</p>}
      {snap.error && <p className="error">{snap.error}</p>}
      {vbr && (
        <p className="error">
          가변 비트레이트(VBR) mp3입니다. 위치를 옮기면 소리와 강조가 수 초까지 어긋날 수 있습니다.
          {seekLocked && ' 30분 이상이라 변환 전까지 문장 이동·반복·진행바 이동을 잠갔습니다(처음부터 이어 듣기는 됩니다).'} PC에서 m4a로 변환한 뒤, 서재에서 이 책을 눌러
          변환한 파일을 고르면 진도가 그대로 이어집니다: <code>{CONVERT_CMD}</code>
        </p>
      )}

      <article
        ref={articleRef}
        className={`reader ${settings.view === 'lyrics' ? 'lyrics' : ''} ${settings.hideText ? 'hide-text' : ''}`}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={onContextMenu}
      >
        <BookView loaded={loaded} />
      </article>

      <div className="floating">
        {curSeg?.kind === 'audio' && !seekLocked && (
          <button type="button" className="chip" onClick={() => repeat.tap(current + 1)}>
            건너뛰기 ›
          </button>
        )}
        {!following && (
          <button type="button" className="chip" onClick={() => setFollowing(true)}>
            현재 위치로
          </button>
        )}
        {toast && (
          <div className="toast">
            {toast.text}
            {toast.backTo >= 0 && <button
              type="button"
              onClick={() => {
                repeat.seekManual(toast.backTo)
                setToast(null)
              }}
            >
              이전 위치로
            </button>}
          </div>
        )}
      </div>

      <footer className="bar">
        <div className="progress-wrap">
          {snap.durationMs > 0 &&
            chapters.map((c) => (
              <span key={c.seg} className={`tick d${c.depth}`} style={{ left: `${(100 * player.audioStart(c.seg)) / snap.durationMs}%` }} />
            ))}
        <input
          className="progress"
          type="range"
          aria-label="재생 위치"
          min={0}
          max={Math.max(1, snap.durationMs)}
          step={1000}
          value={snap.currentMs}
          disabled={seekLocked}
          onChange={(e) => repeat.seekManual(Number(e.currentTarget.value))}
        />
        </div>
        <div className="status">
          <button type="button" className="chapter" onClick={() => setMenu({ kind: 'toc' })}>
            {chapterLabel}
          </button>
          <span className="time">
            {snap.error ? '--:--' : `${formatTime(snap.currentMs)} / ${formatTime(snap.durationMs)}`}
          </span>
        </div>
        <div className="buttons">
          <button type="button" disabled={seekLocked} onClick={() => repeat.prev()} aria-label="이전 문장">
            ⏮
          </button>
          <button type="button" className="play" onClick={() => player.togglePlay()} aria-label={snap.paused ? '재생' : '일시정지'}>
            {snap.paused ? '▶' : '⏸'}
          </button>
          <button type="button" disabled={seekLocked} onClick={() => repeat.next()} aria-label="다음 문장">
            ⏭
          </button>
          <button
            type="button"
            className={`rep ${rep.mode}`}
            disabled={seekLocked}
            aria-label="구간반복(길게 누르면 이 문장 반복)"
            onPointerDown={repDown}
            onPointerUp={repUp}
            onPointerLeave={repUp}
            onClick={repClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            {repLabel}
            {repCount}
          </button>
          <button
            type="button"
            className={`hide ${settings.hideText ? 'on' : ''}`}
            aria-pressed={settings.hideText}
            aria-label={settings.hideText ? '글자 보이기' : '글자 가리기(듣기 연습)'}
            onClick={() => onSettings({ ...settings, hideText: !settings.hideText })}
          >
            {settings.hideText ? '보기' : '가림'}
          </button>
          <button type="button" onClick={() => setMenu({ kind: 'more' })} aria-label="더 보기">
            ⋯
          </button>
        </div>
      </footer>

      {menu?.kind === 'sentence' && (
        <Sheet title={sentencePreview(loaded, menu)} onClose={() => setMenu(null)}>
          <SentenceMenu
            disabled={menu.seg < 0}
            onRepeat={() => repeat.repeatSentence(menu.seg)}
            onFrom={() => repeat.repeatFrom(menu.seg)}
            onTo={() => repeat.repeatTo(menu.seg)}
            onBookmark={() => menu.seg >= 0 && addBookmark(menu.seg, player.audioStart(menu.seg))}
            onCopy={() => void navigator.clipboard?.writeText(sentencePreview(loaded, menu, Infinity))}
            onAnchor={loaded.book && menu.sent !== null ? () => anchorHere(menu.sent!) : null}
            close={() => setMenu(null)}
          />
        </Sheet>
      )}

      {menu?.kind === 'report' && stats && (
        <Sheet title="정렬 리포트" onClose={() => setMenu(null)}>
          <p className="meta-info">
            자막 {stats.cues}줄 중 {stats.matchedCues}줄 매칭({Math.round((100 * stats.matchedCues) / Math.max(1, stats.cues))}%), 낭독 문장{' '}
            {stats.timedSentences}/{stats.sentences}, 정렬 {stats.elapsedMs}ms. 강조가 틀린 곳은 그 문장을 길게 눌러 '지금 재생 위치에 맞추기'로 고칩니다.
          </p>
          {(loaded.meta.anchors?.length ?? 0) > 0 && (
            <>
              <div className="sheet-title">수동 앵커</div>
              <ul className="bookmarks">
                {loaded.meta.anchors!.map((a) => (
                  <li key={a.sentence}>
                    <span className="link">
                      <span className="time">{formatTime(a.ms)}</span> {sentencePreview(loaded, { seg: -1, sent: a.sentence })}
                    </span>
                    <button
                      type="button"
                      className="icon"
                      aria-label="앵커 삭제"
                      onClick={() => void redo('앵커를 지우고 다시 정렬하는 중…', { anchors: loaded.meta.anchors!.filter((x) => x !== a) })}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="sheet-title">오디오 전용 구간 ({timeline.segments.filter((s) => s.kind === 'audio').length})</div>
          <ul className="bookmarks">
            {timeline.segments.map((s, i) =>
              s.kind !== 'audio' ? null : (
                <li key={i}>
                  <button type="button" className="link" disabled={seekLocked} onClick={() => jumpTo(i)}>
                    <span className="time">{formatTime(s.startMs)}</span> {segmentText(loaded, i).slice(0, 80)}
                  </button>
                </li>
              ),
            )}
          </ul>
        </Sheet>
      )}

      {menu?.kind === 'toc' && (
        <Sheet title="목차" onClose={() => setMenu(null)}>
          <ul className="toc">
            {chapters.map((c, k) => (
              <li key={c.seg} className={`d${c.depth} ${k === chapterIdx ? 'on' : ''}`}>
                <button type="button" className="link" disabled={seekLocked} onClick={() => jumpTo(c.seg)}>
                  <span className="time">{formatTime(player.audioStart(c.seg))}</span> {c.title}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {menu?.kind === 'more' && (
        <Sheet onClose={() => setMenu(null)}>
          <div className="row">
            <span>재생 속도</span>
            <div className="stepper">
              <button type="button" onClick={() => setRate(engine.playbackRate - 0.1)}>
                −
              </button>
              <b>{(meta.rate ?? 1).toFixed(1)}×</b>
              <button type="button" onClick={() => setRate(engine.playbackRate + 0.1)}>
                +
              </button>
            </div>
          </div>
          <div className="row">
            <span>반복 횟수</span>
            <select value={settings.repeat.count} onChange={(e) => setRepeat({ count: Number(e.currentTarget.value) })}>
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? '무한' : `${n}회 후 다음 문장`}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>반복 사이 쉬기</span>
            <select value={settings.repeat.gapMs} onChange={(e) => setRepeat({ gapMs: Number(e.currentTarget.value) })}>
              {[0, 500, 1000, 2000, 3000].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? '없음' : `${n / 1000}초`}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>반복 앞 여유 {settings.repeat.padStartMs}ms</span>
            <input type="range" min={0} max={500} step={50} value={settings.repeat.padStartMs} onChange={(e) => setRepeat({ padStartMs: Number(e.currentTarget.value) })} />
          </div>
          <div className="row">
            <span>반복 뒤 여유 {settings.repeat.padEndMs}ms</span>
            <input type="range" min={0} max={500} step={50} value={settings.repeat.padEndMs} onChange={(e) => setRepeat({ padEndMs: Number(e.currentTarget.value) })} />
          </div>
          <div className="row">
            <span title="양수: 소리가 글자보다 늦을 때(블루투스 등)">싱크 오프셋</span>
            <div className="stepper">
              <button type="button" onClick={() => setOffset(meta.offsetMs - 100)}>
                −100
              </button>
              <button type="button" onClick={() => setOffset(meta.offsetMs - 10)}>
                −10
              </button>
              <b>{meta.offsetMs}ms</b>
              <button type="button" onClick={() => setOffset(meta.offsetMs + 10)}>
                +10
              </button>
              <button type="button" onClick={() => setOffset(meta.offsetMs + 100)}>
                +100
              </button>
            </div>
          </div>
          <div className="row">
            <span>글자 크기</span>
            <div className="stepper">
              <button type="button" onClick={() => onSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 1) })}>
                A−
              </button>
              <b>{settings.fontSize}</b>
              <button type="button" onClick={() => onSettings({ ...settings, fontSize: Math.min(32, settings.fontSize + 1) })}>
                A+
              </button>
            </div>
          </div>
          <div className="row">
            <span>보기</span>
            <div className="seg-toggle">
              <button type="button" className={settings.view === 'book' ? 'on' : ''} onClick={() => onSettings({ ...settings, view: 'book' })}>
                책형
              </button>
              <button type="button" className={settings.view === 'lyrics' ? 'on' : ''} onClick={() => onSettings({ ...settings, view: 'lyrics' })}>
                가사형
              </button>
            </div>
          </div>
          <div className="row">
            <span>목차</span>
            <button type="button" onClick={() => setMenu({ kind: 'toc' })}>
              목차 보기 ({chapters.length})
            </button>
          </div>
          <div className="row">
            <span>이어폰·잠금화면 이전/다음</span>
            <select value={settings.remoteUnit} onChange={(e) => onSettings({ ...settings, remoteUnit: e.currentTarget.value as Settings['remoteUnit'] })}>
              <option value="sentence">한 문장</option>
              <option value="15s">15초</option>
              <option value="chapter">한 챕터</option>
            </select>
          </div>
          <div className="row">
            <span>책 패키지</span>
            <button
              type="button"
              onClick={async () => {
                save()
                downloadJson(await exportBooks([loaded.meta.id]), `${safeFileName(meta.title)}.abr.json`)
              }}
            >
              이 책 내보내기(.json)
            </button>
          </div>
          <div className="row">
            <span>북마크</span>
            <button type="button" onClick={() => addBookmark(Math.max(0, player.currentIndex()), engine.currentMs)}>
              지금 위치 추가
            </button>
          </div>
          {meta.bookmarks.length > 0 && (
            <ul className="bookmarks">
              {meta.bookmarks.map((b) => (
                <li key={b.createdAt}>
                  <button
                    type="button"
                    className="link"
                    disabled={seekLocked}
                    onClick={() => {
                      repeat.seekManual(b.ms)
                      setFollowing(true)
                      setMenu(null)
                    }}
                  >
                    <span className="time">{formatTime(b.ms)}</span> {b.label}
                  </button>
                  <button
                    type="button"
                    className="icon"
                    aria-label="북마크 삭제"
                    onClick={() => updateMeta({ bookmarks: meta.bookmarks.filter((x) => x !== b) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loaded.meta.bookFormat && (
            <>
              <div className="row">
                <span>보기 방식</span>
                <div className="seg-toggle">
                  <button type="button" className={!loaded.meta.forceSrt ? 'on' : ''} onClick={() => loaded.meta.forceSrt && void redo('책 모드로 여는 중…', { forceSrt: false })}>
                    책 원문
                  </button>
                  <button type="button" className={loaded.meta.forceSrt ? 'on' : ''} onClick={() => !loaded.meta.forceSrt && void redo('자막 보기로 바꾸는 중…', { forceSrt: true })}>
                    자막
                  </button>
                </div>
              </div>
              {!loaded.meta.forceSrt && (
                <div className="row">
                  <span>정렬 허용치</span>
                  <select
                    value={loaded.meta.tolerance ?? 'normal'}
                    onChange={(e) => void redo('다시 정렬하는 중…', { tolerance: e.currentTarget.value as Tolerance })}
                  >
                    <option value="strict">엄격(확실할 때만)</option>
                    <option value="normal">보통</option>
                    <option value="loose">관대(최대한 맞춤)</option>
                  </select>
                </div>
              )}
            </>
          )}
          <p className="meta-info">
            {stats
              ? `책 모드 · 자막 ${stats.cues}줄 중 ${Math.round((100 * stats.matchedCues) / Math.max(1, stats.cues))}% 매칭 · 낭독 문장 ${stats.timedSentences}/${stats.sentences}`
              : '자막 보기'}{' '}
            {stats && (
              <button type="button" className="link-inline" onClick={() => setMenu({ kind: 'report' })}>
                정렬 리포트
              </button>
            )}
          </p>
        </Sheet>
      )}
    </div>
  )
}

function SentenceMenu(props: {
  disabled: boolean
  onRepeat: () => void
  onFrom: () => void
  onTo: () => void
  onBookmark: () => void
  onCopy: () => void
  /** 책 모드에서만: 지금 재생 위치에 맞추기(F16) */
  onAnchor: (() => void) | null
  close: () => void
}) {
  const item = (label: string, fn: () => void, needsSeg = true) => (
    <button
      type="button"
      className="menu-item"
      disabled={needsSeg && props.disabled}
      onClick={() => {
        fn()
        props.close()
      }}
    >
      {label}
    </button>
  )
  return (
    <div className="menu">
      {props.disabled && <p className="meta-info">낭독되지 않은 문장입니다.</p>}
      {item('이 문장 반복', props.onRepeat)}
      {item('여기서부터 반복', props.onFrom)}
      {item('여기까지 반복', props.onTo)}
      {item('북마크', props.onBookmark)}
      {props.onAnchor && item('지금 재생 위치에 맞추기', props.onAnchor, false)}
      {item('복사', props.onCopy, false)}
    </div>
  )
}

function segmentText(loaded: LoadedBook, seg: number): string {
  const s = loaded.timeline.segments[seg]
  if (!s) return ''
  if (s.sentence !== undefined && loaded.book) {
    const x = loaded.book.sentences[s.sentence]
    return loaded.book.text.slice(x.start, x.end)
  }
  return loaded.cues
    .slice(s.cueStart, s.cueEnd)
    .map((c) => c.text)
    .join(' ')
}

function sentencePreview(loaded: LoadedBook, t: { seg: number; sent: number | null }, max = 60): string {
  let text = ''
  if (t.sent !== null && loaded.book) {
    const x = loaded.book.sentences[t.sent]
    text = loaded.book.text.slice(x.start, x.end)
  } else text = segmentText(loaded, t.seg)
  return text.length > max ? text.slice(0, max) + '…' : text
}
