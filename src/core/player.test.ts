import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { FakeAudioEngine } from './audioEngine'
import { Player } from './player'
import { findIndexAt } from './navigation'
import type { Cue } from './srt'

const cues: Cue[] = [
  { index: 0, startMs: 1000, endMs: 3000, text: 'a' },
  { index: 1, startMs: 4000, endMs: 6000, text: 'b' },
  { index: 2, startMs: 6000, endMs: 9000, text: 'c' },
]

function setup(at: number) {
  const engine = new FakeAudioEngine(20_000)
  engine.seek(at)
  return { engine, player: new Player(engine, cues) }
}

describe('Player', () => {
  it('첫 큐 이전은 -1, 무음 구간은 직전 큐 유지', () => {
    expect(setup(500).player.currentIndex()).toBe(-1)
    expect(setup(3500).player.currentIndex()).toBe(0)
    expect(setup(15_000).player.currentIndex()).toBe(2)
  })

  it('이전: 시작 1.5초 안이면 이전 문장, 뒤면 현재 문장 처음', () => {
    const early = setup(4500)
    early.player.prev()
    expect(early.engine.currentMs).toBe(1000)

    const late = setup(5600)
    late.player.prev()
    expect(late.engine.currentMs).toBe(4000)
  })

  it('다음: 다음 큐 시작, 마지막에서는 마지막 유지, 첫 큐 이전이면 첫 큐', () => {
    const mid = setup(4500)
    mid.player.next()
    expect(mid.engine.currentMs).toBe(6000)

    const last = setup(7000)
    last.player.next()
    expect(last.engine.currentMs).toBe(6000)

    const before = setup(0)
    before.player.next()
    expect(before.engine.currentMs).toBe(1000)
  })

  it('탭하면 그 문장부터 재생', async () => {
    const { engine, player } = setup(0)
    await player.playFrom(2)
    expect(engine.paused).toBe(false)
    expect(engine.currentMs).toBe(6000)
    engine.advance(1000)
    expect(player.currentIndex()).toBe(2)
  })

  it('findIndexAt은 선형 탐색과 같은 결과', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e6 })), fc.integer({ min: -10, max: 1e6 + 10 }), (xs, t) => {
        const starts = [...xs].sort((a, b) => a - b)
        let expected = -1
        starts.forEach((s, i) => {
          if (s <= t) expected = i
        })
        return findIndexAt(starts, t) === expected
      }),
    )
  })
})
