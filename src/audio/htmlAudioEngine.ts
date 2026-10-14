import type { AudioEngine } from '../core/audioEngine'

const EVENTS = ['play', 'pause', 'seeked', 'timeupdate', 'durationchange', 'ratechange', 'ended', 'loadedmetadata', 'error'] as const

/** MediaError 코드 → 안내 문장 */
function describeError(err: MediaError | null): string | null {
  if (!err) return null
  switch (err.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
    case MediaError.MEDIA_ERR_DECODE:
      return '이 오디오는 브라우저가 재생할 수 없는 형식(코덱)입니다. AAC로 된 m4a나 mp3로 변환해 주세요. 예: ffmpeg -i 입력 -c:a aac -b:a 64k -ac 1 -movflags +faststart 출력.m4a'
    case MediaError.MEDIA_ERR_NETWORK:
      return '오디오 파일을 읽는 중 문제가 생겼습니다. 파일을 다시 골라 주세요.'
    default:
      return '오디오 재생 중 오류가 생겼습니다.'
  }
}

/** <audio src=objectURL> 스트리밍 재생(NFR-01). 화면이 켜져 있으면 rAF로, 꺼지면 timeupdate로 갱신 */
export class HtmlAudioEngine implements AudioEngine {
  readonly el: HTMLAudioElement
  private listeners = new Set<() => void>()
  private raf = 0
  /** 해제된 뒤에도 마지막 위치를 돌려줌(닫을 때 진도 저장이 해제보다 늦게 실행될 수 있음) */
  private final: { ms: number; dur: number } | null = null

  constructor(src: string) {
    this.el = new Audio()
    this.el.preload = 'metadata'
    this.el.preservesPitch = true
    this.el.src = src
    for (const e of EVENTS) this.el.addEventListener(e, this.onEvent)
  }

  get currentMs() {
    return this.final ? this.final.ms : this.el.currentTime * 1000
  }
  get durationMs() {
    if (this.final) return this.final.dur
    return Number.isFinite(this.el.duration) ? this.el.duration * 1000 : 0
  }
  get paused() {
    return this.el.paused
  }
  get error() {
    return describeError(this.el.error)
  }
  get playbackRate() {
    return this.el.playbackRate
  }
  set playbackRate(r: number) {
    // 새 파일을 불러오면 playbackRate가 defaultPlaybackRate로 초기화되므로 둘 다 맞춤
    this.el.defaultPlaybackRate = r
    this.el.playbackRate = r
  }

  setRate(r: number) {
    this.playbackRate = r
  }

  /** 재생할 수 없는 파일이면 거부 대신 error 속성으로 알림 */
  play() {
    return this.el.play().catch(() => this.emit())
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
    this.final = { ms: this.currentMs, dur: this.durationMs }
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
