// 책 본문 ↔ 전사 SRT 퍼지 정렬(PRD F5·F6, 질문지 R1). DOM 없음, Web Worker에서 실행.
import type { Book } from './book'
import { detectLang, normalizeText, normIndexAtOrAfter, type Lang } from './normalize'
import type { Cue } from './srt'

export const ALGORITHM_VERSION = 1
/** 정규화 후 글자 수 상한(NFR-02) */
export const ALIGN_INPUT_LIMIT = 2_000_000

export type Tolerance = 'strict' | 'normal' | 'loose'
/** 큐 신뢰도(정확히 일치한 글자 ÷ 큐 글자) 임계값(Q19) */
export const CUE_THRESHOLD: Record<Tolerance, number> = { strict: 0.5, normal: 0.35, loose: 0.2 }

/** 내용과 무관하게 '오디오 전용'으로 보는 큐: 낭독 도구가 끼워 넣는 안내 문구(샘플 1,415권에서 빈도 확인) */
export const DEFAULT_AUDIO_ONLY: readonly RegExp[] = [
  /^you(?:'|’| a)re listening to the short[- ]?form guide/i,
  /^this concludes the short[- ]?form guide/i,
  /^new (?:section|chapter)[.!]?$/i, // 구분선 자리
  /^question (?:number )?[\w-]+[.:]?$/i, // 번호 목록 머리
]

/** 큐 안에 섞여 나오는 안내 문구. 정렬 전에 큐 글자에서 지움 */
export const DEFAULT_AUDIO_ONLY_PHRASES: readonly RegExp[] = [
  /\bnew (?:section|chapter)\b[.!]?/gi,
  /\bquestion (?:number )?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[.:]?/gi,
]

/** 정렬에 쓰는 큐 글자: 안내 문구를 지운 것 */
export function cueTextForAlign(text: string, phrases: readonly RegExp[] = DEFAULT_AUDIO_ONLY_PHRASES): string {
  return phrases.reduce((s, p) => s.replace(p, ' '), text)
}

export interface AlignOptions {
  tolerance?: Tolerance
  /** 생략하면 책 글자로 판별 */
  lang?: Lang
  audioOnlyPatterns?: readonly RegExp[]
  audioOnlyPhrases?: readonly RegExp[]
  /** 사용자 보정(F16 '지금 재생 위치에 맞추기'): 책 문장 s는 글자 시각 ms에서 시작. 다시 정렬해도 유지 */
  anchors?: readonly ManualAnchor[]
}

export interface ManualAnchor {
  sentence: number
  ms: number
}

export interface CueMatch {
  kind: 'matched' | 'audioOnly'
  confidence: number
  /** 매칭된 책 원문 범위 [bookStart, bookEnd). 없으면 -1 */
  bookStart: number
  bookEnd: number
}

/** 문장 시각. 낭독되지 않은 문장은 startMs = endMs = -1 */
export interface SentenceTiming {
  startMs: number
  endMs: number
}

export interface AlignStats {
  cues: number
  matchedCues: number
  audioOnlyCues: number
  bookChars: number
  matchedBookChars: number
  sentences: number
  timedSentences: number
  elapsedMs: number
}

export interface Alignment {
  version: number
  lang: Lang
  tolerance: Tolerance
  cues: CueMatch[]
  sentences: SentenceTiming[]
  stats: AlignStats
}

const NGRAMS = [32, 16, 8]
const DP_LIMIT = 4_000_000
/** 이보다 짧은 일치 구간은 우연으로 보고 버림 */
const MIN_RUN = 4
/** 문장 경계가 큐 경계에서 이 글자 수 안이면 큐 경계로 맞춤(Q13) */
const SNAP_CHARS = 8
/** 문장 글자 중 이 비율 이상이 일치해야 '낭독됨' */
const SENTENCE_MIN_RATIO = 0.3

export function alignBook(book: Book, cues: readonly Cue[], opts: AlignOptions = {}): Alignment {
  const t0 = performance.now()
  const tolerance = opts.tolerance ?? 'normal'
  const patterns = opts.audioOnlyPatterns ?? DEFAULT_AUDIO_ONLY

  const lang = opts.lang ?? detectLang(book.text)
  const A = normalizeText(book.text, lang)
  // 큐 글자를 이어 붙인 전사 문자열. 고정 문구 큐는 빼서 책 제목 등에 잘못 붙지 않게 함
  const forced = cues.map((c) => patterns.some((p) => p.test(c.text)))
  const cueStartB = new Int32Array(cues.length)
  const cueEndB = new Int32Array(cues.length)
  let B = ''
  for (let k = 0; k < cues.length; k++) {
    cueStartB[k] = B.length
    if (!forced[k]) B += normalizeText(cueTextForAlign(cues[k].text, opts.audioOnlyPhrases), lang).norm
    cueEndB[k] = B.length
  }
  if (A.norm.length > ALIGN_INPUT_LIMIT || B.length > ALIGN_INPUT_LIMIT)
    throw new Error(`정렬 입력이 상한(${ALIGN_INPUT_LIMIT}자)을 넘습니다`)
  const cueOf = new Int32Array(B.length)
  for (let k = 0; k < cues.length; k++) cueOf.fill(k, cueStartB[k], cueEndB[k])

  // 수동 앵커: 책 문장 시작 ↔ 그 시각의 전사 위치를 고정점으로 삼아 구간을 나눠 정렬
  const anchorPoints: [number, number][] = []
  const anchorMs = new Map<number, number>()
  for (const an of [...(opts.anchors ?? [])].sort((x, y) => x.ms - y.ms)) {
    const s = book.sentences[an.sentence]
    if (!s || !cues.length) continue
    const a = normIndexAtOrAfter(A.map, s.start)
    const b = transcriptPosAt(cues, cueStartB, cueEndB, an.ms)
    const last = anchorPoints.at(-1)
    if (last && (a <= last[0] || b < last[1])) continue // 순서가 엇갈리는 앵커는 버림
    anchorPoints.push([a, b])
    anchorMs.set(an.sentence, an.ms)
  }
  const matchBA = matchChars(A.norm, B, anchorPoints)
  const matchAB = new Int32Array(A.norm.length).fill(-1)
  for (let b = 0; b < B.length; b++) if (matchBA[b] >= 0) matchAB[matchBA[b]] = b

  // 큐 판정
  const threshold = CUE_THRESHOLD[tolerance]
  const cueMatches: CueMatch[] = cues.map((_, k) => {
    const len = cueEndB[k] - cueStartB[k]
    let count = 0
    let first = -1
    let last = -1
    for (let b = cueStartB[k]; b < cueEndB[k]; b++) {
      const a = matchBA[b]
      if (a < 0) continue
      count++
      if (first < 0) first = a
      last = a
    }
    const confidence = len ? count / len : 0
    const matched = !forced[k] && confidence >= threshold
    return {
      kind: matched ? 'matched' : 'audioOnly',
      confidence,
      bookStart: matched ? A.map[first] : -1,
      bookEnd: matched ? A.map[last] + 1 : -1,
    }
  })

  // 문장 시각: 큐 경계 우선, 큐 안은 글자 비율 보간
  const timeAt = (b: number, edge: 'start' | 'end'): number => {
    const k = cueOf[b]
    const cue = cues[k]
    const len = cueEndB[k] - cueStartB[k]
    const pos = edge === 'start' ? b - cueStartB[k] : b + 1 - cueStartB[k]
    if (edge === 'start' && pos <= SNAP_CHARS) return cue.startMs
    if (edge === 'end' && len - pos <= SNAP_CHARS) return cue.endMs
    return Math.round(cue.startMs + ((cue.endMs - cue.startMs) * pos) / len)
  }
  let prevStart = 0
  const sentences: SentenceTiming[] = book.sentences.map((s, si) => {
    const pinned = anchorMs.get(si)
    const na = normIndexAtOrAfter(A.map, s.start)
    const nb = normIndexAtOrAfter(A.map, s.end)
    let count = 0
    let firstB = -1
    let lastB = -1
    for (let a = na; a < nb; a++) {
      const b = matchAB[a]
      if (b < 0 || cueMatches[cueOf[b]].kind !== 'matched') continue
      count++
      if (firstB < 0) firstB = b
      lastB = b
    }
    const narrated = count > 0 && count >= Math.min(3, nb - na) && count / (nb - na) >= SENTENCE_MIN_RATIO
    if (pinned !== undefined) {
      // 앵커 문장은 사용자가 정한 시각에서 시작(낭독 판정과 무관)
      prevStart = pinned
      return { startMs: pinned, endMs: narrated ? Math.max(pinned, timeAt(lastB, 'end')) : pinned + 2000 }
    }
    if (!narrated) return { startMs: -1, endMs: -1 }
    const startMs = Math.max(prevStart, timeAt(firstB, 'start'))
    prevStart = startMs
    return { startMs, endMs: Math.max(startMs, timeAt(lastB, 'end')) }
  })

  let matchedBookChars = 0
  for (let a = 0; a < matchAB.length; a++) if (matchAB[a] >= 0) matchedBookChars++
  const matchedCues = cueMatches.filter((c) => c.kind === 'matched').length
  return {
    version: ALGORITHM_VERSION,
    lang,
    tolerance,
    cues: cueMatches,
    sentences,
    stats: {
      cues: cues.length,
      matchedCues,
      audioOnlyCues: cues.length - matchedCues,
      bookChars: A.norm.length,
      matchedBookChars,
      sentences: sentences.length,
      timedSentences: sentences.filter((s) => s.startMs >= 0).length,
      elapsedMs: Math.round(performance.now() - t0),
    },
  }
}

/**
 * 두 정규화 문자열의 단조 증가 글자 대응. 반환값 m[b] = a (없으면 -1)
 * 고유 n-gram 앵커 + LIS로 큰 뼈대를 잡고(R1 2·3단계), 작아진 구간은 LCS로 마무리(4단계)
 */
export function matchChars(A: string, B: string, fixed: readonly [number, number][] = []): Int32Array {
  const m = new Int32Array(B.length).fill(-1)
  // 고정점(수동 앵커)으로 나눈 구간들을 따로 정렬. 고정점은 오름차순이어야 함
  const stack: [number, number, number, number, number][] = []
  let pa = 0
  let pb = 0
  for (const [a, b] of fixed) {
    stack.push([pa, a, pb, b, 0])
    pa = a
    pb = b
  }
  stack.push([pa, A.length, pb, B.length, 0])
  while (stack.length) {
    const [a0, a1, b0, b1, ni] = stack.pop()!
    const la = a1 - a0
    const lb = b1 - b0
    if (la <= 0 || lb <= 0) continue
    if (la * lb <= DP_LIMIT) {
      lcs(A, B, a0, a1, b0, b1, m)
      continue
    }
    let segs: [number, number, number][] = []
    let k = ni
    for (; k < NGRAMS.length; k++) {
      if (Math.min(la, lb) < NGRAMS[k]) continue
      segs = anchorSegments(A, B, a0, a1, b0, b1, NGRAMS[k])
      if (segs.length) break
    }
    if (!segs.length) continue // 너무 크고 앵커도 없음: 비워 둠
    let pa = a0
    let pb = b0
    for (const [sa, sb, len] of segs) {
      stack.push([pa, sa, pb, sb, k])
      for (let i = 0; i < len; i++) m[sb + i] = sa + i
      pa = sa + len
      pb = sb + len
    }
    stack.push([pa, a1, pb, b1, k])
  }
  dropShortRuns(m, MIN_RUN)
  return m
}

/** 글자 시각 ms에 해당하는 전사 문자열 위치(큐 안은 글자 비율로 보간) */
function transcriptPosAt(cues: readonly Cue[], startB: Int32Array, endB: Int32Array, ms: number): number {
  let k = 0
  while (k + 1 < cues.length && cues[k + 1].startMs <= ms) k++
  const c = cues[k]
  const len = endB[k] - startB[k]
  const r = c.endMs > c.startMs ? Math.min(1, Math.max(0, (ms - c.startMs) / (c.endMs - c.startMs))) : 0
  return startB[k] + Math.round(r * len)
}

const HASH_P = 0x01000193

function rollingHashes(s: string, from: number, to: number, n: number): Int32Array {
  const count = to - from - n + 1
  const out = new Int32Array(Math.max(0, count))
  if (count <= 0) return out
  let pow = 1
  for (let i = 1; i < n; i++) pow = Math.imul(pow, HASH_P)
  let h = 0
  for (let i = 0; i < n; i++) h = (Math.imul(h, HASH_P) + s.charCodeAt(from + i)) | 0
  out[0] = h
  for (let i = 1; i < count; i++) {
    h = (h - Math.imul(s.charCodeAt(from + i - 1), pow)) | 0
    h = (Math.imul(h, HASH_P) + s.charCodeAt(from + i + n - 1)) | 0
    out[i] = h
  }
  return out
}

/** 해시 → 위치. 두 번 이상 나오면 -1 */
function uniqueIndex(hashes: Int32Array): Map<number, number> {
  const idx = new Map<number, number>()
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i]
    idx.set(h, idx.has(h) ? -1 : i)
  }
  return idx
}

