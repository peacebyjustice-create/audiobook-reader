// 잠금화면·알림·이어폰 버튼(PRD F20, 질문지 Q5 B·Q6 D). <audio>로 재생해야 Android 알림이 뜸
import { useEffect } from 'react'
import type { HtmlAudioEngine } from '../audio/htmlAudioEngine'
import type { Chapter } from '../core/chapters'
import { chapterAt } from '../core/chapters'
import type { Player } from '../core/player'
import type { RepeatController } from '../core/repeat'

export type RemoteUnit = 'sentence' | '15s' | 'chapter'

const SKIP_MS = 15_000
/** 챕터 시작 후 이 시간 안에 '이전'을 누르면 앞 챕터로 */
const CHAPTER_PREV_GRACE_MS = 3000

export function useMediaSession(opts: {
  engine: HtmlAudioEngine
  player: Player
  repeat: RepeatController
  chapters: readonly Chapter[]
  title: string
  chapterTitle: string | null
  unit: RemoteUnit
  seekLocked: boolean
}) {
  const { engine, player, repeat, chapters, title, chapterTitle, unit, seekLocked } = opts
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null

  useEffect(() => {
    if (!ms || typeof MediaMetadata === 'undefined') return
    ms.metadata = new MediaMetadata({ title, artist: '오디오북리더', album: chapterTitle ?? '' })
  }, [ms, title, chapterTitle])

  useEffect(() => {
    if (!ms) return
    const skip = (d: number) => repeat.seekManual(Math.max(0, Math.min(engine.durationMs, engine.currentMs + d)))
    const chapterStep = (dir: -1 | 1) => {
      const k = chapterAt(chapters, player.currentIndex())
      let target = k + dir
      if (dir < 0 && k >= 0 && player.textTime() - chapters[k].startMs > CHAPTER_PREV_GRACE_MS) target = k
      const c = chapters[Math.max(0, Math.min(chapters.length - 1, target))]
      if (c) repeat.seekManual(player.audioStart(c.seg))
    }
    const step = (dir: -1 | 1) => {
      if (unit === 'sentence') return dir < 0 ? repeat.prev() : repeat.next()
      if (unit === '15s') return skip(dir * SKIP_MS)
      chapterStep(dir)
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => void engine.play()],
      ['pause', () => engine.pause()],
      ['previoustrack', seekLocked ? null : () => step(-1)],
      ['nexttrack', seekLocked ? null : () => step(1)],
      ['seekbackward', seekLocked ? null : (d) => skip(-(d.seekOffset ?? 15) * 1000)],
      ['seekforward', seekLocked ? null : (d) => skip((d.seekOffset ?? 15) * 1000)],
      ['seekto', seekLocked ? null : (d) => d.seekTime !== undefined && repeat.seekManual(d.seekTime * 1000)],
    ]
    for (const [a, h] of handlers) {
      try {
        ms.setActionHandler(a, h)
      } catch {
        // 지원하지 않는 동작은 건너뜀
      }
    }
    return () => {
      for (const [a] of handlers) {
        try {
          ms.setActionHandler(a, null)
        } catch {
          // 무시
        }
      }
    }
  }, [ms, engine, player, repeat, chapters, unit, seekLocked])

  // 재생 상태와 위치(잠금화면 진행바)
  useEffect(() => {
    if (!ms) return
    const update = () => {
      ms.playbackState = engine.paused ? 'paused' : 'playing'
      const duration = engine.durationMs / 1000
      if (!(duration > 0)) return
      try {
        ms.setPositionState({ duration, position: Math.min(duration, engine.currentMs / 1000), playbackRate: engine.playbackRate || 1 })
      } catch {
        // 일부 브라우저는 위치 정보를 받지 않음
      }
    }
    const events = ['play', 'pause', 'seeked', 'durationchange', 'ratechange', 'loadedmetadata'] as const
    for (const e of events) engine.el.addEventListener(e, update)
    update()
    return () => {
      for (const e of events) engine.el.removeEventListener(e, update)
    }
  }, [ms, engine])
}
