import type { AudioEngine } from '../core/audioEngine'

const EVENTS = ['play', 'pause', 'seeked', 'timeupdate', 'durationchange', 'ratechange', 'ended', 'loadedmetadata'] as const

/** <audio src=objectURL> 스트리밍 재생(NFR-01). 화면이 켜져 있으면 rAF로, 꺼지면 timeupdate로 갱신 */
export class HtmlAudioEngine implements AudioEngine {
  readonly el: HTMLAudioElement
  private listeners = new Set<() => void>()
  private raf = 0

  constructor(src: string) {
    this.el = new Audio()
    this.el.preload = 'metadata'
    this.el.preservesPitch = true
    this.el.src = src
    for (const e of EVENTS) this.el.addEventListener(e, this.onEvent)
  }

  get currentMs() {
    return this.el.currentTime * 1000
  }
  get durationMs() {
    return Number.isFinite(this.el.duration) ? this.el.duration * 1000 : 0
  }
  get paused() {
    return this.el.paused
  }
  get playbackRate() {
    return this.el.playbackRate
  }
  set playbackRate(r: number) {
    this.el.playbackRate = r
  }

  play() {
    return this.el.play()
  }
  pause() {
    this.el.pause()
  }
  seek(ms: number) {
    this.el.currentTime = ms / 1000
    this.emit()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** 엔진을 버릴 때 호출. objectURL 해제는 만든 쪽 책임 */
  dispose() {
    cancelAnimationFrame(this.raf)
    for (const e of EVENTS) this.el.removeEventListener(e, this.onEvent)
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.listeners.clear()
  }

  private onEvent = (ev: Event) => {
    if (ev.type === 'play') this.tick()
    this.emit()
  }

  private tick = () => {
    cancelAnimationFrame(this.raf)
    if (this.el.paused) return
    this.emit()
    this.raf = requestAnimationFrame(this.tick)
  }

  private emit() {
    for (const l of this.listeners) l()
  }
}
