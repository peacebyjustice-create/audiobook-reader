// 구간반복 상태 기계(PRD F11·F12·F13, 질문지 Q25 C·Q26 B·Q27 B, K7). DOM 없음.
import type { Player } from './player'

export interface RepeatSettings {
  /** 반복 횟수. 0이면 무한 */
  count: number
  /** 반복 사이 쉬는 시간 */
  gapMs: number
  /** 앞뒤 여유(NFR-04) */
  padStartMs: number
  padEndMs: number
  /** 문장이 바뀐 지 이 시간 안에 누르면 직전 문장 기준(규칙 1) */
  graceMs: number
}

export const DEFAULT_REPEAT: RepeatSettings = { count: 0, gapMs: 0, padStartMs: 150, padEndMs: 200, graceMs: 700 }

export type RepeatState =
  | { mode: 'off' }
  | { mode: 'armed'; start: number }
  | { mode: 'loop'; start: number; end: number; done: number }

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

export interface WrapEvent {
  /** 반복 끝점을 넘어간 정도(진단용) */
  overshootMs: number
  loopEndMs: number
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as number),
}

export class RepeatController {
  state: RepeatState = { mode: 'off' }
  settings: RepeatSettings
  onWrap?: (e: WrapEvent) => void
  private readonly player: Player
  private readonly timers: Timers
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void
  private endTimer: unknown = null
  private gapTimer: unknown = null
  /** 되돌리는 중 엔진 이벤트로 다시 들어오는 것을 막음 */
  private wrapping = false

