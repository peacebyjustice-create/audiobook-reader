import type { AudioEngine } from './audioEngine'
import { findIndexAt, PREV_GRACE_MS } from './navigation'

export interface TimedSpan {
  startMs: number
  endMs: number
}

/** 재생 단위 목록과 엔진을 묶어 문장 단위 이동을 제공. DOM 없음 */
export class Player {
  readonly engine: AudioEngine
  readonly spans: readonly TimedSpan[]
  /** 책별 전역 오프셋(FR-11): 양수면 글자 시각보다 소리가 늦음. 실제 오디오 시각 = 글자 시각 + offsetMs */
  offsetMs = 0
  private readonly starts: Float64Array

  constructor(engine: AudioEngine, spans: readonly TimedSpan[]) {
    this.engine = engine
    this.spans = spans
    this.starts = Float64Array.from(spans, (c) => c.startMs)
  }

  setOffset(ms: number) {
    this.offsetMs = ms
  }

  get length() {
    return this.spans.length
  }

  /** 글자 기준 현재 시각 */
  textTime(): number {
    return this.engine.currentMs - this.offsetMs
  }

  /** 단위 i의 오디오 시작·끝 시각 */
  audioStart(i: number): number {
    return this.spans[i].startMs + this.offsetMs
  }
  audioEnd(i: number): number {
    return this.spans[i].endMs + this.offsetMs
  }

  /** 지금 강조할 단위. 첫 단위 이전이면 -1. 단위 사이 무음에서는 직전 단위 유지 */
  currentIndex(): number {
    return findIndexAt(this.starts, this.textTime())
  }

  seekTo(i: number, leadMs = 0) {
    if (i < 0 || i >= this.spans.length) return
    this.engine.seek(Math.max(0, this.audioStart(i) - leadMs))
  }

  /** 탭: 그 단위부터 재생(FR-09) */
  async playFrom(i: number) {
    this.seekTo(i)
    if (this.engine.paused) await this.engine.play()
  }

  /** '이전' 대상: 시작 1.5초 안이면 이전 단위, 그 뒤면 현재 단위 처음(FR-06) */
  prevIndex(): number {
    if (!this.spans.length) return -1
    const i = this.currentIndex()
    if (i < 0) return 0
    return this.textTime() - this.starts[i] < PREV_GRACE_MS ? Math.max(0, i - 1) : i
  }

  nextIndex(): number {
    if (!this.spans.length) return -1
    return Math.min(this.spans.length - 1, this.currentIndex() + 1)
  }

  prev() {
    this.seekTo(this.prevIndex())
  }

  next() {
    this.seekTo(this.nextIndex())
  }

  async togglePlay() {
    if (this.engine.paused) await this.engine.play()
    else this.engine.pause()
  }
}
