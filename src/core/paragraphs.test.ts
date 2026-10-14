import { expect, it } from 'vitest'
import { bundleCues, groupBySilence } from './paragraphs'
import { cueTimeline } from './timeline'

const cue = (index: number, startMs: number, endMs: number, text = '') => ({ index, startMs, endMs, text })

it('무음 2초 이상에서 문단을 나눔', () => {
  const cues = [cue(0, 0, 1000), cue(1, 1500, 3000), cue(2, 5000, 6000), cue(3, 6100, 7000)]
  expect(groupBySilence(cues)).toEqual([
    [0, 2],
    [2, 4],
  ])
  expect(groupBySilence([])).toEqual([])
})

it('영어: 문장부호로 끝나는 큐까지 묶음, 큐 안은 자르지 않음', () => {
  const cues = [
    cue(0, 0, 2000, 'In 1-2-3 Magic, Phelan introduces a simple approach'),
    cue(1, 2100, 4000, 'to discipline that lets you spend less time'),
    cue(2, 4100, 5000, 'enjoying your relationship.'),
    cue(3, 5100, 7000, 'Phelan breaks discipline into two jobs. Doing these jobs'),
    cue(4, 7100, 8000, 'well frees up time.'),
  ]
  expect(bundleCues(cues)).toEqual([
    [0, 3],
    [3, 5],
  ])
  expect(cueTimeline(cues).segments.map((s) => [s.id, s.startMs, s.endMs])).toEqual([
    ['c0', 0, 5000],
    ['c3', 5100, 8000],
  ])
})

it('한국어: 문장부호가 없어도 종결어미 + 무음이면 끝, 긴 무음도 끝', () => {
  const cues = [
    cue(0, 0, 1000, '그날 밤 나는 오래된 편지를'),
    cue(1, 1050, 2000, '다시 꺼냈다'),
    cue(2, 2500, 3000, '거기에는 천구백구십팔년'),
    cue(3, 3050, 4000, '겨울이라고 적혀'),
    cue(4, 6000, 7000, '있었다'),
  ]
  expect(bundleCues(cues, 'ko')).toEqual([
    [0, 2],
    [2, 4],
    [4, 5],
  ])
})
