import { splitSentences } from './sentences'

export type BlockKind = 'heading' | 'text'

/** 책 블록. start/end는 Book.text 안의 위치 */
export interface Block {
  kind: BlockKind
  /** 제목 레벨(1~6). 본문은 0 */
  level: number
  start: number
  end: number
}

export interface Sentence {
  start: number
  end: number
  block: number
}

/** 모든 포맷을 바꿔 담는 공통 모델(K2): 블록 → 문장. 블록 사이는 '\n' 한 글자 */
export interface Book {
  text: string
  blocks: Block[]
  sentences: Sentence[]
}

export interface BlockInput {
  kind: BlockKind
  level?: number
  text: string
}

export function buildBook(inputs: readonly BlockInput[]): Book {
  const parts: string[] = []
  const blocks: Block[] = []
  const sentences: Sentence[] = []
  let pos = 0
  for (const b of inputs) {
    const text = b.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const bi = blocks.length
    blocks.push({ kind: b.kind, level: b.kind === 'heading' ? (b.level ?? 1) : 0, start: pos, end: pos + text.length })
    const ranges: [number, number][] = b.kind === 'heading' ? [[0, text.length]] : splitSentences(text)
    for (const [s, e] of ranges) sentences.push({ start: pos + s, end: pos + e, block: bi })
    parts.push(text)
    pos += text.length + 1
  }
  return { text: parts.join('\n'), blocks, sentences }
}
