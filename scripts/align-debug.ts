// 정렬 디버그: 한 권에서 매칭 안 된 큐와 위치 의심 큐를 책 주변 글과 함께 출력(로컬 확인용, 출력물을 커밋하지 말 것).
// 사용: npx tsx scripts/align-debug.ts "<파일명(확장자 제외)>" [최대개수]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alignBook, DEFAULT_AUDIO_ONLY } from '../src/core/align'
import { parseMarkdown } from '../src/core/markdown'
import { parseSrt } from '../src/core/srt'

const [name, maxArg] = process.argv.slice(2)
const DIR = join(import.meta.dirname, '../samples')
const book = parseMarkdown(readFileSync(join(DIR, name + '.md'), 'utf8'))
const { cues } = parseSrt(readFileSync(join(DIR, name + '.srt'), 'utf8'))
const al = alignBook(book, cues)
let shown = 0
const max = Number(maxArg ?? 15)
for (let k = 0; k < cues.length && shown < max; k++) {
  const m = al.cues[k]
  if (m.kind === 'matched' && m.confidence > 0.8) continue
  if (DEFAULT_AUDIO_ONLY.some((r) => r.test(cues[k].text))) continue
  // 앞뒤 매칭 큐의 책 위치로 기대 범위 추정
  let p = k - 1
  while (p >= 0 && al.cues[p].kind !== 'matched') p--
  let n = k + 1
  while (n < cues.length && al.cues[n].kind !== 'matched') n++
  const from = p >= 0 ? al.cues[p].bookEnd : 0
  const to = n < cues.length ? al.cues[n].bookStart : book.text.length
  console.log(`#${k} ${m.kind} conf=${m.confidence.toFixed(2)}`)
  console.log(`  SRT : ${cues[k].text}`)
  console.log(`  범위: ${m.bookStart >= 0 ? JSON.stringify(book.text.slice(m.bookStart, m.bookEnd)) : '-'}`)
  console.log(`  틈  : ${JSON.stringify(book.text.slice(from, Math.min(to, from + 300)))}`)
  shown++
}