  constructor(player: Player, settings: RepeatSettings = DEFAULT_REPEAT, timers: Timers = realTimers) {
    this.player = player
    this.settings = settings
    this.timers = timers
    this.unsubscribe = player.engine.subscribe(this.check)
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  setSettings(s: RepeatSettings) {
    this.settings = s
    this.check()
  }

  dispose() {
    this.clearTimers()
    this.unsubscribe()
    this.listeners.clear()
  }

  /** 버튼을 누른 순간 기준 단위: 재생 중이면 유예 시간 적용(규칙 1), 일시정지 중이면 강조된 단위(규칙 2) */
  pressTarget(): number {
    const p = this.player
    const i = Math.max(0, p.currentIndex())
    if (!p.engine.paused && i > 0 && p.textTime() - p.spans[i].startMs < this.settings.graceMs) return i - 1
    return i
  }

  /** 반복 버튼: 꺼짐 → 시작 표시 → 구간 반복 → 꺼짐(Q25 B·C) */
  press() {
    const s = this.state
    if (s.mode === 'off') this.set({ mode: 'armed', start: this.pressTarget() })
    else if (s.mode === 'armed') {
      // 끝을 시작보다 앞에서 누르면 순서를 바꿈(규칙 3). 누르는 순간에는 이동하지 않음(규칙 4)
      const e = this.pressTarget()
      this.set({ mode: 'loop', start: Math.min(s.start, e), end: Math.max(s.start, e), done: 0 })
    } else this.cancel()
  }

  /** 반복 버튼 길게 누르기: 지금 문장만 반복 */
  repeatCurrent() {
    const i = this.pressTarget()
    this.set({ mode: 'loop', start: i, end: i, done: 0 })
  }

  /** 문장 메뉴: 이 문장 반복 */
  repeatSentence(i: number) {
    this.set({ mode: 'loop', start: i, end: i, done: 0 })
    this.restartLoop()
  }

  /** 문장 메뉴: 여기서부터 반복 */
  repeatFrom(i: number) {
    const s = this.state
    if (s.mode === 'loop') {
      this.set({ mode: 'loop', start: Math.min(i, s.end), end: Math.max(i, s.end), done: 0 })
      this.restartLoop()
    } else this.set({ mode: 'armed', start: i })
  }

  /** 문장 메뉴: 여기까지 반복. 시작 없이 끝만 정하면 그 문장 하나 */
  repeatTo(i: number) {
    const s = this.state
    const start = s.mode === 'armed' || s.mode === 'loop' ? s.start : i
    this.set({ mode: 'loop', start: Math.min(start, i), end: Math.max(start, i), done: 0 })
    if (!this.inLoop()) this.restartLoop()
  }

  cancel() {
    this.clearTimers()
    if (this.state.mode !== 'off') this.set({ mode: 'off' })
  }

  /** 이전/다음(Q26 B): 한 문장 반복이면 반복을 옮기고, 여러 문장 구간이면 해제 후 이동 */
  prev() {
    this.step(-1)
  }
  next() {
    this.step(1)
  }

  /** 문장 탭(규칙 6): 반복 해제 후 그 문장부터 재생 */
  async tap(i: number) {
    if (this.state.mode === 'loop') this.cancel()
    await this.player.playFrom(i)
  }

  /** 진행바 이동: 반복 해제 후 이동 */
  seekManual(ms: number) {
    if (this.state.mode === 'loop') this.cancel()
    this.player.engine.seek(ms)
  }

  /** 강조할 단위. 앞 여유 때문에 시작 직전 단위로 보이는 것을 막음 */
  displayIndex(): number {
    const i = this.player.currentIndex()
    const s = this.state
    if (s.mode === 'loop' && i < s.start && this.player.engine.currentMs >= this.player.audioStart(s.start) - this.settings.padStartMs - 50)
      return s.start
    return i
  }

  private step(dir: -1 | 1) {
    const s = this.state
    const p = this.player
    if (s.mode === 'loop' && s.start === s.end) {
      const j = Math.min(p.length - 1, Math.max(0, s.start + dir))
      this.set({ mode: 'loop', start: j, end: j, done: 0 })
      this.restartLoop()
      return
    }
    if (s.mode === 'loop') this.cancel()
    if (dir < 0) p.prev()
    else p.next()
  }

  private inLoop(): boolean {
    const s = this.state
    if (s.mode !== 'loop') return false
    const t = this.player.engine.currentMs
    return t >= this.player.audioStart(s.start) - this.settings.padStartMs && t < this.loopEnd()
  }

  private restartLoop() {
    const s = this.state
    if (s.mode !== 'loop') return
    this.clearTimers()
    this.player.seekTo(s.start, this.settings.padStartMs)
    if (this.player.engine.paused) void this.player.engine.play()
  }

  private loopEnd(): number {
    const s = this.state
    if (s.mode !== 'loop') return Infinity
    const end = this.player.audioEnd(s.end) + this.settings.padEndMs
    const dur = this.player.engine.durationMs
    // 마지막 문장이면 파일 끝 직전에서 되돌림(끝에 닿으면 재생이 멈춰 버림)
    return dur > 0 ? Math.min(end, dur - 50) : end
  }

  /** 엔진이 움직일 때마다 확인하고, 다음 확인은 남은 시간만큼 타이머로 예약(K7) */
  private check = () => {
    if (this.state.mode !== 'loop' || this.gapTimer !== null || this.wrapping) return
    const engine = this.player.engine
    const end = this.loopEnd()
    const t = engine.currentMs
    if (t >= end) {
      this.wrap(t, end)
      return
    }
    if (this.endTimer !== null) this.timers.clearTimeout(this.endTimer)
    this.endTimer = engine.paused ? null : this.timers.setTimeout(this.onEndTimer, (end - t) / (engine.playbackRate || 1))
  }

  private onEndTimer = () => {
    this.endTimer = null
    this.check()
  }

  private wrap(t: number, end: number) {
    this.wrapping = true
    try {
      this.doWrap(t, end)
    } finally {
      this.wrapping = false
    }
    this.check()
  }

  private doWrap(t: number, end: number) {
    const s = this.state
    if (s.mode !== 'loop') return
    this.onWrap?.({ overshootMs: t - end, loopEndMs: end })
    const done = s.done + 1
    const { count, gapMs, padStartMs } = this.settings
    if (count > 0 && done >= count) {
      // N회 후: 한 문장 반복이면 다음 문장으로, 구간이면 해제하고 계속 재생(Q27 B)
      if (s.start === s.end && s.end + 1 < this.player.length) {
        this.set({ mode: 'loop', start: s.end + 1, end: s.end + 1, done: 0 })
        this.player.seekTo(s.end + 1, padStartMs)
      } else this.cancel()
      return
    }
    this.set({ ...s, done })
    if (gapMs > 0) {
      this.player.engine.pause()
      this.gapTimer = this.timers.setTimeout(() => {
        this.gapTimer = null
        if (this.state.mode !== 'loop') return
        this.player.seekTo(this.state.start, padStartMs)
        void this.player.engine.play()
      }, gapMs)
    } else this.player.seekTo(s.start, padStartMs)
  }

  private clearTimers() {
    if (this.endTimer !== null) this.timers.clearTimeout(this.endTimer)
    if (this.gapTimer !== null) this.timers.clearTimeout(this.gapTimer)
    this.endTimer = null
    this.gapTimer = null
  }

  private set(s: RepeatState) {
    this.state = s
    for (const l of this.listeners) l()
    this.check()
  }
}
