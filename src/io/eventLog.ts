// 백그라운드 재생 문제 진단용 이벤트 기록(최근 200개). 진단 페이지 결과 JSON에 함께 나옴
import { createStore, get, set } from 'idb-keyval'

const db = createStore('audiobook-reader-log', 'kv')
const MAX = 200

export interface LogEntry {
  at: string
  ev: string
  /** 그때 화면이 보였는지 */
  visible: boolean
  posSec?: number
}

let pending: LogEntry[] = []
let flushing = false

async function flush() {
  if (flushing) return
  flushing = true
  try {
    while (pending.length) {
      const batch = pending
      pending = []
      const old = (await get<LogEntry[]>('log', db)) ?? []
      await set('log', [...old, ...batch].slice(-MAX), db)
    }
  } finally {
    flushing = false
  }
}

export function logEvent(ev: string, posSec?: number) {
  pending.push({ at: new Date().toISOString(), ev, visible: document.visibilityState === 'visible', posSec })
  void flush()
}

export const readLog = async () => (await get<LogEntry[]>('log', db)) ?? []

/** 재생 요소와 페이지 생명주기 이벤트를 기록. 해제 함수를 돌려줌 */
export function watchPlayback(el: HTMLAudioElement): () => void {
  const media = ['play', 'pause', 'ended', 'stalled', 'waiting', 'error'] as const
  const onMedia = (e: Event) => logEvent(`audio:${e.type}`, Math.round(el.currentTime))
  const onPage = (e: Event) => logEvent(`page:${e.type}${e.type === 'visibilitychange' ? `:${document.visibilityState}` : ''}`, Math.round(el.currentTime))
  const page = ['visibilitychange', 'freeze', 'resume', 'pagehide'] as const
  for (const m of media) el.addEventListener(m, onMedia)
  for (const p of page) document.addEventListener(p, onPage)
  return () => {
    for (const m of media) el.removeEventListener(m, onMedia)
    for (const p of page) document.removeEventListener(p, onPage)
  }
}
