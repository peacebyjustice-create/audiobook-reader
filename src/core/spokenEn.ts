// 영어 숫자·기호의 읽는 형태. 정렬 정규화에서 책('#1', '1998', '50%')과 전사('number one', ...)를 맞추는 데 씀.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES: [number, string][] = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]

function under1000(n: number): string {
  let out = ''
  if (n >= 100) {
    out += ONES[Math.floor(n / 100)] + 'hundred'
    n %= 100
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)]
    n %= 10
    if (n) out += ONES[n]
  } else if (n || !out) out += ONES[n]
  return out
}

/** 공백 없는 소문자 기수 읽기. 1100~1999년 형태(…00 제외)는 연도식('nineteenninetyeight') */
export function cardinal(n: number): string {
  if (n >= 1100 && n <= 1999 && n % 100 >= 10) return under1000(Math.floor(n / 100)) + under1000(n % 100)
  if (n < 1000) return under1000(n)
  let out = ''
  for (const [v, w] of SCALES) {
    if (n >= v) {
      out += under1000(Math.floor(n / v)) + w
      n %= v
    }
  }
  return n ? out + under1000(n) : out
}

const ORDINAL_SUFFIX: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
}

export function ordinal(n: number): string {
  const c = cardinal(n)
  for (const [k, v] of Object.entries(ORDINAL_SUFFIX)) if (c.endsWith(k)) return c.slice(0, -k.length) + v
  if (c.endsWith('y')) return c.slice(0, -1) + 'ieth'
  return c + 'th'
}

/** 기호 → 읽기(앞뒤 문맥 무관한 것만) */
export const SYMBOL_WORDS: Record<string, string> = { '%': 'percent', '=': 'equals', '&': 'and', '+': 'plus', '@': 'at' }

const NUMBER_AT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:(st|nd|rd|th)(?![a-z]))?/i

/**
 * text[i]에서 시작하는 숫자를 읽기로 바꿈. 숫자가 아니면 null.
 * '#'이 숫자 바로 앞이면 'number'를 붙임
 */
export function spokenNumberAt(text: string, i: number): { words: string; length: number } | null {
  const hash = text[i] === '#'
  const m = NUMBER_AT.exec(text.slice(hash ? i + 1 : i, i + 40))
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  if (!Number.isSafeInteger(n) || n >= 1e12) return null
  let words = m[3] ? ordinal(n) : cardinal(n)
  if (m[2]) words += 'point' + [...m[2]].map((d) => ONES[Number(d)]).join('')
  return { words: (hash ? 'number' : '') + words, length: m[0].length + (hash ? 1 : 0) }
}
