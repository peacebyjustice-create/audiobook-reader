// 오디오 파일 검사 어댑터: 파일 전체를 읽지 않고 Blob.slice로 작은 조각만 읽음(CLAUDE.md 금지 규칙 준수)
import { id3v2Size, scanMp3, type Mp3Scan } from '../core/mp3scan'

const CHUNK = 64 * 1024

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, Math.min(end, blob.size)).arrayBuffer())
}

/** mp3가 아니면 null */
export async function probeMp3(blob: Blob, name: string): Promise<Mp3Scan | null> {
  if (!/\.mp3$/i.test(name) && blob.type !== 'audio/mpeg') return null
  const head = await readSlice(blob, 0, 10)
  const start = id3v2Size(head)
  const first = await readSlice(blob, start, start + CHUNK)
  const samples = await Promise.all(
    [0.25, 0.5, 0.75, 0.95].map((p) => {
      const at = Math.floor(start + (blob.size - start) * p)
      return readSlice(blob, at, at + CHUNK)
    }),
  )
  return scanMp3(first, samples)
}
