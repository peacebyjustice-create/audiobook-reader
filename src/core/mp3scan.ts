// MP3 VBR 감지(PRD F23, 질문지 R3). 파일 조각(바이트)만 받는 순수 함수. 의존성 없음(codec-parser는 LGPL이라 쓰지 않음)

const BITRATES: Record<string, number[]> = {
  // [MPEG 버전][레이어] → kbps 표(인덱스 0은 free, 15는 금지)
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const SAMPLE_RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] }

export interface FrameHeader {
  version: 1 | 2 | 25
  layer: 1 | 2 | 3
  bitrate: number
  sampleRate: number
  mono: boolean
  length: number
}

export function parseFrameHeader(b: Uint8Array, i: number): FrameHeader | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null
  const v = (b[i + 1] >> 3) & 3
  const l = (b[i + 1] >> 1) & 3
  const bri = b[i + 2] >> 4
  const sri = (b[i + 2] >> 2) & 3
  if (v === 1 || l === 0 || bri === 0 || bri === 15 || sri === 3) return null
  const version = v === 3 ? 1 : v === 2 ? 2 : 25
  const layer = (4 - l) as 1 | 2 | 3
  const bitrate = BITRATES[`${version === 1 ? 1 : 2}-${layer}`][bri]
  const sampleRate = SAMPLE_RATES[version][sri]
  const padding = (b[i + 2] >> 1) & 1
  const mono = b[i + 3] >> 6 === 3
  const samples = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152
  const length = layer === 1 ? (Math.floor((12 * bitrate * 1000) / sampleRate) + padding) * 4 : Math.floor(((samples / 8) * bitrate * 1000) / sampleRate) + padding
  return { version, layer, bitrate, sampleRate, mono, length }
}

/** ID3v2 태그 길이(없으면 0). 앞 10바이트만 있으면 됨 */
export function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
  return 10 + size + (b[5] & 0x10 ? 10 : 0)
}

/** 연속된 유효 프레임(다음 프레임 헤더까지 확인)의 비트레이트 목록 */
export function frameBitrates(b: Uint8Array, maxFrames = 400): number[] {
  const out: number[] = []
  for (let i = 0; i + 4 <= b.length && out.length < maxFrames; ) {
    const h = parseFrameHeader(b, i)
    const next = h && h.length > 4 ? parseFrameHeader(b, i + h.length) : null
    if (h && next && next.sampleRate === h.sampleRate && next.layer === h.layer) {
      out.push(h.bitrate)
      i += h.length
    } else i++
  }
  return out
}

export type Mp3Kind = 'cbr' | 'vbr' | 'unknown'

export interface Mp3Scan {
  kind: Mp3Kind
  /** 첫 프레임의 Xing/Info/VBRI 표지 */
  tag: 'Xing' | 'Info' | 'VBRI' | null
  bitrates: number[]
}

/**
 * first: ID3 태그 바로 뒤부터 읽은 조각, samples: 파일 중간 여러 곳의 조각.
 * Xing 또는 VBRI 표지, 또는 조각들에서 비트레이트가 둘 이상이면 VBR(LAME은 CBR에 'Info'를 씀)
 */
export function scanMp3(first: Uint8Array, samples: Uint8Array[]): Mp3Scan {
  let tag: Mp3Scan['tag'] = null
  for (let i = 0; i + 4 <= first.length && i < 64 * 1024; i++) {
    const h = parseFrameHeader(first, i)
    if (!h) continue
    const sideInfo = h.version === 1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17
    const at = (o: number) => String.fromCharCode(...first.subarray(i + o, i + o + 4))
    if (at(4 + sideInfo) === 'Xing') tag = 'Xing'
    else if (at(4 + sideInfo) === 'Info') tag = 'Info'
    else if (at(36) === 'VBRI') tag = 'VBRI'
    break
  }
  // 첫 프레임은 Xing/Info 정보 프레임일 수 있어 비트레이트 집계에서 뺌
  const rates = [...frameBitrates(first).slice(1), ...samples.flatMap((s) => frameBitrates(s))]
  const distinct = [...new Set(rates)].sort((a, b) => a - b)
  const kind: Mp3Kind = tag === 'Xing' || tag === 'VBRI' || distinct.length > 1 ? 'vbr' : distinct.length === 1 ? 'cbr' : 'unknown'
  return { kind, tag, bitrates: distinct }
}
