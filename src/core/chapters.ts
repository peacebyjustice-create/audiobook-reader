// 챕터 목차(PRD F19, 질문지 Q31 B): 자동 레벨 + 패턴 + 시간 분할 폴백
import type { Book } from './book'
import type { Cue } from './srt'
import type { Timeline } from './timeline'

export interface Chapter {
  title: string
  /** 0 = 챕터, 1 = 절 */
  depth: 0 | 1
  /** 이 챕터가 시작하는 세그먼트 */
  seg: number
  startMs: number
}

/** 제목이 없을 때 나누는 간격 */
export const FALLBACK_SPLIT_MS = 20 * 60_000

/**
 * 책 모드: 두 번 이상 나오는 가장 상위 제목 레벨 = 챕터, 그 아래에 실제로 있는 다음 레벨 = 절.
 * 낭독되지 않은 제목(뒤에 시각 있는 문장이 다음 제목 전까지 없음)은 뺌
 */
export function bookChapters(book: Book, tl: Timeline, cues: readonly Cue[]): Chapter[] {
  const headings = book.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'heading')
  const counts = new Map<number, number>()
  for (const { b } of headings) counts.set(b.level, (counts.get(b.level) ?? 0) + 1)
  const levels = [...counts.keys()].sort((a, b) => a - b)
  const top = levels.find((l) => (counts.get(l) ?? 0) >= 2)
  if (top === undefined) return timeChapters(tl, cues)
  const sub = levels.find((l) => l > top)

  // 블록 → 그 블록부터 처음 나오는 시각 있는 세그먼트
  const firstSentOfBlock = new Int32Array(book.blocks.length).fill(-1)
  book.sentences.forEach((s, i) => {
    if (firstSentOfBlock[s.block] < 0) firstSentOfBlock[s.block] = i
  })
  const segFromBlock = (block: number, untilBlock: number) => {
    for (let s = firstSentOfBlock[block]; s >= 0 && s < book.sentences.length && book.sentences[s].block < untilBlock; s++) {
      if (tl.sentenceSeg[s] >= 0) return tl.sentenceSeg[s]
    }
    return -1
  }

  const out: Chapter[] = []
  const picked = headings.filter(({ b }) => b.level === top || b.level === sub)
  picked.forEach(({ b, i }, k) => {
    const until = k + 1 < picked.length ? picked[k + 1].i : book.blocks.length
    const seg = segFromBlock(i, until)
    if (seg < 0) return
    out.push({ title: book.text.slice(b.start, b.end), depth: b.level === top ? 0 : 1, seg, startMs: tl.segments[seg].startMs })
  })
  return out.length ? out : timeChapters(tl, cues)
}

const SRT_CHAPTER = /^(?:chapter|part)\s+[\w-]+\b|^제\s*[\d一二三四五六七八九十]+\s*[장부편]|^\d+\s*장\b|^(?:prologue|epilogue|introduction|프롤로그|에필로그)\b/i

/** 자막 보기: '제n장'·'Chapter n' 낭독 패턴, 없으면 시간 분할 */
export function srtChapters(tl: Timeline, cues: readonly Cue[]): Chapter[] {
  const out: Chapter[] = []
  tl.segments.forEach((s, i) => {
    const text = cues[s.cueStart ?? 0]?.text.trim() ?? ''
    if (text.length <= 60 && SRT_CHAPTER.test(text)) out.push({ title: text.replace(/[.,:]+$/, ''), depth: 0, seg: i, startMs: s.startMs })
  })
  return out.length >= 2 ? out : timeChapters(tl, cues)
}

function timeChapters(tl: Timeline, cues: readonly Cue[]): Chapter[] {
  const segs = tl.segments
  if (!segs.length) return []
  const end = cues.at(-1)?.endMs ?? segs.at(-1)!.endMs
  const out: Chapter[] = []
  for (let t = 0, n = 1; t < end; t += FALLBACK_SPLIT_MS, n++) {
    const seg = segs.findIndex((s) => s.startMs >= t)
    if (seg < 0 || out.at(-1)?.seg === seg) continue
    out.push({ title: `${n}부`, depth: 0, seg, startMs: segs[seg].startMs })
  }
  return out
}

/** 세그먼트 i가 속한 목차 항목 위치(-1이면 첫 항목 전) */
export function chapterAt(chapters: readonly Chapter[], seg: number): number {
  let ans = -1
  for (let k = 0; k < chapters.length && chapters[k].seg <= seg; k++) ans = k
  return ans
}
