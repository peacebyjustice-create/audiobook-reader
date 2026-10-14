import { SYMBOL_WORDS, spokenNumberAt } from './spokenEn'

export type Lang = 'en' | 'ko'

/** 한글이 라틴 문자보다 많으면 'ko' */
export function detectLang(text: string): Lang {
  const sample = text.slice(0, 200_000)
  const hangul = sample.match(/[가-힣]/g)?.length ?? 0
  const latin = sample.match(/[a-z]/gi)?.length ?? 0
  return hangul > latin ? 'ko' : 'en'
}

/** 정렬용 정규화 결과. norm의 i번째 UTF-16 단위는 원문 map[i] 위치에서 옴 */
export interface Normalized {
  norm: string
  map: Int32Array
}

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u

/**
 * NFKC → 소문자 → 글자와 숫자만 남김(R1 1단계). 띄어쓰기·문장부호·하이픈 차이가 사라짐
 * ('Shortform'과 'Short form'이 같아짐). 영어는 숫자·기호를 읽는 형태로 펼침('#1' → 'numberone').
 * 남은 읽기 차이는 정렬의 diff가 흡수
 */
export function normalizeText(text: string, lang: Lang = 'en'): Normalized {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    // 영어: 숫자·'#숫자'·일부 기호를 읽는 형태로 펼침(전사가 'number one', 'percent'로 적는 경우 대비)
    if (lang === 'en' && ((c >= 48 && c <= 57) || c === 35)) {
      const sp = spokenNumberAt(text, i)
      if (sp) {
        norm += sp.words
        for (let u = 0; u < sp.words.length; u++) map.push(i)
        i += sp.length - 1
        continue
      }
    }
    if (lang === 'en' && SYMBOL_WORDS[text[i]]) {
      const w = SYMBOL_WORDS[text[i]]
      norm += w
      for (let u = 0; u < w.length; u++) map.push(i)
      continue
    }
    if (c < 128) {
      if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) norm += text[i]
      else if (c >= 65 && c <= 90) norm += String.fromCharCode(c + 32)
      else continue
      map.push(i)
      continue
    }
    const cp = text.codePointAt(i)!
    const start = i
    if (cp > 0xffff) i++ // 서로게이트 쌍은 한 글자
    // NFKC는 한 글자를 여러 글자로 펼칠 수 있음(예: ㎏ → kg)
    for (const x of String.fromCodePoint(cp).normalize('NFKC').toLowerCase()) {
      if (!LETTER_OR_NUMBER.test(x)) continue
      norm += x
      for (let u = 0; u < x.length; u++) map.push(start)
    }
  }
  return { norm, map: Int32Array.from(map) }
}

/** map(오름차순)에서 원문 위치 pos 이상인 첫 정규화 위치 */
export function normIndexAtOrAfter(map: Int32Array, pos: number): number {
  let lo = 0
  let hi = map.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (map[mid] < pos) lo = mid + 1
    else hi = mid
  }
  return lo
}
