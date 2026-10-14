import type { Cue } from './srt'

/** M0 임시 문단 나누기: 큐 사이 무음이 gapMs 이상이면 새 문단. 반환값은 문단별 [시작, 끝) 큐 위치 */
export function groupBySilence(cues: readonly Cue[], gapMs = 2000): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  for (let i = 1; i <= cues.length; i++) {
    if (i === cues.length || cues[i].startMs - cues[i - 1].endMs >= gapMs) {
      if (i > start) out.push([start, i])
      start = i
    }
  }
  return out
}
