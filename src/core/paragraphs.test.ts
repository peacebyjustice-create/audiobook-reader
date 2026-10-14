import { expect, it } from 'vitest'
import { groupBySilence } from './paragraphs'

const cue = (index: number, startMs: number, endMs: number) => ({ index, startMs, endMs, text: '' })

it('무음 2초 이상에서 문단을 나눔', () => {
  const cues = [cue(0, 0, 1000), cue(1, 1500, 3000), cue(2, 5000, 6000), cue(3, 6100, 7000)]
  expect(groupBySilence(cues)).toEqual([
    [0, 2],
    [2, 4],
  ])
  expect(groupBySilence([])).toEqual([])
})
