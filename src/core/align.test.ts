import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { alignBook, lisIndices, matchChars } from './align'
import { buildBook, type BlockInput } from './book'
import type { Cue } from './srt'

// 합성 데이터: 결정적 의사난수로 영어 문장을 만들고, 그 낭독을 흉내 낸 큐를 만듦
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 0) / 2 ** 32
}
const WORDS = ('parents children discipline routine behavior time love calm count break ' +
  'listen practice simple approach clinical psychologist families teacher school morning evening ' +
  'homework dinner bedtime chart timer reward argument feeling patience consistent warm').split(' ')

function makeBook(seed: number, paragraphs: number) {
  const r = rng(seed)
  const blocks: BlockInput[] = []
  for (let p = 0; p < paragraphs; p++) {
    if (p % 4 === 0) blocks.push({ kind: 'heading', level: 2, text: `Part ${p / 4 + 1}: ${WORDS[p % WORDS.length]}` })
    const sentences: string[] = []
    const n = 2 + Math.floor(r() * 4)
    for (let s = 0; s < n; s++) {
      const len = 6 + Math.floor(r() * 14)
      const w = Array.from({ length: len }, () => WORDS[Math.floor(r() * WORDS.length)])
      if (r() < 0.2) w.splice(2, 0, String(2 + Math.floor(r() * 90)))
      w[0] = w[0][0].toUpperCase() + w[0].slice(1)
      sentences.push(w.join(' ') + '.')
    }
    blocks.push({ kind: 'text', text: sentences.join(' ') })
  }
  return buildBook(blocks)
}

const NUM_WORDS: Record<string, string> = { '2': 'two', '3': 'three', '10': 'ten', '42': 'forty-two' }

/** 낭독 흉내: 블록 skip은 읽지 않음, 숫자는 일부 단어로, 약 10단어씩 큐로 자름(문장 중간에서 잘림) */
function narrate(book: ReturnType<typeof makeBook>, opts: { skipBlocks?: number[]; insertAfterCue?: number; typoEvery?: number }) {
  const words: string[] = []
  book.blocks.forEach((b, i) => {
    if (opts.skipBlocks?.includes(i)) return
    words.push(...book.text.slice(b.start, b.end).split(' '))
  })
  const spoken = words.map((w, i) => {
    const bare = w.replace(/\.$/, '')
    let out = NUM_WORDS[bare] ? w.replace(bare, NUM_WORDS[bare]) : w
    if (opts.typoEvery && i % opts.typoEvery === 0 && out.length > 4) out = out.slice(0, 2) + 'x' + out.slice(3)
    return out
  })
  const cues: Cue[] = []
  let t = 1000
  for (let i = 0; i < spoken.length; i += 10) {
    const text = spoken.slice(i, i + 10).join(' ')
    cues.push({ index: cues.length, startMs: t, endMs: t + text.length * 60, text })
    t += text.length * 60 + 300
    if (cues.length - 1 === opts.insertAfterCue) {
      const ad = 'We will be right back after this short message from our sponsor'
      cues.push({ index: cues.length, startMs: t, endMs: t + 4000, text: ad })
      t += 4300
    }
  }
  return cues
}

