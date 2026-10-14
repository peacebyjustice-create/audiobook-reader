// 규칙 기반 문장 분리(영어·한국어). 브라우저마다 다른 Intl.Segmenter 대신 결정적인 규칙을 씀.

const ABBREV = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie', 'no', 'vol', 'inc', 'ltd', 'co',
  'corp', 'gen', 'gov', 'sen', 'rep', 'rev', 'fig', 'approx', 'dept', 'est', 'jan', 'feb', 'mar', 'apr', 'jun',
  'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'p', 'pp', 'ch', 'ed', 'al',
])

const TERM = /[.!?…。！？]/
const CLOSE = /["'”’)\]」』]/
const LOWER_START = /[a-z]/

/** 문장 [start, end) 범위 목록. 앞뒤 공백은 범위에서 뺌 */
export function splitSentences(text: string): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  const push = (end: number) => {
    let s = start
    let e = end
    while (s < e && /\s/.test(text[s])) s++
    while (e > s && /\s/.test(text[e - 1])) e--
    if (e > s) out.push([s, e])
  }
  for (let i = 0; i < text.length; i++) {
    if (!TERM.test(text[i])) continue
    let j = i
    while (j + 1 < text.length && TERM.test(text[j + 1])) j++
    while (j + 1 < text.length && CLOSE.test(text[j + 1])) j++
    const after = j + 1
    if (after < text.length && !/\s/.test(text[after])) {
      i = j
      continue
    }
    let k = after
    while (k < text.length && /\s/.test(text[k])) k++
    if (k >= text.length) break
    if (text[i] === '.' && !isSentenceEndDot(text, i, text[k])) {
      i = j
      continue
    }
    push(after)
    start = after
    i = j
  }
  push(text.length)
  return out
}

function isSentenceEndDot(text: string, dot: number, next: string): boolean {
  if (LOWER_START.test(next)) return false
  let w = dot
  while (w > 0 && /[\p{L}.]/u.test(text[w - 1])) w--
  const raw = text.slice(w, dot)
  if (raw.includes('.')) return false // 머리글자 약어: U.S., e.g.
  const word = raw.toLowerCase()
  if (word.length === 1 && /\p{Lu}/u.test(text[w])) return false // 이니셜: Thomas W. Phelan
  return !ABBREV.has(word)
}
