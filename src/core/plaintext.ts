import { buildBook, type BlockInput, type Book } from './book'

const HEADING =
  /^(?:제\s*[\d一二三四五六七八九十백]+\s*[장부편화절]|\d+\s*[장화]|chapter\s+[\w-]+|part\s+[\w-]+|prologue|epilogue|introduction|프롤로그|에필로그|들어가며|나가며|서문|머리말)(?:\s|[.:—-]|$)/i
const MAX_HEADING_LEN = 40

/** txt → Book. 빈 줄로 문단을 나누고, 빈 줄이 거의 없으면 줄마다 문단. 챕터 패턴 줄은 제목(Q31 B) */
export function parsePlainText(src: string): Book {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const blankCount = lines.filter((l) => l.trim() === '').length
  const paragraphs = blankCount * 10 < lines.length ? lines : text.split(/\n\s*\n/)
  const out: BlockInput[] = []
  for (const p of paragraphs) {
    const t = p.trim()
    if (!t) continue
    const isHeading = t.length <= MAX_HEADING_LEN && !t.includes('\n') && HEADING.test(t)
    out.push(isHeading ? { kind: 'heading', level: 1, text: t } : { kind: 'text', text: t })
  }
  return buildBook(out)
}
