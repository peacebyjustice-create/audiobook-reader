import { expect, it } from 'vitest'
import type { Alignment } from './align'
import { buildBook } from './book'
import { bookChapters, chapterAt, srtChapters } from './chapters'
import { bookTimeline, cueTimeline } from './timeline'

const cue = (index: number, startMs: number, endMs: number, text = 'x.') => ({ index, startMs, endMs, text })

it('책: 2번 이상 나오는 최상위 레벨 = 챕터, 그 아래 = 절, 낭독 안 된 제목은 뺌', () => {
  const book = buildBook([
    { kind: 'heading', level: 1, text: 'Title' },
    { kind: 'heading', level: 2, text: 'Contents' },
    { kind: 'text', text: 'Toc line.' },
    { kind: 'heading', level: 2, text: 'Summary' },
    { kind: 'heading', level: 4, text: 'Part 1' },
    { kind: 'text', text: 'Alpha.' },
    { kind: 'heading', level: 4, text: 'Part 2' },
    { kind: 'text', text: 'Beta.' },
    { kind: 'heading', level: 2, text: 'Exercise' },
    { kind: 'text', text: 'Gamma.' },
  ])
  // 문장: 0 Title, 1 Contents, 2 Toc, 3 Summary, 4 Part1, 5 Alpha, 6 Part2, 7 Beta, 8 Exercise, 9 Gamma
  const timed = [3, 4, 5, 6, 7, 8, 9]
  const al = {
    cues: [],
    sentences: book.sentences.map((_, i) => (timed.includes(i) ? { startMs: i * 1000, endMs: i * 1000 + 900 } : { startMs: -1, endMs: -1 })),
  } as unknown as Alignment
  const tl = bookTimeline(book, [], al)
  const ch = bookChapters(book, tl, [])
  expect(ch.map((c) => [c.title, c.depth, c.startMs])).toEqual([
    ['Summary', 0, 3000],
    ['Part 1', 1, 4000],
    ['Part 2', 1, 6000],
    ['Exercise', 0, 8000],
  ])
  expect(chapterAt(ch, 0)).toBe(0)
  expect(chapterAt(ch, 3)).toBe(2)
})

it('자막 보기: Chapter 패턴, 없으면 20분 분할', () => {
  const cues = [cue(0, 0, 1000, 'Chapter 1.'), cue(1, 1000, 2000, 'Text.'), cue(2, 2000, 3000, 'Chapter 2.'), cue(3, 3000, 4000, 'More.')]
  expect(srtChapters(cueTimeline(cues), cues).map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2'])
  const long = Array.from({ length: 50 }, (_, i) => cue(i, i * 60_000, i * 60_000 + 50_000, 'Line.'))
  expect(srtChapters(cueTimeline(long), long).map((c) => [c.title, c.startMs])).toEqual([
    ['1부', 0],
    ['2부', 1_200_000],
    ['3부', 2_400_000],
  ])
})
