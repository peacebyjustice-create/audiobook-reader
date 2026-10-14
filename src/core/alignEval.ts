// 정렬 품질 평가(골든 테스트·리포트용). 정렬 결과와 독립적으로, 매칭된 책 범위에 큐 글자가 실제로 들어 있는지 다시 확인함.
import { cueTextForAlign, DEFAULT_AUDIO_ONLY, type Alignment } from './align'
import type { Book } from './book'
import { normalizeText } from './normalize'
import type { Cue } from './srt'

export interface Evaluation {
  /** 고정 안내 문구와, 책에 해당 글이 아예 없는 큐를 뺀 큐 수 */
  bodyCues: number
  /** 연속으로 매칭 안 된 큐 묶음에서, 앞뒤 매칭 큐 사이 책 글자가 묶음 글자의 30% 미만이라 매칭할 대상이 없는 큐(오디오 전용이 정답) */
  noBookTextCues: number
  matchedBodyCues: number
  /** 매칭 범위의 책 글자와 큐 글자의 공통 부분수열이 큐 글자의 70% 이상(숫자 읽기 차이 허용)이고, 범위가 지나치게 넓지 않음 */
  correctCues: number
  correctRatio: number
  introOutroAudioOnly: boolean
  timedSentenceRatio: number
  nonMonotonic: number
}

function lcsLength(x: string, y: string): number {
  let prev = new Int32Array(y.length + 1)
  let cur = new Int32Array(y.length + 1)
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++)
      cur[j] = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    ;[prev, cur] = [cur, prev]
  }
  return prev[y.length]
}

export function evaluate(book: Book, cues: readonly Cue[], al: Alignment): Evaluation {
  const forced = cues.map((cue) => DEFAULT_AUDIO_ONLY.some((p) => p.test(cue.text)))
  const norms = cues.map((cue) => normalizeText(cueTextForAlign(cue.text), al.lang).norm)
  // 연속으로 매칭 안 된 큐 묶음마다, 앞뒤 매칭 큐 사이에 책 글자가 얼마나 남는지
  const noBookText = new Uint8Array(cues.length)
  for (let k = 0; k < cues.length; ) {
    if (al.cues[k].kind === 'matched') {
      k++
      continue
    }
    let e = k
    while (e < cues.length && al.cues[e].kind !== 'matched') e++
    const from = k > 0 ? al.cues[k - 1].bookEnd : 0
    const to = e < cues.length ? al.cues[e].bookStart : book.text.length
    const gap = normalizeText(book.text.slice(from, Math.max(from, to)), al.lang).norm.length
    let runLen = 0
    for (let i = k; i < e; i++) if (!forced[i]) runLen += norms[i].length
    if (gap < 0.3 * runLen) noBookText.fill(1, k, e)
    k = e
  }
  let noBookTextCues = 0
  let bodyCues = 0
  let matchedBodyCues = 0
  let correctCues = 0
  cues.forEach((_, k) => {
    if (forced[k]) return
    const c = norms[k]
    if (!c) return
    const m = al.cues[k]
    if (noBookText[k]) {
      noBookTextCues++
      return
    }
    bodyCues++
    if (m.kind !== 'matched') return
    matchedBodyCues++
    const span = normalizeText(book.text.slice(m.bookStart, m.bookEnd), al.lang).norm
    if (span.length <= c.length * 2 + 20 && lcsLength(c, span) >= 0.7 * c.length) correctCues++
  })
  let nonMonotonic = 0
  let prev = -1
  for (const s of al.sentences) {
    if (s.startMs < 0) continue
    if (s.startMs < prev) nonMonotonic++
    prev = s.startMs
  }
  const first = al.cues[0]
  const last = al.cues.at(-1)
  return {
    bodyCues,
    noBookTextCues,
    matchedBodyCues,
    correctCues,
    correctRatio: bodyCues ? correctCues / bodyCues : 1,
    introOutroAudioOnly: first?.kind === 'audioOnly' && last?.kind === 'audioOnly',
    timedSentenceRatio: al.stats.sentences ? al.stats.timedSentences / al.stats.sentences : 0,
    nonMonotonic,
  }
}
