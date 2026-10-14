/** 재생기 추상화(NFR-10). 실제 구현은 src/audio/htmlAudioEngine.ts, 테스트는 FakeAudioEngine. */
export interface AudioEngine {
  readonly currentMs: number
  readonly durationMs: number
  readonly paused: boolean
  /** 재생할 수 없을 때 사용자에게 보여 줄 문장. 정상이면 null */
  readonly error: string | null
  playbackRate: number
  play(): Promise<void>
  pause(): void
  seek(ms: number): void
  /** 재생 상태·시각이 바뀌면 호출. 해제 함수를 돌려줌 */
  subscribe(listener: () => void): () => void
}

/** 가짜 시계로 움직이는 엔진. advance(ms)로 시간을 흘림 */
export class FakeAudioEngine implements AudioEngine {
  currentMs = 0
  paused = true
  error: string | null = null
  playbackRate = 1
  durationMs: number
  private listeners = new Set<() => void>()
  constructor(durationMs: number) {
    this.durationMs = durationMs
  }

  async play() {
    this.paused = false
    this.emit()
  }
  pause() {
    this.paused = true
    this.emit()
  }
  seek(ms: number) {
    this.currentMs = Math.min(Math.max(0, ms), this.durationMs)
    this.emit()
  }
  advance(ms: number) {
    if (this.paused) return
    this.currentMs = Math.min(this.currentMs + ms * this.playbackRate, this.durationMs)
    if (this.currentMs >= this.durationMs) this.paused = true
    this.emit()
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
  private emit() {
    for (const l of this.listeners) l()
  }
}
