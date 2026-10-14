import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { FakeAudioEngine } from './audioEngine'
import { Player } from './player'
import { DEFAULT_REPEAT, RepeatController, type RepeatSettings } from './repeat'

// 문장 0~5: 각 2초, 사이 0.5초 무음. 시작 1000, 3500, 6000, 8500, 11000, 13500
const spans = Array.from({ length: 6 }, (_, i) => ({ startMs: 1000 + i * 2500, endMs: 3000 + i * 2500 }))

function setup(at: number, settings: Partial<RepeatSettings> = {}, playing = true) {
  const engine = new FakeAudioEngine(20_000)
  engine.seek(at)
  if (playing) void engine.play()
  const player = new Player(engine, spans)
  const rep = new RepeatController(player, { ...DEFAULT_REPEAT, ...settings })
  return { engine, player, rep }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('RepeatController', () => {
  it('같은 문장에서 두 번 누르면 그 문장만 반복, 끝+여유에서 시작−여유로 돌아감', () => {
    const { engine, rep } = setup(4300)
    rep.press()
    expect(rep.state).toEqual({ mode: 'armed', start: 1 })
    engine.advance(500)
    rep.press()
    expect(rep.state).toEqual({ mode: 'loop', start: 1, end: 1, done: 0 })
    expect(engine.currentMs).toBe(4800) // 규칙 4: 누르는 순간 이동 없음
    engine.advance(800) // 5600 < 5500+200
    expect(engine.currentMs).toBe(5600)
    engine.advance(200) // 5800 ≥ 5700 → 되돌림
    expect(engine.currentMs).toBe(3500 - 150)
    expect(rep.state).toMatchObject({ done: 1 })
  })

  it('세 번째 누름은 해제', () => {
    const { rep } = setup(4300)
    rep.press()
    rep.press()
    rep.press()
    expect(rep.state).toEqual({ mode: 'off' })
  })

  it('규칙 1: 문장이 바뀐 지 0.7초 안에 누르면 직전 문장', () => {
    const { rep } = setup(3500 + 300)
    rep.press()
    expect(rep.state).toEqual({ mode: 'armed', start: 0 })
  })

  it('규칙 2: 일시정지 중에는 강조된 문장 기준(유예 없음)', () => {
    const { rep } = setup(3500 + 300, {}, false)
    rep.press()
    expect(rep.state).toEqual({ mode: 'armed', start: 1 })
  })

  it('규칙 3: 끝을 시작보다 앞 문장에서 누르면 순서를 바꿈', () => {
    const { engine, rep } = setup(9000, {}, false)
    rep.press()
    engine.seek(4000)
    rep.press()
    expect(rep.state).toMatchObject({ mode: 'loop', start: 1, end: 3 })
  })

  it('반복 버튼 길게 누르기 = 지금 문장 반복', () => {
    const { rep } = setup(6800)
    rep.repeatCurrent()
    expect(rep.state).toMatchObject({ mode: 'loop', start: 2, end: 2 })
  })

  it('횟수: 한 문장 반복은 N회 후 다음 문장 반복으로', () => {
    const { engine, rep } = setup(4300, { count: 2 })
    rep.repeatCurrent()
    engine.advance(1500) // 5800: 1회
    expect(rep.state).toMatchObject({ start: 1, done: 1 })
    engine.advance(2400) // 3350 + 2400 = 5750: 2회 → 다음 문장
    expect(rep.state).toMatchObject({ mode: 'loop', start: 2, end: 2, done: 0 })
    expect(engine.currentMs).toBe(6000 - 150)
  })

  it('횟수: 여러 문장 구간은 N회 후 해제하고 계속 재생', () => {
    const { engine, rep } = setup(1500, { count: 1 })
    rep.repeatFrom(0)
    rep.repeatTo(1)
    const t = engine.currentMs
    engine.advance(5700 - t)
    expect(rep.state).toEqual({ mode: 'off' })
    expect(engine.paused).toBe(false)
  })

  it('쉬는 시간: 끝에서 멈췄다가 시간이 지나면 시작부터 재생', () => {
    const { engine, rep } = setup(4300, { gapMs: 1000 })
    rep.repeatCurrent()
    engine.advance(1500)
    expect(engine.paused).toBe(true)
    vi.advanceTimersByTime(999)
    expect(engine.paused).toBe(true)
    vi.advanceTimersByTime(1)
    expect(engine.paused).toBe(false)
    expect(engine.currentMs).toBe(3350)
  })

  it('타이머: 엔진 갱신이 없어도 끝 시각에 확인함(K7)', () => {
    const { engine, rep } = setup(4300)
    rep.repeatCurrent()
    // 엔진 시계를 몰래 진행(화면 꺼짐으로 이벤트가 오지 않는 상황)
    engine.currentMs = 5750
    vi.advanceTimersByTime(1399)
    expect(engine.currentMs).toBe(5750)
    vi.advanceTimersByTime(1)
    expect(engine.currentMs).toBe(3350)
  })

  it('Q26 B: 한 문장 반복 중 다음/이전은 반복을 옮김, 구간 반복 중이면 해제 후 이동', () => {
    const { engine, rep } = setup(4300)
    rep.repeatCurrent()
    rep.next()
    expect(rep.state).toMatchObject({ mode: 'loop', start: 2, end: 2 })
    expect(engine.currentMs).toBe(5850)
    rep.prev()
    expect(rep.state).toMatchObject({ start: 1, end: 1 })

    rep.repeatFrom(0)
    expect(rep.state).toMatchObject({ start: 0, end: 1 })
    rep.next()
    expect(rep.state).toEqual({ mode: 'off' })
  })

  it('규칙 6: 문장 탭은 반복을 해제하고 그 문장부터', async () => {
    const { engine, rep } = setup(4300)
    rep.repeatCurrent()
    await rep.tap(4)
    expect(rep.state).toEqual({ mode: 'off' })
    expect(engine.currentMs).toBe(11000)
  })

  it('여기까지 반복: 시작 없이 끝만 정하면 그 문장 하나, 밖에 있으면 시작으로 이동', () => {
    const { engine, rep } = setup(1500)
    rep.repeatTo(3)
    expect(rep.state).toMatchObject({ mode: 'loop', start: 3, end: 3 })
    expect(engine.currentMs).toBe(8500 - 150)
  })

  it('앞 여유 구간에서도 반복 시작 문장을 강조', () => {
    const { engine, rep } = setup(4300)
    rep.repeatCurrent()
    engine.advance(1500)
    expect(engine.currentMs).toBe(3350)
    expect(rep.displayIndex()).toBe(1)
  })

  it('무작위 조작에도 반복 중 재생 위치는 구간 안(여유 포함)에 머묾', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constant('press'), fc.constant('long'), fc.constant('prev'), fc.constant('next'), fc.integer({ min: 50, max: 900 })), { maxLength: 60 }),
        (ops) => {
          const { engine, player, rep } = setup(1200)
          for (const op of ops) {
            if (op === 'press') rep.press()
            else if (op === 'long') rep.repeatCurrent()
            else if (op === 'prev') rep.prev()
            else if (op === 'next') rep.next()
            else engine.advance(op)
            const s = rep.state
            if (s.mode === 'loop' && !engine.paused) {
              const lo = player.audioStart(s.start) - 150
              const hi = player.audioEnd(s.end) + 200 + 900
              if (engine.currentMs < lo - 1 || engine.currentMs > hi) return false
            }
          }
          rep.dispose()
          return true
        },
      ),
    )
  })
})
