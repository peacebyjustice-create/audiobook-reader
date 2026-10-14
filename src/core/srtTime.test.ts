import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parseTimestamp } from './srtTime'

describe('parseTimestamp', () => {
  it('SRT 쉼표 형식', () => {
    expect(parseTimestamp('00:41:02,100')).toBe(2_462_100)
  })
  it('VTT 점 형식, 시 생략', () => {
    expect(parseTimestamp('01:02.5')).toBe(62_500)
  })
  it('잘못된 입력은 null', () => {
    expect(parseTimestamp('1:2:3')).toBeNull()
    expect(parseTimestamp('')).toBeNull()
  })
  it('포맷 후 다시 파싱하면 같은 값', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 * 3_600_000 }), (ms) => {
        const p = (n: number, w: number) => String(n).padStart(w, '0')
        const s = `${p(Math.floor(ms / 3_600_000), 2)}:${p(Math.floor(ms / 60_000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`
        return parseTimestamp(s) === ms
      }),
    )
  })
})
