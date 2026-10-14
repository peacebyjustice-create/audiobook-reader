export type FileKind = 'audio' | 'subtitle' | 'book' | 'package' | 'unknown'

const AUDIO = new Set(['mp3', 'm4a', 'm4b', 'aac', 'mp4', 'ogg', 'oga', 'opus', 'wav', 'flac', 'webm'])
const SUBTITLE = new Set(['srt', 'vtt'])
const BOOK = new Set(['md', 'markdown', 'txt', 'epub', 'pdf'])

/** 확장자 우선, 없으면 MIME으로 분류(FR-01). Android는 .srt MIME이 비어 있거나 엉뚱할 수 있음 */
export function classifyFile(name: string, mime = ''): FileKind {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (SUBTITLE.has(ext)) return 'subtitle'
  if (ext === 'json') return 'package'
  if (BOOK.has(ext)) return 'book'
  if (AUDIO.has(ext)) return 'audio'
  if (mime.startsWith('audio/')) return 'audio'
  return 'unknown'
}

/**
 * 책 파일이 여러 개면 오디오와 이름이 같은 것을 고름(예: 'X-guide.md'와 번역본 'X-guide-ko.md'가 함께 있을 때).
 * 이름이 같은 게 없으면 오디오 이름으로 시작하는 것, 그다음 이름이 짧은 것
 */
export function pickBookFile<T extends { name: string }>(audioName: string, books: readonly T[]): T | undefined {
  const base = baseName(audioName).toLowerCase()
  const score = (f: T) => {
    const b = baseName(f.name).toLowerCase()
    return b === base ? 0 : b.startsWith(base) ? 1 : 2
  }
  return [...books].sort((x, y) => score(x) - score(y) || x.name.length - y.name.length)[0]
}

/** 같은 책인지 판별용 이름: 확장자를 뗀 파일명 */
export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}
