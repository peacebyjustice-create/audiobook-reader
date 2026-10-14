// 파일 → 저장 → 파싱·정렬 → 리더에 넘길 묶음
import type { Alignment } from '../core/align'
import type { Book } from '../core/book'
import { baseName, classifyFile } from '../core/classify'
import { parseMarkdown } from '../core/markdown'
import { parsePlainText } from '../core/plaintext'
import { parseSrt, type Cue } from '../core/srt'
import { bookTimeline, cueTimeline, type Timeline } from '../core/timeline'
import { readTextFile } from '../io/decodeText'
import { bookId, getMeta, getTexts, requestPersist, saveMeta, saveTexts, type BookMeta, type BookTexts } from '../io/store'
import { alignInWorker } from '../workers/alignClient'

/** 정렬된 큐 비율이 이보다 낮으면 책 모드 대신 자막 보기로(Q19 수동 전환의 자동 안전장치) */
const MIN_MATCHED_RATIO = 0.5

export interface LoadedBook {
  meta: BookMeta
  cues: Cue[]
  book: Book | null
  alignment: Alignment | null
  timeline: Timeline
  /** 세그먼트마다 소속 제목(하단 바 표시용) */
  segHeading: (string | null)[]
  audioUrl: string
  revoke?: () => void
  /** 책 모드를 쓰지 못한 이유 등 */
  notice: string | null
}

const PANDOC_HINT =
  'EPUB은 PC에서 md로 바꿔 넣어 주세요: pandoc 책.epub -t gfm -o 책.md  (PDF는 calibre의 ebook-convert로 txt 변환)'

/** 새 책 추가: 오디오 1개 + 자막 1개 + (선택) 책 md/txt 1개 */
export async function addFromFiles(files: File[]): Promise<LoadedBook> {
  const audio = files.find((f) => classifyFile(f.name, f.type) === 'audio')
  const sub = files.find((f) => classifyFile(f.name, f.type) === 'subtitle')
  const bookFile = files.find((f) => classifyFile(f.name, f.type) === 'book')
  if (!audio || !sub) throw new Error('오디오 파일 1개와 자막(.srt/.vtt) 1개를 함께 골라 주세요. 책(md/txt)은 선택입니다.')
  const ext = bookFile?.name.toLowerCase().split('.').pop()
  if (ext === 'epub' || ext === 'pdf') throw new Error(PANDOC_HINT)
  const texts: BookTexts = {
    srtText: (await readTextFile(sub)).text,
    bookText: bookFile ? (await readTextFile(bookFile)).text : null,
  }
  const meta = await upsert(bookId(audio.name, audio.size), baseName(audio.name), audio.name, audio.size, texts, bookFile ? (ext === 'txt' ? 'txt' : 'md') : null)
  const url = URL.createObjectURL(audio)
  return prepare(meta, texts, url, () => URL.revokeObjectURL(url))
}

/** 서재에서 다시 열기: 오디오만 다시 고름(Q33 A) */
export async function reopen(meta: BookMeta, audio: File): Promise<LoadedBook> {
  const texts = await getTexts(meta.id)
  if (!texts) throw new Error('저장된 자막을 찾지 못했습니다. 책을 다시 추가해 주세요.')
  const url = URL.createObjectURL(audio)
  return prepare(meta, texts, url, () => URL.revokeObjectURL(url))
}

/** 개발 전용 픽스처: samples/에서 URL로 */
export async function openFixture(name: string, ext: string): Promise<LoadedBook> {
  const base = `/samples/${encodeURIComponent(name)}`
  const srt = await fetch(`${base}.srt`)
  if (!srt.ok) throw new Error(`픽스처 자막 없음: ${name}`)
  const md = await fetch(`${base}.md`)
  const texts: BookTexts = {
    srtText: await srt.text(),
    bookText: md.ok && md.headers.get('content-type')?.includes('markdown') ? await md.text() : null,
  }
  const meta = await upsert(`fixture:${name}.${ext}`, name, `${name}.${ext}`, -1, texts, texts.bookText ? 'md' : null)
  return prepare(meta, texts, `${base}.${ext}`)
}

async function upsert(id: string, title: string, audioName: string, audioSize: number, texts: BookTexts, bookFormat: BookMeta['bookFormat']) {
  const now = Date.now()
  const old = await getMeta(id)
  const meta: BookMeta = old
    ? { ...old, bookFormat, updatedAt: now }
    : { id, title, audioName, audioSize, bookFormat, createdAt: now, updatedAt: now, positionMs: 0, segId: null, durationMs: 0, offsetMs: 0, rate: 1, bookmarks: [] }
  await saveTexts(id, texts)
  await saveMeta(meta)
  void requestPersist()
  return meta
}

async function prepare(meta: BookMeta, texts: BookTexts, audioUrl: string, revoke?: () => void): Promise<LoadedBook> {
  const { cues } = parseSrt(texts.srtText)
  if (!cues.length) throw new Error('자막에서 큐를 찾지 못했습니다.')
  const base = { meta, cues, audioUrl, revoke }
  if (texts.bookText) {
    const book = meta.bookFormat === 'txt' ? parsePlainText(texts.bookText) : parseMarkdown(texts.bookText)
    try {
      const alignment = await alignInWorker(book, cues)
      const ratio = alignment.stats.matchedCues / Math.max(1, alignment.stats.cues)
      if (ratio >= MIN_MATCHED_RATIO) {
        const timeline = bookTimeline(book, cues, alignment)
        return { ...base, book, alignment, timeline, segHeading: headingsFor(book, timeline), notice: null }
      }
      return srtMode(base, `책과 자막이 잘 맞지 않아(매칭 ${Math.round(ratio * 100)}%) 자막 보기로 엽니다.`)
    } catch (e) {
      return srtMode(base, `책 정렬에 실패해 자막 보기로 엽니다: ${(e as Error).message}`)
    }
  }
  return srtMode(base, null)
}

function srtMode(base: Pick<LoadedBook, 'meta' | 'cues' | 'audioUrl' | 'revoke'>, notice: string | null): LoadedBook {
  const timeline = cueTimeline(base.cues)
  return { ...base, book: null, alignment: null, timeline, segHeading: timeline.segments.map(() => null), notice }
}

function headingsFor(book: Book, tl: Timeline): (string | null)[] {
  const blockHeading: (string | null)[] = []
  let cur: string | null = null
  for (const b of book.blocks) {
    if (b.kind === 'heading') cur = book.text.slice(b.start, b.end)
    blockHeading.push(cur)
  }
  let last: string | null = null
  return tl.segments.map((s) => {
    if (s.sentence !== undefined) last = blockHeading[book.sentences[s.sentence].block]
    return last
  })
}
