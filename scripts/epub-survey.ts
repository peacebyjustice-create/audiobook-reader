// 실제 EPUB 조사: 책 폴더에서 고르게 N권을 열어 성공·실패 유형과 블록 수를 숫자로만 출력(내용은 출력하지 않음)
// 사용: npx tsx scripts/epub-survey.ts [권수=200]
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildBook } from '../src/core/book'
import { EpubError, parseEpub } from '../src/core/epub'

const ROOT = dirname(realpathSync(join(import.meta.dirname, '../samples')))
const N = Number(process.argv[2] ?? 200)
const all: string[] = []
const walk = (d: string, depth: number) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory() && depth < 4) walk(p, depth + 1)
    else if (e.isFile() && e.name.toLowerCase().endsWith('.epub')) all.push(p)
  }
}
walk(ROOT, 0)
all.sort()
const step = Math.max(1, Math.floor(all.length / N))
const picked = all.filter((_, i) => i % step === 0).slice(0, N)
const kinds: Record<string, number> = {}
const stats: { blocks: number; headings: number; chars: number; sentences: number; ms: number; mb: number }[] = []
for (const f of picked) {
  const t0 = performance.now()
  try {
    const bytes = new Uint8Array(readFileSync(f))
    if (bytes.length > 200e6) {
      kinds['200MB 초과'] = (kinds['200MB 초과'] ?? 0) + 1
      continue
    }
    const r = parseEpub(bytes)
    const book = buildBook(r.blocks)
    stats.push({ blocks: book.blocks.length, headings: book.blocks.filter((b) => b.kind === 'heading').length, chars: book.text.length, sentences: book.sentences.length, ms: performance.now() - t0, mb: statSync(f).size / 1e6 })
    kinds['성공'] = (kinds['성공'] ?? 0) + 1
  } catch (e) {
    const k = e instanceof EpubError ? (e.message.match(/DRM|고정 레이아웃|본문 글자|열 수 없|OPF/)?.[0] ?? e.message) : `기타: ${(e as Error).message.slice(0, 60)}`
    kinds[k] = (kinds[k] ?? 0) + 1
  }
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]
console.log(`EPUB 전체 ${all.length}권 중 ${picked.length}권 조사`)
console.log('결과:', kinds)
const col = (k: keyof (typeof stats)[0]) => stats.map((s) => s[k])
console.log(`글자 수 중앙 ${q(col('chars'), 0.5)}, 최대 ${Math.max(...col('chars'))}`)
console.log(`문장 수 중앙 ${q(col('sentences'), 0.5)}, 제목 블록 중앙 ${q(col('headings'), 0.5)}, 제목 0개인 책 ${stats.filter((s) => s.headings === 0).length}권`)
console.log(`처리 시간(ms) 중앙 ${Math.round(q(col('ms'), 0.5))}, 최대 ${Math.round(Math.max(...col('ms')))} (파일 ${q(col('mb'), 0.5).toFixed(1)}MB 중앙)`)
