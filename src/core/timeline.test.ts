import { expect, it } from 'vitest'
import type { Alignment } from './align'
import { buildBook } from './book'
import { bookTimeline, cueTimeline } from './timeline'

const cue = (index: number, startMs: number, endMs: number) => ({ index, startMs, endMs, text: `c${index}` })

it('책 타임라인: 시각 있는 문장 + 묶인 오디오 전용 구간, 시간순, 겹침 정리', () => {
  const book = buildBook([{ kind: 'text', text: 'One. Two. Three.' }])
  const cues = [cue(0, 0, 1000), cue(1, 1000, 2000), cue(2, 2000, 3000), cue(3, 3000, 4000), cue(4, 4500, 5000)]
  const al = {
    cues: [
      { kind: 'audioOnly' },
      { kind: 'audioOnly' },
      { kind: 'matched' },
      { kind: 'matched' },
      { kind: 'audioOnly' },
    ],
    sentences: [
      { startMs: 2000, endMs: 3200 },
      { startMs: -1, endMs: -1 },
      { startMs: 3000, endMs: 4000 },
    ],
  } as unknown as Alignment
  const tl = bookTimeline(book, cues, al)
  expect(tl.segments.map((s) => [s.id, s.startMs, s.endMs])).toEqual([
    ['a0', 0, 2000],
    ['s0', 2000, 3000], // 다음 문장 시작에서 끝을 자름
    ['s2', 3000, 4000],
    ['a4', 4500, 5000],
  ])
  expect([...tl.sentenceSeg]).toEqual([1, -1, 2])
})

it('문장 안에 끼어든 짧은 오디오 전용 구간은 버림', () => {
  const book = buildBook([{ kind: 'text', text: 'One long sentence.' }])
  const cues = [cue(0, 0, 3000), cue(1, 1000, 1500)]
  const al = { cues: [{ kind: 'matched' }, { kind: 'audioOnly' }], sentences: [{ startMs: 0, endMs: 3000 }] } as unknown as Alignment
  expect(bookTimeline(book, cues, al).segments.map((s) => s.id)).toEqual(['s0'])
})

it('자막 타임라인은 문장이 끝나는 큐까지 묶음', () => {
  const cues = [cue(0, 0, 1000), cue(1, 1100, 2000), cue(2, 2100, 3000)].map((c, i) => ({ ...c, text: i === 0 ? 'Hello' : 'world.' }))
  expect(cueTimeline(cues).segments.map((s) => [s.id, s.cueStart, s.cueEnd])).toEqual([
    ['c0', 0, 2],
    ['c2', 2, 3],
  ])
})
