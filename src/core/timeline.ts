// 재생 단위 타임라인: 책 모드는 시각이 붙은 문장 + 오디오 전용 구간, 자막 보기는 문장 단위로 묶은 큐.
// 이동·강조·반복은 모두 이 목록의 위치(segment index)로 함
import type { Alignment } from './align'
import type { Book } from './book'
import type { Lang } from './normalize'
import { bundleCues } from './paragraphs'
import type { Cue } from './srt'

export type SegmentKind = 'sentence' | 'audio' | 'cue'

export interface Segment {
  /** 저장용 보조 ID(NFR-09): s<문장>, a<첫 큐>, c<묶음의 첫 큐> */
  id: string
  kind: SegmentKind
  startMs: number
  endMs: number
  /** sentence: 책 문장 위치 */
  sentence?: number
  /** audio·cue: 큐 범위 [cueStart, cueEnd) */
  cueStart?: number
  cueEnd?: number
}

export interface Timeline {
  segments: Segment[]
  /** 책 문장 → 세그먼트 위치(시각 없는 문장은 -1) */
  sentenceSeg: Int32Array
}

/** 자막 보기 타임라인: 문장이 끝나는 큐까지 묶은 단위(Q13 B) */
export function cueTimeline(cues: readonly Cue[], lang: Lang = 'en'): Timeline {
  return {
    segments: bundleCues(cues, lang).map(([a, b]) => ({
      id: `c${a}`,
      kind: 'cue',
      startMs: cues[a].startMs,
      endMs: cues[b - 1].endMs,
      cueStart: a,
      cueEnd: b,
    })),
    sentenceSeg: new Int32Array(0),
  }
}

/** 책 모드 타임라인. 연속된 오디오 전용 큐는 한 구간으로 묶음 */
export function bookTimeline(book: Book, cues: readonly Cue[], al: Alignment): Timeline {
  const segs: Segment[] = []
  al.sentences.forEach((t, i) => {
    if (t.startMs >= 0) segs.push({ id: `s${i}`, kind: 'sentence', startMs: t.startMs, endMs: t.endMs, sentence: i })
  })
  for (let k = 0; k < cues.length; ) {
    if (al.cues[k].kind !== 'audioOnly') {
      k++
      continue
    }
    let e = k
    while (e < cues.length && al.cues[e].kind === 'audioOnly') e++
    segs.push({ id: `a${k}`, kind: 'audio', startMs: cues[k].startMs, endMs: cues[e - 1].endMs, cueStart: k, cueEnd: e })
    k = e
  }
  segs.sort((a, b) => a.startMs - b.startMs || (a.kind === 'audio' ? -1 : 1))
  // 겹침 정리: 뒤 구간이 시작하면 앞 구간은 끝남. 오디오 전용 구간이 문장과 겹치면(문장 안에 끼어든 짧은 문구) 버림
  const out: Segment[] = []
  for (const s of segs) {
    const prev = out.at(-1)
    if (prev && s.kind === 'audio' && s.startMs < prev.endMs) continue
    if (prev && prev.endMs > s.startMs) prev.endMs = Math.max(prev.startMs, s.startMs)
    out.push(s)
  }
  const sentenceSeg = new Int32Array(book.sentences.length).fill(-1)
  out.forEach((s, i) => {
    if (s.sentence !== undefined) sentenceSeg[s.sentence] = i
  })
  return { segments: out, sentenceSeg }
}