/** 구간 안에서 양쪽에 한 번씩만 나오는 n-gram 쌍 → LIS로 순서가 맞는 사슬 → 겹치지 않는 일치 구간 */
function anchorSegments(
  A: string,
  B: string,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  n: number,
): [number, number, number][] {
  const hA = rollingHashes(A, a0, a1, n)
  const hB = rollingHashes(B, b0, b1, n)
  const uA = uniqueIndex(hA)
  const uB = uniqueIndex(hB)
  const pa: number[] = []
  const pb: number[] = []
  for (let i = 0; i < hA.length; i++) {
    const h = hA[i]
    if (uA.get(h) !== i) continue
    const j = uB.get(h)
    if (j === undefined || j < 0) continue
    if (A.substr(a0 + i, n) !== B.substr(b0 + j, n)) continue // 해시 충돌
    pa.push(a0 + i)
    pb.push(b0 + j)
  }
  const chain = lisIndices(pb)
  const segs: [number, number, number][] = []
  let endA = a0
  let endB = b0
  for (const ci of chain) {
    const shift = Math.max(0, endA - pa[ci], endB - pb[ci])
    const a = pa[ci] + shift
    const b = pb[ci] + shift
    const len = n - shift
    if (len <= 0) continue
    const last = segs.at(-1)
    if (last && last[0] + last[2] === a && last[1] + last[2] === b) last[2] += len
    else segs.push([a, b, len])
    endA = a + len
    endB = b + len
  }
  return segs
}