describe('alignBook (합성)', () => {
  const book = makeBook(7, 40)

  it('그대로 낭독하면 모든 큐가 매칭되고, 모든 문장에 시각이 붙음', () => {
    const cues = narrate(book, {})
    const al = alignBook(book, cues)
    expect(al.stats.audioOnlyCues).toBe(0)
    expect(al.stats.timedSentences).toBe(al.stats.sentences)
    for (const [k, c] of cues.entries()) {
      const m = al.cues[k]
      // 숫자 읽기 차이가 있어도 큐 글자가 매칭 범위에 그대로 들어 있음
      expect(book.text.slice(m.bookStart, m.bookEnd).split(/\s+/)[1], `cue ${k}`).toBe(c.text.split(' ')[1])
    }
  })

  it('읽지 않은 블록은 시각 없음, 끼어든 광고 큐는 오디오 전용, 오타는 흡수', () => {
    const skip = [5, 6, 20]
    const cues = narrate(book, { skipBlocks: skip, insertAfterCue: 30, typoEvery: 7 })
    const al = alignBook(book, cues)
    const ad = cues.findIndex((c) => c.text.startsWith('We will be right back'))
    expect(al.cues[ad].kind).toBe('audioOnly')
    expect(al.stats.matchedCues).toBe(cues.length - 1)
    book.sentences.forEach((s, i) => {
      const timed = al.sentences[i].startMs >= 0
      expect(timed, `sentence ${i}`).toBe(!skip.includes(s.block))
    })
  })

  it('문장 시각은 단조 증가하고 큐 시간 범위 안에 있음', () => {
    const cues = narrate(book, { typoEvery: 5 })
    const al = alignBook(book, cues)
    let prev = -1
    for (const s of al.sentences) {
      expect(s.startMs).toBeGreaterThanOrEqual(prev)
      expect(s.endMs).toBeGreaterThanOrEqual(s.startMs)
      expect(s.endMs).toBeLessThanOrEqual(cues.at(-1)!.endMs)
      prev = s.startMs
    }
    // 첫 문장은 첫 큐 시작에 맞춰짐(큐 경계 맞춤)
    expect(al.sentences[0].startMs).toBe(cues[0].startMs)
  })

  it('수동 앵커: 그 문장은 정한 시각에서 시작하고, 앞뒤 문장 시각은 앵커를 넘지 않음', () => {
    const cues = narrate(book, {})
    const base = alignBook(book, cues)
    const target = 40
    const ms = base.sentences[target].startMs + 700
    const al = alignBook(book, cues, { anchors: [{ sentence: target, ms }] })
    expect(al.sentences[target].startMs).toBe(ms)
    for (let i = 0; i < target; i++) expect(al.sentences[i].startMs).toBeLessThanOrEqual(ms)
    for (let i = target + 1; i < al.sentences.length; i++) expect(al.sentences[i].startMs).toBeGreaterThanOrEqual(ms)
    expect(al.stats.audioOnlyCues).toBe(0)
  })

  it('수동 앵커: 낭독 안 된 문장도 앵커를 두면 시각이 생김, 순서가 엇갈린 앵커는 버림', () => {
    const skip = [5]
    const cues = narrate(book, { skipBlocks: skip })
    const s = book.sentences.findIndex((x) => x.block === 5)
    const before = alignBook(book, cues).sentences[s]
    expect(before.startMs).toBe(-1)
    const ms = alignBook(book, cues).sentences[s - 1].endMs
    const al = alignBook(book, cues, { anchors: [{ sentence: s, ms }, { sentence: 2, ms: ms + 5000 }] })
    expect(al.sentences[s].startMs).toBe(ms)
    expect(al.sentences[2].startMs).toBeLessThan(ms)
  })

  it('입력 상한을 넘으면 거부', () => {
    const big = buildBook([{ kind: 'text', text: 'a'.repeat(2_000_001) }])
    expect(() => alignBook(big, [])).toThrow(/상한/)
  })
})

describe('matchChars', () => {
  it('대응은 단조 증가하고 같은 글자끼리만 짝지음', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd'), maxLength: 300 }), fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd'), maxLength: 300 }), (A, B) => {
        const m = matchChars(A, B)
        let prev = -1
        for (let b = 0; b < B.length; b++) {
          if (m[b] < 0) continue
          if (m[b] <= prev || A[m[b]] !== B[b]) return false
          prev = m[b]
        }
        return true
      }),
    )
  })
})

describe('lisIndices', () => {
  it('O(n²) DP와 길이가 같고 엄격 증가', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 80 }), (xs) => {
        const idx = lisIndices(xs)
        for (let i = 1; i < idx.length; i++) if (!(idx[i] > idx[i - 1] && xs[idx[i]] > xs[idx[i - 1]])) return false
        const dp = xs.map(() => 1)
        for (let i = 0; i < xs.length; i++) for (let j = 0; j < i; j++) if (xs[j] < xs[i]) dp[i] = Math.max(dp[i], dp[j] + 1)
        return idx.length === (xs.length ? Math.max(...dp) : 0)
      }),
    )
  })
})
