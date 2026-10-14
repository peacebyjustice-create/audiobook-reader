import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { frameBitrates, id3v2Size, parseFrameHeader, scanMp3 } from './mp3scan'

/** MPEG1 Layer3 프레임(헤더 + 0 채움) */
function frame(bitrateIndex: number, sampleRateIndex = 0, padding = 0, mono = true): Uint8Array {
  const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIndex]
  const sr = [44100, 48000, 32000][sampleRateIndex]
  const len = Math.floor((144 * kbps * 1000) / sr) + padding
  const f = new Uint8Array(len)
  f.set([0xff, 0xfb, (bitrateIndex << 4) | (sampleRateIndex << 2) | (padding << 1), mono ? 0xc0 : 0x00])
  return f
}
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

describe('mp3scan (합성)', () => {
  it('프레임 헤더와 길이', () => {
    const h = parseFrameHeader(frame(9), 0)
    expect(h).toMatchObject({ version: 1, layer: 3, bitrate: 128, sampleRate: 44100, mono: true, length: 417 })
  })
  it('ID3v2 길이(syncsafe)', () => {
    expect(id3v2Size(new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 2, 1]))).toBe(10 + 257)
    expect(id3v2Size(new Uint8Array(10))).toBe(0)
  })
  it('고정 비트레이트는 CBR, 섞이면 VBR, 앞의 쓰레기 바이트는 건너뜀', () => {
    const cbr = concat([new Uint8Array([1, 2, 0xff, 3]), ...Array.from({ length: 20 }, () => frame(9))])
    expect(frameBitrates(cbr).every((b) => b === 128)).toBe(true)
    expect(scanMp3(cbr, [cbr]).kind).toBe('cbr')
    const vbr = concat(Array.from({ length: 20 }, (_, i) => frame(i % 2 ? 9 : 11)))
    expect(scanMp3(cbr, [vbr]).kind).toBe('vbr')
  })
  it('첫 프레임의 Xing 표지는 VBR, Info는 CBR 판단을 바꾸지 않음', () => {
    const tagged = (t: string) => {
      const f = frame(9)
      f.set([...t].map((c) => c.charCodeAt(0)), 4 + 17)
      return concat([f, ...Array.from({ length: 10 }, () => frame(9))])
    }
    expect(scanMp3(tagged('Xing'), [])).toMatchObject({ kind: 'vbr', tag: 'Xing' })
    expect(scanMp3(tagged('Info'), [])).toMatchObject({ kind: 'cbr', tag: 'Info' })
  })
})

// 실제 파일(로컬에만 있음): ffmpeg로 만든 CBR/VBR와 샘플 일부
const LOCAL = join(import.meta.dirname, '../../local-fixtures')
const SAMPLES = join(import.meta.dirname, '../../samples')
function scanFile(path: string) {
  const buf = new Uint8Array(readFileSync(path))
  const start = id3v2Size(buf)
  const chunk = (p: number) => buf.subarray(Math.floor(start + (buf.length - start) * p), Math.floor(start + (buf.length - start) * p) + 65536)
  return scanMp3(buf.subarray(start, start + 65536), [0.25, 0.5, 0.75, 0.95].map(chunk))
}
describe.skipIf(!existsSync(join(LOCAL, 'tone-vbr.mp3')))('mp3scan (로컬 파일)', () => {
  it('ffmpeg CBR/VBR, ID3 붙은 CBR', () => {
    expect(scanFile(join(LOCAL, 'tone-cbr.mp3')).kind).toBe('cbr')
    expect(scanFile(join(LOCAL, 'tone-vbr.mp3')).kind).toBe('vbr')
    if (existsSync(join(LOCAL, 'cbr-id3.mp3'))) expect(scanFile(join(LOCAL, 'cbr-id3.mp3')).kind).toBe('cbr')
  })
  it.skipIf(!existsSync(SAMPLES))('샘플 mp3 50개는 모두 CBR', () => {
    const files = readdirSync(SAMPLES).filter((f) => f.endsWith('-guide.mp3'))
    const step = Math.max(1, Math.floor(files.length / 50))
    const kinds = files.filter((_, i) => i % step === 0).slice(0, 50).map((f) => scanFile(join(SAMPLES, f)).kind)
    expect(kinds.filter((k) => k !== 'cbr')).toEqual([])
  }, 60_000)
})