/** 최장 증가 부분수열(엄격 증가)의 위치들. O(n log n) */
export function lisIndices(xs: readonly number[]): number[] {
  const tails: number[] = []
  const prev = new Int32Array(xs.length)
  for (let i = 0; i < xs.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (xs[tails[mid]] < xs[i]) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1
    tails[lo] = i
  }
  const out: number[] = new Array(tails.length)
  for (let i = tails.length - 1, k = tails.at(-1) ?? -1; i >= 0; i--, k = prev[k]) out[i] = k
  return out
}

let lcsBuf = new Int32Array(0)

/** 작은 구간의 글자 단위 최장 공통 부분수열 */
function lcs(A: string, B: string, a0: number, a1: number, b0: number, b1: number, m: Int32Array) {
  const la = a1 - a0
  const lb = b1 - b0
  const W = lb + 1
  const size = (la + 1) * W
  if (lcsBuf.length < size) lcsBuf = new Int32Array(size)
  const L = lcsBuf
  L.fill(0, la * W, size)
  for (let i = la - 1; i >= 0; i--) {
    const row = i * W
    const next = row + W
    const ca = A.charCodeAt(a0 + i)
    L[row + lb] = 0
    for (let j = lb - 1; j >= 0; j--) {
      L[row + j] = ca === B.charCodeAt(b0 + j) ? L[next + j + 1] + 1 : Math.max(L[next + j], L[row + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < la && j < lb) {
    if (A.charCodeAt(a0 + i) === B.charCodeAt(b0 + j)) {
      m[b0 + j] = a0 + i
      i++
      j++
    } else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++
    else j++
  }
}

function dropShortRuns(m: Int32Array, minRun: number) {
  let start = 0
  for (let b = 1; b <= m.length; b++) {
    const continues = b < m.length && m[b] >= 0 && m[b - 1] >= 0 && m[b] === m[b - 1] + 1
    if (continues) continue
    if (m[start] >= 0 && b - start < minRun) m.fill(-1, start, b)
    start = b
  }
}
