// EPUB → 블록(PRD F28, 질문지 Q12 B): 글자·제목·문단만. 이미지·표 서식은 글자만 남김. DOM 없음(htmlparser2)
import { unzipSync } from 'fflate'
import { Parser } from 'htmlparser2'
import type { BlockInput } from './book'

export class EpubError extends Error {}

const decoder = new TextDecoder('utf-8')

/** 경로 정규화: 'OEBPS/text/../a.xhtml' → 'OEBPS/a.xhtml' */
function resolvePath(base: string, rel: string): string {
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '').concat(decodeURIComponent(rel.split('#')[0])).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

/** 간단한 XML 훑기: 태그 이름(소문자, 접두어 제외)과 속성을 콜백으로 */
function scanTags(xml: string, onTag: (name: string, attrs: Record<string, string>) => void, onText?: (t: string) => void, onClose?: (name: string) => void) {
  const p = new Parser(
    {
      onopentag: (name, attrs) => onTag(name.toLowerCase().replace(/^.*:/, ''), attrs),
      ontext: (t) => onText?.(t),
      onclosetag: (name) => onClose?.(name.toLowerCase().replace(/^.*:/, '')),
    },
    { xmlMode: true, decodeEntities: true },
  )
  p.write(xml)
  p.end()
}

const BLOCK_TAGS = new Set(['p', 'li', 'blockquote', 'div', 'dd', 'dt', 'pre', 'figcaption', 'caption', 'td', 'th', 'section', 'article', 'aside'])
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'svg', 'math', 'rt', 'rp'])

