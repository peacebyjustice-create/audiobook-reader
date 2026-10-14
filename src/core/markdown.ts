import { Lexer, type Token, type Tokens } from 'marked'
import { buildBook, type BlockInput, type Book } from './book'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
}

/** 인라인 토큰 → 글자. 링크는 글자만, 이미지·인라인 HTML 태그는 버림(안쪽 글자는 별도 토큰으로 남음) */
function inlineText(tokens: Token[] | undefined): string {
  if (!tokens) return ''
  let out = ''
  for (const t of tokens) {
    switch (t.type) {
      case 'image':
      case 'html':
        break
      case 'br':
        out += ' '
        break
      case 'codespan':
      case 'escape':
        out += decodeEntities((t as Tokens.Codespan).text)
        break
      case 'text':
        out += 'tokens' in t && t.tokens ? inlineText(t.tokens) : decodeEntities(t.text)
        break
      default:
        out += 'tokens' in t && t.tokens ? inlineText(t.tokens) : decodeEntities('text' in t ? String(t.text) : '')
    }
  }
  return out
}

function walk(tokens: Token[], out: BlockInput[]) {
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        out.push({ kind: 'heading', level: (t as Tokens.Heading).depth, text: inlineText(t.tokens) })
        break
      case 'paragraph':
        out.push({ kind: 'text', text: inlineText(t.tokens) })
        break
      case 'text':
        out.push({ kind: 'text', text: 'tokens' in t && t.tokens ? inlineText(t.tokens) : decodeEntities(t.text) })
        break
      case 'html':
        // 블록 HTML: 문단·목록 항목 단위로 나눔
        for (const piece of (t as Tokens.HTML).text.split(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?>/i))
          out.push({ kind: 'text', text: stripTags(piece) })
        break
      case 'list': {
        // 번호 목록은 번호를 글자로 남김: 낭독기가 'Number one, …'처럼 읽음
        const list = t as Tokens.List
        list.items.forEach((item, i) => {
          const first = out.length
          walk(item.tokens, out)
          if (list.ordered && out[first]) out[first].text = `${(Number(list.start) || 1) + i}. ${out[first].text}`
        })
        break
      }
      case 'blockquote':
        walk((t as Tokens.Blockquote).tokens, out)
        break
      case 'code':
        out.push({ kind: 'text', text: (t as Tokens.Code).text })
        break
      case 'table': {
        const tb = t as Tokens.Table
        out.push({ kind: 'text', text: tb.header.map((c) => inlineText(c.tokens)).join(' ') })
        for (const row of tb.rows) out.push({ kind: 'text', text: row.map((c) => inlineText(c.tokens)).join(' ') })
        break
      }
      default:
        break // space, hr, def
    }
  }
}

/** 마크다운 → Book. YAML 머리말 제거, 마크다운 파서 토큰으로 제목 인식(K3) */
export function parseMarkdown(src: string): Book {
  let s = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  s = s.replace(/^---\n[\s\S]*?\n---\n/, '')
  // 구분선 바로 뒤에 제목이 붙은 줄('---## 제목')을 분리. 앞에도 빈 줄을 넣어 HTML 블록·setext 제목에 먹히지 않게 함
  s = s.replace(/^---(#{1,6}\s)/gm, '\n---\n\n$1')
  const out: BlockInput[] = []
  walk(new Lexer().lex(s), out)
  return buildBook(out)
}
