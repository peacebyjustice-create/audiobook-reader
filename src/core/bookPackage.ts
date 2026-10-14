// 책 패키지(.json) 내보내기/가져오기(PRD F22, 질문지 Q14 B·Q34 B). 오디오는 넣지 않음: 자막·책 글·진도·보정만

export const PACKAGE_FORMAT = 'audiobook-reader-books'
export const PACKAGE_VERSION = 1

export interface PackageEntry<M, T> {
  meta: M
  texts: T
}

export interface BookPackage<M, T> {
  format: typeof PACKAGE_FORMAT
  version: number
  exportedAt: string
  books: PackageEntry<M, T>[]
}

export function buildPackage<M, T>(books: PackageEntry<M, T>[], now = new Date()): BookPackage<M, T> {
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, exportedAt: now.toISOString(), books }
}

interface MinimalMeta {
  id: string
  title: string
  updatedAt: number
}
interface MinimalTexts {
  srtText: string
}

/** 형식 검사. 잘못된 파일이면 이유를 담아 throw */
export function parsePackage<M extends MinimalMeta, T extends MinimalTexts>(text: string): BookPackage<M, T> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('JSON 파일이 아닙니다.')
  }
  const p = data as Partial<BookPackage<M, T>>
  if (p?.format !== PACKAGE_FORMAT) throw new Error('오디오북리더 책 패키지가 아닙니다.')
  if (typeof p.version !== 'number' || p.version > PACKAGE_VERSION) throw new Error('더 새로운 버전에서 만든 패키지입니다. 앱을 업데이트해 주세요.')
  if (!Array.isArray(p.books)) throw new Error('패키지에 책 목록이 없습니다.')
  for (const b of p.books) {
    if (typeof b?.meta?.id !== 'string' || typeof b.meta.title !== 'string' || typeof b.meta.updatedAt !== 'number')
      throw new Error('책 정보가 깨져 있습니다.')
    if (typeof b.texts?.srtText !== 'string') throw new Error(`'${b.meta.title}'의 자막이 없습니다.`)
  }
  return p as BookPackage<M, T>
}

/** 가져올 때: 같은 책이 이미 있으면 더 최근에 바뀐 쪽 진도를 남김 */
export function pickNewer<M extends MinimalMeta>(local: M | undefined, incoming: M): M {
  return local && local.updatedAt >= incoming.updatedAt ? local : incoming
}
