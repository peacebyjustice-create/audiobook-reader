// 책 추가 트레이: 파일을 여러 번 나눠 넣어도(다른 폴더, 끌어다 놓기) 종류별 칸에 모음
import { classifyFile, pickBookFile } from './classify'

export interface Tray<F extends { name: string; type: string }> {
  audio: F | null
  subtitle: F | null
  book: F | null
}

export const EMPTY_TRAY = { audio: null, subtitle: null, book: null }

/**
 * 파일을 칸에 넣음. 같은 종류는 새 파일로 바꿈. 한 번에 책 파일이 여럿이면 오디오와 이름이 같은 것을 고름.
 * 반환: 새 트레이, 책 패키지(.json), 알 수 없는 파일
 */
export function addToTray<F extends { name: string; type: string }>(tray: Tray<F>, files: readonly F[]): { tray: Tray<F>; packages: F[]; unknown: F[] } {
  const next = { ...tray }
  const packages: F[] = []
  const unknown: F[] = []
  const books: F[] = []
  for (const f of files) {
    const k = classifyFile(f.name, f.type)
    if (k === 'audio') next.audio = f
    else if (k === 'subtitle') next.subtitle = f
    else if (k === 'book') books.push(f)
    else if (k === 'package') packages.push(f)
    else unknown.push(f)
  }
  if (books.length) next.book = next.audio ? (pickBookFile(next.audio.name, books) ?? null) : books[0]
  return { tray: next, packages, unknown }
}

export function trayReady(t: Tray<{ name: string; type: string }>): boolean {
  return !!t.audio && !!t.subtitle
}
