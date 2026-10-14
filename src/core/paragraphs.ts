// 자막 보기(책 원문 없음·정렬 실패 시)의 문장·문단 재구성(PRD F18, 질문지 Q13 B·Q15 B)
import type { Lang } from './normalize'
import type { Cue } from './srt'

interface Span {
  startMs: number
  endMs: number
}

/** 큐 사이 무음이 gapMs 이상이면 새 문단. 반환값은 문단별 [시작, 끝) 위치 */
export function groupBySilence(spans: readonly Span[], gapMs = PARAGRAPH_GAP_MS): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  for (let i = 1; i <= spans.length; i++) {
    if (i === spans.length || spans[i].startMs - spans[i - 1].endMs >= gapMs) {
      if (i > start) out.push([start, i])
      start = i
    }
  }
  return out
}

/** 문단을 나누는 무음. 샘플 큐 간격 p90이 1.44초라 그보다 길게 잡음 */
export const PARAGRAPH_GAP_MS = 2000
/** 문장부호 없이도 문장 끝으로 보는 무음 */
const SENTENCE_GAP_MS = 1500
/** 한국어 종결어미 + 이 정도 무음이면 문장 끝 */
const KO_ENDING_GAP_MS = 300
/** 묶음이 너무 길어지지 않게 하는 상한 */
const MAX_BUNDLE_MS = 30_000

const TERMINATOR = /[.!?…。！？]["'”’)\]」』]*$/
const KO_ENDING = /(?:다|요|까|죠|니다|네|라)$/

/**
 * 문장이 끝나는 큐까지 이어 붙여 한 단위로 묶음. 큐 안쪽은 자르지 않음(시각 오차 0).
 * 문장 끝: 문장부호, 한국어 종결어미 + 짧은 무음, 또는 긴 무음
 */
export function bundleCues(cues: readonly Cue[], lang: Lang = 'en'): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  for (let i = 0; i < cues.length; i++) {
    const text = cues[i].text.trim()
    const gap = i + 1 < cues.length ? cues[i + 1].startMs - cues[i].endMs : Infinity
    const ends =
      TERMINATOR.test(text) ||
      (lang === 'ko' && KO_ENDING.test(text) && gap >= KO_ENDING_GAP_MS) ||
      gap >= SENTENCE_GAP_MS ||
      cues[i].endMs - cues[start].startMs >= MAX_BUNDLE_MS
    if (ends) {
      out.push([start, i + 1])
      start = i + 1
    }
  }
  return out
}
