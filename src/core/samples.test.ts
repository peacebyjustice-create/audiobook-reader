// 사용자 샘플(samples/, 커밋 안 됨)이 있을 때만 실행. 파일 내용은 커밋하지 않고 숫자만 검사함.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alignBook } from './align'
import { evaluate } from './alignEval'
import { Marked } from 'marked'
import { buildBook } from './book'
import { parseEpub } from './epub'
import { makeEpub } from './epubFixture'
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

// EPUB 경로 검증: 가이드 md를 HTML로 바꿔 EPUB으로 묶고, 같은 자막과 정렬해 md와 같은 정확도인지 확인
describe.skipIf(srts.length === 0)('샘플을 EPUB으로 바꿔 정렬', () => {
  it('md로 정렬할 때와 올바른 위치 비율 차이 1%p 이내', () => {
    const names = srts.map((f) => f.replace(/\.srt$/, '')).filter((n) => existsSync(join(DIR, n + '.md')))
    const step = Math.max(1, Math.floor(names.length / 10))
    const marked = new Marked()
    for (const name of names.filter((_, i) => i % step === 0).slice(0, 10)) {
      const md = readFileSync(join(DIR, name + '.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^---(#{1,6}\s)/gm, '\n---\n\n$1')
      // 장(## 제목)마다 XHTML 문서 하나로 나눔
      const chapters = md.split(/\n(?=## )/).map((part, i) => ({ file: `c${i}.xhtml`, html: marked.parse(part, { async: false }) as string }))
      const xhtml = chapters.map((c) => ({ ...c, html: c.html.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>').replace(/<img([^>]*?)>/g, '<img$1/>') }))
      const epubBook = buildBook(parseEpub(makeEpub(xhtml)).blocks)
      const { cues } = parseSrt(readFileSync(join(DIR, name + '.srt'), 'utf8'))
      const viaMd = evaluate(parseMarkdown(readFileSync(join(DIR, name + '.md'), 'utf8')), cues, alignBook(parseMarkdown(readFileSync(join(DIR, name + '.md'), 'utf8')), cues))
      const viaEpub = evaluate(epubBook, cues, alignBook(epubBook, cues))
      expect(viaEpub.correctRatio, name).toBeGreaterThan(viaMd.correctRatio - 0.01)
    }
  }, 120_000)
})
