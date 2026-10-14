// 기기 안 저장소(IndexedDB, idb-keyval). 오디오는 저장하지 않음(Q33 A): 자막·책 글과 진도만.
import { createStore, del, entries, get, set } from 'idb-keyval'
import { buildPackage, parsePackage, pickNewer, type BookPackage, type PackageEntry } from '../core/bookPackage'
import type { ManualAnchor, Tolerance } from '../core/align'
import { DEFAULT_REPEAT, type RepeatSettings } from '../core/repeat'

const db = createStore('audiobook-reader', 'kv')

export interface Bookmark {
  /** 오디오 시각(NFR-09) */
  ms: number
  segId: string
  label: string
  createdAt: number
}

/** 책 한 권의 진도·설정(작고 자주 바뀜) */
export interface BookMeta {
  /** 같은 책 판별: 오디오 파일명 + 크기 */
  id: string
  title: string
  audioName: string
  audioSize: number
  bookFormat: 'md' | 'txt' | null
  createdAt: number
  updatedAt: number
  positionMs: number
  segId: string | null
  durationMs: number
  offsetMs: number
  rate: number
  bookmarks: Bookmark[]
  /** 정렬 허용치(Q19 D). 없으면 보통 */
  tolerance?: Tolerance
  /** 수동 앵커(F16): 다시 정렬해도 유지되는 '제약' */
  anchors?: ManualAnchor[]
  /** 책이 있어도 자막 보기로 보기(Q19 수동 전환) */
  forceSrt?: boolean
}

/** 자막·책 원문(크고 거의 안 바뀜) */
export interface BookTexts {
  srtText: string
  bookText: string | null
}

export interface Settings {
  fontSize: number
  view: 'book' | 'lyrics'
  repeat: RepeatSettings
  /** 잠금화면·이어폰 이전/다음 단위(Q6 D, 기본 문장) */
  remoteUnit: 'sentence' | '15s' | 'chapter'
}

export const DEFAULT_SETTINGS: Settings = { fontSize: 18, view: 'book', repeat: DEFAULT_REPEAT, remoteUnit: 'sentence' }

export function bookId(audioName: string, audioSize: number): string {
  return `${audioName}|${audioSize}`
}

/** 진도 저장은 읽고-고쳐-쓰기라 겹치면 서로 덮어씀: 한 줄로 세워 순서대로 처리 */
let writes: Promise<unknown> = Promise.resolve()
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = writes.then(fn, fn)
  writes = next.catch(() => {})
  return next
}

export async function listBooks(): Promise<BookMeta[]> {
  await writes
  const all = await entries<string, BookMeta>(db)
  return all
    .filter(([k]) => typeof k === 'string' && k.startsWith('meta:'))
    .map(([, v]) => v)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export const getMeta = (id: string) => get<BookMeta>(`meta:${id}`, db)
export const getTexts = (id: string) => get<BookTexts>(`text:${id}`, db)
export const saveMeta = (m: BookMeta) => set(`meta:${m.id}`, m, db)
export const saveTexts = (id: string, t: BookTexts) => set(`text:${id}`, t, db)

export function patchMeta(id: string, patch: Partial<BookMeta>): Promise<BookMeta | undefined> {
  return queued(async () => {
    const m = await getMeta(id)
    if (!m) return undefined
    const next = { ...m, ...patch, updatedAt: Date.now() }
    await saveMeta(next)
    return next
  })
}

export async function deleteBook(id: string) {
  await del(`meta:${id}`, db)
  await del(`text:${id}`, db)
}

/** 책 패키지 내보내기(F22). ids가 없으면 서재 전체 */
export async function exportBooks(ids?: string[]): Promise<BookPackage<BookMeta, BookTexts>> {
  const metas = (await listBooks()).filter((m) => !ids || ids.includes(m.id))
  const books: PackageEntry<BookMeta, BookTexts>[] = []
  for (const meta of metas) {
    const texts = await getTexts(meta.id)
    if (texts) books.push({ meta, texts })
  }
  return buildPackage(books)
}

/** 책 패키지 가져오기. 같은 책은 더 최근 진도를 남기고, 글은 덮어씀. 가져온 권수를 돌려줌 */
export async function importBooks(text: string): Promise<number> {
  const pkg = parsePackage<BookMeta, BookTexts>(text)
  for (const { meta, texts } of pkg.books) {
    await queued(async () => {
      await saveTexts(meta.id, texts)
      await saveMeta(pickNewer(await getMeta(meta.id), meta))
    })
  }
  return pkg.books.length
}

export async function getSettings(): Promise<Settings> {
  const s = await get<Partial<Settings>>('settings', db)
  return { ...DEFAULT_SETTINGS, ...s, repeat: { ...DEFAULT_REPEAT, ...s?.repeat } }
}

export const saveSettings = (s: Settings) => set('settings', s, db)

/** 저장소 영구 보관 요청(NFR-08). 실패해도 동작에는 지장 없음 */
export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}
