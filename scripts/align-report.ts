// 정렬 리포트: samples/의 md+srt를 정렬하고 숫자만 출력(파일 내용은 출력하지 않음).
// 사용: npx tsx scripts/align-report.ts [--all | --n 50 | 파일명(확장자 제외)...] [--worst 10]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluate, type Evaluation } from '../src/core/alignEval'
import { alignBook } from '../src/core/align'
import { parseMarkdown } from '../src/core/markdown'
import { parseSrt } from '../src/core/srt'

const DIR = join(import.meta.dirname, '../samples')
if (!existsSync(DIR)) throw new Error('samples 폴더가 없습니다')
const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const all = readdirSync(DIR)
  .filter((f) => f.endsWith('-guide.srt') && existsSync(join(DIR, f.replace(/\.srt$/, '.md'))))
  .map((f) => f.replace(/\.srt$/, ''))
  .sort()
const named = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
let names: string[]
if (named.length) names = named
else if (args.includes('--all')) names = all
else {
  const n = Number(flag('--n') ?? 30)
  const step = Math.max(1, Math.floor(all.length / n))
  names = all.filter((_, i) => i % step === 0).slice(0, n)
}

const rows: (Evaluation & { name: string; ms: number; minutes: number })[] = []
for (const name of names) {
  const book = parseMarkdown(readFileSync(join(DIR, name + '.md'), 'utf8'))
  const { cues } = parseSrt(readFileSync(join(DIR, name + '.srt'), 'utf8'))
  const al = alignBook(book, cues)
  rows.push({ name, ms: al.stats.elapsedMs, minutes: Math.round(cues.at(-1)!.endMs / 60000), ...evaluate(book, cues, al) })
}

const pct = (x: number) => (100 * x).toFixed(2) + '%'
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]
const worst = Number(flag('--worst') ?? 10)
console.log(`책 ${rows.length}권`)
const total = rows.reduce(
  (s, r) => ({ body: s.body + r.bodyCues, ok: s.ok + r.correctCues, matched: s.matched + r.matchedBodyCues, nobook: s.nobook + r.noBookTextCues }),
  { body: 0, ok: 0, matched: 0, nobook: 0 },
)
console.log(`책에 글이 없는 큐(오디오 전용이 정답, 평가에서 제외) ${total.nobook}개`)
console.log(`본문 큐 ${total.body}개: 매칭 ${pct(total.matched / total.body)}, 올바른 위치 ${pct(total.ok / total.body)}`)
console.log(`책별 올바른 위치 비율: 최저 ${pct(q(rows.map((r) => r.correctRatio), 0))}, p10 ${pct(q(rows.map((r) => r.correctRatio), 0.1))}, 중앙 ${pct(q(rows.map((r) => r.correctRatio), 0.5))}`)
console.log(`고정 문구 오디오 전용 처리: ${rows.filter((r) => r.introOutroAudioOnly).length}/${rows.length}`)
console.log(`낭독 문장 비율 중앙값 ${pct(q(rows.map((r) => r.timedSentenceRatio), 0.5))}, 시각 역행 ${rows.reduce((s, r) => s + r.nonMonotonic, 0)}건`)
console.log(`정렬 시간(ms): 중앙 ${q(rows.map((r) => r.ms), 0.5)}, 최대 ${Math.max(...rows.map((r) => r.ms))} (${rows.find((r) => r.ms === Math.max(...rows.map((x) => x.ms)))?.minutes}분 분량)`)
console.log(`\n올바른 위치 비율이 낮은 ${worst}권:`)
for (const r of [...rows].sort((a, b) => a.correctRatio - b.correctRatio).slice(0, worst))
  console.log(`  ${pct(r.correctRatio)}  본문큐 ${r.bodyCues}, 매칭 안 됨 ${r.bodyCues - r.matchedBodyCues}, 위치 의심 ${r.matchedBodyCues - r.correctCues}  ${r.name}`)
