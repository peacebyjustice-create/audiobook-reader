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

/** 같은 책인지 판별용 이름: 확장자를 뗀 파일명 */
export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}
