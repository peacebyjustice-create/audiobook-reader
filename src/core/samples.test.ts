// 사용자 샘플(samples/, 커밋 안 됨)이 있을 때만 실행. 파일 내용은 커밋하지 않고 숫자만 검사함.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