/** XHTML 한 문서 → 블록. 제목(h1~h6)은 heading, 블록 태그 경계에서 문단을 나눔 */
export function xhtmlToBlocks(xhtml: string): BlockInput[] {
  const out: BlockInput[] = []
  let buf = ''
  let heading = 0
  let skip = 0
  /** 여는 태그마다 '건너뛰기를 시작했는지'를 쌓아 두고 닫을 때 되돌림 */
  const stack: boolean[] = []
  const flush = () => {
    const text = buf.replace(/\s+/g, ' ').trim()
    if (text) out.push(heading ? { kind: 'heading', level: heading, text } : { kind: 'text', text })
    buf = ''
  }
  const p = new Parser(
    {
      onopentag(name, attrs) {
        const n = name.toLowerCase()
        // 각주 번호 링크(noteref)는 낭독되지 않으므로 뺌
        const skipping = SKIP_TAGS.has(n) || (attrs['epub:type'] ?? attrs.role ?? '').includes('noteref')
        stack.push(skipping)
        if (skipping) skip++
        const h = /^h([1-6])$/.exec(n)
        if (h) {
          flush()
          heading = Number(h[1])
        } else if (BLOCK_TAGS.has(n)) flush()
        else if (n === 'br') buf += ' '
      },
      ontext(text) {
        if (!skip) buf += text
      },
      onclosetag(name) {
        const n = name.toLowerCase()
        if (stack.pop()) skip--
        if (/^h[1-6]$/.test(n)) {
          flush()
          heading = 0
        } else if (BLOCK_TAGS.has(n)) flush()
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true },
  )
  p.write(xhtml)
  p.end()
  flush()
  return out
}

export interface EpubResult {
  title: string | null
  blocks: BlockInput[]
}

/** EPUB 바이트 → 블록. DRM·고정 레이아웃은 EpubError */
export function parseEpub(bytes: Uint8Array): EpubResult {
  let files: Record<string, Uint8Array>
  try {
    // 글자 문서만 압축 해제(그림·글꼴은 풀지 않아 큰 EPUB도 메모리를 적게 씀)
    files = unzipSync(bytes, { filter: (f) => /\.(x?html?|xml|opf|ncx)$/i.test(f.name) })
  } catch {
    throw new EpubError('EPUB 파일을 열 수 없습니다(압축이 깨졌거나 EPUB이 아님).')
  }
  const text = (path: string) => (files[path] ? decoder.decode(files[path]) : null)

  const container = text('META-INF/container.xml')
  let opfPath = ''
  if (container) scanTags(container, (n, a) => n === 'rootfile' && !opfPath && (opfPath = a['full-path'] ?? ''))
  if (!opfPath) opfPath = Object.keys(files).find((f) => f.endsWith('.opf')) ?? ''
  const opf = opfPath ? text(opfPath) : null
  if (!opf) throw new EpubError('EPUB 목차 정보(OPF)를 찾지 못했습니다.')

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  const spine: string[] = []
  let ncxId = ''
  let title: string | null = null
  let inTitle = false
  let fixedLayout = false
  scanTags(
    opf,
    (n, a) => {
      if (n === 'item') manifest.set(a.id, { href: resolvePath(opfPath, a.href ?? ''), type: a['media-type'] ?? '', props: a.properties ?? '' })
      else if (n === 'itemref' && a.linear !== 'no') spine.push(a.idref)
      else if (n === 'spine') ncxId = a.toc ?? ''
      else if (n === 'title' && title === null) inTitle = true
      else if (n === 'meta' && (a.property === 'rendition:layout' || a.name === 'fixed-layout')) fixedLayout ||= /pre-paginated|true/.test(a.content ?? '')
    },
    (t) => {
      if (inTitle) title = (title ?? '') + t
    },
    (n) => {
      if (n === 'title') inTitle = false
      if (n === 'meta') fixedLayout ||= false
    },
  )
  // 고정 레이아웃 표시는 <meta property="rendition:layout">pre-paginated</meta> 형태도 있음
  if (/rendition:layout"\s*>\s*pre-paginated/.test(opf)) fixedLayout = true

  // DRM: encryption.xml에 본문 문서가 암호화되어 있으면(글꼴 난독화만 있는 경우는 허용)
  const enc = text('META-INF/encryption.xml')
  if (enc) {
    const encrypted: string[] = []
    scanTags(enc, (n, a) => n === 'cipherreference' && encrypted.push(a.uri ?? a.URI ?? ''))
    if (encrypted.some((u) => /\.x?html?$/i.test(u))) throw new EpubError('DRM이 걸린 EPUB이라 읽을 수 없습니다. DRM이 없는 EPUB이나 md/txt로 넣어 주세요.')
  }
  if (fixedLayout) throw new EpubError('고정 레이아웃 EPUB(그림책·잡지형)은 지원하지 않습니다.')

  const titles = navTitles(files, manifest, ncxId)
  const blocks: BlockInput[] = []
  for (const id of spine) {
    const item = manifest.get(id)
    if (!item || !/x?html/.test(item.type + item.href)) continue
    if (item.props.includes('nav')) continue // 목차 문서는 본문이 아님
    const doc = text(item.href)
    if (!doc) continue
    const part = xhtmlToBlocks(doc)
    // 문서에 제목 태그가 없으면 목차의 제목을 챕터 제목으로 넣음
    const navTitle = titles.get(item.href)
    if (navTitle && !part.some((b) => b.kind === 'heading')) blocks.push({ kind: 'heading', level: 1, text: navTitle })
    blocks.push(...part)
  }
  if (!blocks.some((b) => b.kind === 'text')) throw new EpubError('EPUB에서 본문 글자를 찾지 못했습니다(이미지로만 된 책일 수 있음).')
  return { title: (title as string | null)?.trim() || null, blocks }
}

/** 목차(EPUB3 nav 또는 EPUB2 ncx)에서 문서 경로 → 첫 제목 */
function navTitles(files: Record<string, Uint8Array>, manifest: Map<string, { href: string; type: string; props: string }>, ncxId: string): Map<string, string> {
  const out = new Map<string, string>()
  const nav = [...manifest.values()].find((m) => m.props.includes('nav'))
  if (nav && files[nav.href]) {
    let href = ''
    let label = ''
    let inToc = 0
    scanTags(
      decoder.decode(files[nav.href]),
      (n, a) => {
        if (n === 'nav' && (a['epub:type'] ?? a.type ?? '').includes('toc')) inToc++
        if (inToc && n === 'a') {
          href = resolvePath(nav.href, a.href ?? '')
          label = ''
        }
      },
      (t) => {
        if (inToc && href) label += t
      },
      (n) => {
        if (n === 'a' && href) {
          if (!out.has(href) && label.trim()) out.set(href, label.replace(/\s+/g, ' ').trim())
          href = ''
        }
        if (n === 'nav' && inToc) inToc--
      },
    )
    if (out.size) return out
  }
  const ncx = manifest.get(ncxId) ?? [...manifest.values()].find((m) => m.type.includes('ncx'))
  if (ncx && files[ncx.href]) {
    let label = ''
    let inText = false
    let pending: string | null = null
    scanTags(
      decoder.decode(files[ncx.href]),
      (n, a) => {
        if (n === 'text') inText = true
        if (n === 'navpoint') pending = null
        if (n === 'content' && a.src) {
          const href = resolvePath(ncx.href, a.src)
          if (!out.has(href) && (pending ?? label).trim()) out.set(href, (pending ?? label).replace(/\s+/g, ' ').trim())
          label = ''
        }
      },
      (t) => {
        if (inText) label += t
      },
      (n) => {
        if (n === 'text') {
          inText = false
          pending = label
        }
      },
    )
  }
  return out
}
