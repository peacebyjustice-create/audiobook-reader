import { parseTimestamp } from './srtTime'

export interface Cue {
  /** 정리 후 0부터 매기는 순번. 원본 SRT 번호와 다를 수 있음 */
  index: number
  startMs: number
  endMs: number
  text: string
}

export interface ParseResult {
  cues: Cue[]
  /** 연속 중복(환각 반복)으로 접힌 큐 수 */
  folded: number
  /** 시각을 읽지 못해 버린 블록 수 */
  skipped: number
}

const ARROW = /^\s*(\S+)\s+-->\s+(\S+)/
const INVISIBLE = /[​-‏⁠﻿]/g
const TAGS = /<[^>]*>|\{\\[^}]*\}/g

function cleanText(lines: string[]): string {
  return lines
    .join(' ')
    .replace(INVISIBLE, '')
    .replace(TAGS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function foldKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** 관대한 SRT/VTT 파서(FR-02, FR-03의 반복 접기). 입력은 이미 디코딩된 문자열. */
export function parseSrt(input: string): ParseResult {
  const lines = input.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  const raw: Omit<Cue, 'index'>[] = []
  let skipped = 0

  for (let i = 0; i < lines.length; i++) {
    const m = ARROW.exec(lines[i])
    if (!m) continue
    const start = parseTimestamp(m[1])
    const end = parseTimestamp(m[2])
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '' && !ARROW.test(lines[j])) body.push(lines[j++])
    // 다음 블록 번호 줄이 빈 줄 없이 붙은 경우 제거
    if (j < lines.length && ARROW.test(lines[j]) && /^\d+$/.test(body.at(-1)?.trim() ?? '')) body.pop()
    i = j - 1
    if (start === null || end === null) {
      skipped++
      continue
    }
    const text = cleanText(body)
    if (!text) continue
    raw.push({ startMs: start, endMs: Math.max(start, end), text })
  }

  // 역순 큐 정렬(안정 정렬), 겹침은 앞 큐의 끝을 잘라 해소
  raw.sort((a, b) => a.startMs - b.startMs)
  const cues: Cue[] = []
  let folded = 0
  for (const c of raw) {
    const prev = cues.at(-1)
    if (prev && foldKey(prev.text) === foldKey(c.text)) {
      prev.endMs = Math.max(prev.endMs, c.endMs)
      folded++
      continue
    }
    if (prev && prev.endMs > c.startMs) prev.endMs = c.startMs
    cues.push({ index: cues.length, ...c })
  }
  return { cues, folded, skipped }
}
