// 텍스트(SRT·책) 파일 디코딩 어댑터(K4). 오디오 파일에는 절대 쓰지 않음(CLAUDE.md 금지 규칙).
import { classifyFile } from '../core/classify'

export const TEXT_LIMIT_BYTES = 50 * 1024 * 1024

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'euc-kr'

export function decodeBytes(bytes: Uint8Array): { text: string; encoding: TextEncoding } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    // 'cp949' 라벨은 RangeError. 'euc-kr' 라벨이 브라우저에서 CP949 확장까지 처리
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' }
  }
}

/** EPUB 등 압축 책 파일 상한(그림이 많아 큼. 글자 문서만 압축을 풂) */
export const BOOK_BINARY_LIMIT_BYTES = 200 * 1024 * 1024

/** 책 파일(EPUB) 바이트. 오디오에는 쓰지 않음(CLAUDE.md 금지 규칙) */
export async function readBookBytes(file: Blob & { name?: string }): Promise<Uint8Array> {
  if (file.name && classifyFile(file.name, file.type) === 'audio') throw new Error('오디오 파일은 책으로 읽지 않습니다')
  if (file.size > BOOK_BINARY_LIMIT_BYTES) throw new Error(`책 파일이 너무 큽니다(상한 200MB): ${Math.round(file.size / 1e6)}MB`)
  return new Uint8Array(await file.arrayBuffer())
}

export async function readTextFile(file: Blob & { name?: string }): Promise<{ text: string; encoding: TextEncoding }> {
  if (file.name && classifyFile(file.name, file.type) === 'audio') throw new Error('오디오 파일은 텍스트로 읽지 않습니다')
  if (file.size > TEXT_LIMIT_BYTES) throw new Error(`텍스트 파일이 너무 큽니다(상한 50MB): ${file.size} bytes`)
  // 크기 상한을 확인한 텍스트 파일만 통째로 읽음
  return decodeBytes(new Uint8Array(await file.arrayBuffer()))
}
