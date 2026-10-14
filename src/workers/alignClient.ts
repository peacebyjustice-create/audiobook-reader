import type { Alignment, Tolerance } from '../core/align'
import type { Book } from '../core/book'
import type { Cue } from '../core/srt'
import type { AlignRequest, AlignResponse } from './align.worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (a: Alignment) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./align.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev: MessageEvent<AlignResponse>) => {
    const p = pending.get(ev.data.id)
    if (!p) return
    pending.delete(ev.data.id)
    if (ev.data.ok) p.resolve(ev.data.alignment)
    else p.reject(new Error(ev.data.error))
  }
  worker.onerror = (ev) => {
    for (const p of pending.values()) p.reject(new Error(ev.message || '정렬 작업자 오류'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/** Web Worker에서 책 정렬 */
export function alignInWorker(book: Book, cues: Cue[], tolerance?: Tolerance): Promise<Alignment> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: AlignRequest = { id, book, cues, tolerance }
    getWorker().postMessage(req)
  })
}
