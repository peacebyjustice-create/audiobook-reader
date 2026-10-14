import { describe, expect, it } from 'vitest'
import { EpubError, parseEpub, xhtmlToBlocks } from './epub'
import { makeEpub } from './epubFixture'

describe('xhtmlToBlocks', () => {
  it('제목·문단·목록, 줄바꿈, 엔티티, 각주 번호·스크립트 제외', () => {
    const blocks = xhtmlToBlocks(
      '<h2>제1장 <span>시작</span></h2><p>첫 문단 &amp; 끝.<a epub:type="noteref" href="#n1"><sup>1</sup></a></p><div><p>둘째<br/>줄</p></div><ul><li>항목</li></ul><script>x()</script><p>  </p>',
    )
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: '제1장 시작' },
      { kind: 'text', text: '첫 문단 & 끝.' },
      { kind: 'text', text: '둘째 줄' },
      { kind: 'text', text: '항목' },
    ])
  })
})

describe('parseEpub', () => {
  it('spine 순서대로, 제목 없는 문서에는 목차(nav) 제목을 챕터로', () => {
    const r = parseEpub(
      makeEpub([
        { file: 'a.xhtml', html: '<p>머리말 본문.</p>', navTitle: '머리말' },
        { file: 'b.xhtml', html: '<h1>1장</h1><p>본문 하나.</p>', navTitle: '1장' },
      ]),
    )
    expect(r.title).toBe('시험 책')
    expect(r.blocks).toEqual([
      { kind: 'heading', level: 1, text: '머리말' },
      { kind: 'text', text: '머리말 본문.' },
      { kind: 'heading', level: 1, text: '1장' },
      { kind: 'text', text: '본문 하나.' },
    ])
  })
  it('EPUB2 ncx 목차도 읽음', () => {
    const r = parseEpub(makeEpub([{ file: 'a.xhtml', html: '<p>본문.</p>', navTitle: '첫 장' }], { nav: 'ncx' }))
    expect(r.blocks[0]).toEqual({ kind: 'heading', level: 1, text: '첫 장' })
  })
  it('DRM·고정 레이아웃·깨진 파일은 이유와 함께 거부', () => {
    expect(() => parseEpub(makeEpub([{ file: 'a.xhtml', html: '<p>x.</p>' }], { encryptedHtml: true }))).toThrow(/DRM/)
    expect(() => parseEpub(makeEpub([{ file: 'a.xhtml', html: '<p>x.</p>' }], { fixed: true }))).toThrow(/고정 레이아웃/)
    expect(() => parseEpub(new Uint8Array([1, 2, 3]))).toThrow(EpubError)
  })
})
