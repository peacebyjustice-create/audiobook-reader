/// <reference lib="webworker" />
// 정렬은 메인 스레드에서 돌리지 않음(CLAUDE.md). 입력 상한은 alignBook이 검사
import { alignBook, type Alignment, type Tolerance } from '../core/align'
import type { Book } from '../core/book'
import type { Cue } from '../core/srt'

export interface AlignRequest {
  id: number
  book: Book
  cues: Cue[]
  tolerance?: Tolerance
}

export type AlignResponse = { id: number; ok: true; alignment: Alignment } | { id: number; ok: false; error: string }

self.onmessage = (ev: MessageEvent<AlignRequest>) => {
  const { id, book, cues, tolerance } = ev.data
  let res: AlignResponse
  try {
    res = { id, ok: true, alignment: alignBook(book, cues, { tolerance }) }
  } catch (e) {
    res = { id, ok: false, error: (e as Error).message }
  }
  self.postMessage(res)
}
