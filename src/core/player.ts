import type { AudioEngine } from './audioEngine'
import type { Cue } from './srt'
import { findIndexAt, nextTarget, prevTarget } from './navigation'

/** 큐 목록과 엔진을 묶어 문장 단위 이동을 제공. DOM 없음 */
export class Player {
  readonly engine: AudioEngine
  readonly cues: readonly Cue[]
  private readonly starts: Float64Array

  constructor(engine: AudioEngine, cues: readonly Cue[]) {
    this.engine = engine
    this.cues = cues
    this.starts = Float64Array.from(cues, (c) => c.startMs)
  }

  /** 지금 강조할 큐. 첫 큐 이전이면 -1 */
  currentIndex(): number {
    return findIndexAt(this.starts, this.engine.currentMs)
  }

  seekToCue(i: number) {
    const cue = this.cues[i]
    if (cue) this.engine.seek(cue.startMs)
  }

  /** 문장을 탭: 그 문장부터 재생(FR-09) */
  async playFrom(i: number) {
    this.seekToCue(i)
    if (this.engine.paused) await this.engine.play()
  }

  prev() {
    this.seekToCue(prevTarget(this.starts, this.engine.currentMs))
  }

  next() {
    this.seekToCue(nextTarget(this.starts, this.engine.currentMs))
  }

  async togglePlay() {
    if (this.engine.paused) await this.engine.play()
    else this.engine.pause()
  }
}
