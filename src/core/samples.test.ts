// 사용자 샘플(samples/, 커밋 안 됨)이 있을 때만 실행. 파일 내용은 커밋하지 않고 숫자만 검사함.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alignBook } from './align'
import { evaluate } from './alignEval'
import { parseMarkdown } from './markdown'
import { parseSrt } from './srt'

const DIR = join(import.meta.dirname, '../../samples')
const srts = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('-guide.srt')) : []

describe.skipIf(srts.length === 0)('샘플 SRT 전체 파싱', () => {
  it('모든 블록을 읽고, 큐는 시간순이며 겹치지 않음', () => {
    let total = 0
    let folded = 0
    for (const f of srts) {
      const text = readFileSync(join(DIR, f), 'utf8')
      const blocks = (text.match(/-->/g) ?? []).length
      const r = parseSrt(text)
      expect(r.skipped, f).toBe(0)
      expect(r.cues.length + r.folded, f).toBe(blocks)
      for (let i = 1; i < r.cues.length; i++) {
        expect(r.cues[i].startMs, f).toBeGreaterThanOrEqual(r.cues[i - 1].endMs)
      }
      total += r.cues.length
      folded += r.folded
    }
    console.log(`샘플 ${srts.length}개, 큐 ${total}개, 반복 접기 ${folded}개`)
  }, 60_000)
})

// AC-1·AC-2 골든 테스트: 샘플에서 고르게 40권 + 가장 긴 책. 기대값은 숫자만 둠
describe.skipIf(srts.length === 0)('샘플 책 정렬(AC-1·AC-2)', () => {
  it('본문 큐 98% 이상이 올바른 위치, 문장 시각 역행 없음, 3초 이내', () => {
    const names = srts.map((f) => f.replace(/\.srt$/, '')).filter((n) => existsSync(join(DIR, n + '.md')))
    const longest = names.reduce((a, b) => (statSync(join(DIR, b + '.srt')).size > statSync(join(DIR, a + '.srt')).size ? b : a))
    const step = Math.max(1, Math.floor(names.length / 40))
    const picked = new Set([...names.filter((_, i) => i % step === 0).slice(0, 40), longest])
    let body = 0
    let correct = 0
    let introOutro = 0
    for (const name of picked) {
      const book = parseMarkdown(readFileSync(join(DIR, name + '.md'), 'utf8'))
      const { cues } = parseSrt(readFileSync(join(DIR, name + '.srt'), 'utf8'))
      const al = alignBook(book, cues)
      const ev = evaluate(book, cues, al)
      expect(ev.correctRatio, name).toBeGreaterThan(0.9)
      expect(ev.nonMonotonic, name).toBe(0)
      expect(al.stats.elapsedMs, name).toBeLessThan(3000)
      body += ev.bodyCues
      correct += ev.correctCues
      if (ev.introOutroAudioOnly) introOutro++
    }
    console.log(`샘플 ${picked.size}권, 본문 큐 ${body}개, 올바른 위치 ${((100 * correct) / body).toFixed(2)}%`)
    expect(correct / body).toBeGreaterThanOrEqual(0.98)
    expect(introOutro / picked.size).toBeGreaterThanOrEqual(0.95)
  }, 120_000)
})
