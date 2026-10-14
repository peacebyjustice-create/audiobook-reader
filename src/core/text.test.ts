import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parseMarkdown } from './markdown'
import { normalizeText, normIndexAtOrAfter } from './normalize'
import { parsePlainText } from './plaintext'
import { splitSentences } from './sentences'
import { cardinal, ordinal, spokenNumberAt } from './spokenEn'

const pieces = (text: string) => splitSentences(text).map(([s, e]) => text.slice(s, e))

describe('splitSentences', () => {
  it('영어: 이니셜·약어·소문자 시작에서는 나누지 않음', () => {
    expect(pieces('Thomas W. Phelan wrote it. Dr. Kim met Mr. Lee in the U.S. Army. Then he left! Why? “Yes.” Done')).toEqual([
      'Thomas W. Phelan wrote it.',
      'Dr. Kim met Mr. Lee in the U.S. Army.',
      'Then he left!',
      'Why?',
      '“Yes.”',
      'Done',
    ])
    expect(pieces('It costs 3.5 dollars. It rose.')).toEqual(['It costs 3.5 dollars.', 'It rose.'])
  })
  it('한국어', () => {
    expect(pieces('그날 밤 나는 편지를 꺼냈다. 거기에는 “1998년 겨울”이라고 적혀 있었다! 정말일까?')).toEqual([
      '그날 밤 나는 편지를 꺼냈다.',
      '거기에는 “1998년 겨울”이라고 적혀 있었다!',
      '정말일까?',
    ])
  })
})

describe('parseMarkdown', () => {
  it('머리말 제거, 붙은 제목 분리, 인라인 HTML·링크·이미지 처리, 번호 목록', () => {
    const book = parseMarkdown(
      [
        '---',
        'title: X',
        '---',
        '# Title',
        '<p>In <em>Book, </em>we learn &amp; grow.</p>',
        '<p>Second para.</p>',
        '---## Part 1',
        'See [the site](https://x.y) and ![img](a.png) *now*. Next one.',
        '',
        '1. First item',
        '2. Second item',
        '',
        '> **Quote** text',
      ].join('\n'),
    )
    const blocks = book.blocks.map((b) => [b.kind, b.level, book.text.slice(b.start, b.end)])
    expect(blocks).toEqual([
      ['heading', 1, 'Title'],
      ['text', 0, 'In Book, we learn & grow.'],
      ['text', 0, 'Second para.'],
      ['heading', 2, 'Part 1'],
      ['text', 0, 'See the site and now. Next one.'],
      ['text', 0, '1. First item'],
      ['text', 0, '2. Second item'],
      ['text', 0, 'Quote text'],
    ])
    expect(book.sentences.map((s) => book.text.slice(s.start, s.end))).toContain('Next one.')
  })
})

describe('parsePlainText', () => {
  it('빈 줄 문단과 챕터 패턴', () => {
    const book = parsePlainText('제1장 시작\n\n첫 문단입니다. 둘째 문장.\n\n제1장에서 말했듯 이건 본문이다, 길게 이어지는 문장이니까 제목이 아니다.\n')
    expect(book.blocks.map((b) => b.kind)).toEqual(['heading', 'text', 'text'])
  })
})

describe('영어 읽기 형태', () => {
  it('기수·서수·연도·소수·#번호', () => {
    expect(cardinal(35)).toBe('thirtyfive')
    expect(cardinal(1998)).toBe('nineteenninetyeight')
    expect(cardinal(2020)).toBe('twothousandtwenty')
    expect(cardinal(1_500_000)).toBe('onemillionfivehundredthousand')
    expect(ordinal(21)).toBe('twentyfirst')
    expect(ordinal(40)).toBe('fortieth')
    expect(spokenNumberAt('#1: x', 0)).toEqual({ words: 'numberone', length: 2 })
    expect(spokenNumberAt('3.5 m', 0)).toEqual({ words: 'threepointfive', length: 3 })
    expect(spokenNumberAt('1,000 people', 0)).toEqual({ words: 'onethousand', length: 5 })
    expect(spokenNumberAt('2nd place', 0)).toEqual({ words: 'second', length: 3 })
  })
  it('정규화: 책 표기와 전사 표기가 같아짐', () => {
    const n = (s: string) => normalizeText(s).norm
    expect(n('Type #1: Multipliers')).toBe(n('Type number one, multipliers.'))
    expect(n('Truth = reality')).toBe(n('Truth equals reality.'))
    expect(n('Shortform note:')).toBe(n('Short-form note,'))
    expect(n('50% of people')).toBe(n('fifty percent of people'))
  })
})

describe('normalizeText', () => {
  it('map은 오름차순이고 원문 위치를 가리킴', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), (s) => {
        const { norm, map } = normalizeText(s, 'ko')
        if (norm.length !== map.length) return false
        for (let i = 1; i < map.length; i++) if (map[i] < map[i - 1]) return false
        return map.every((p) => p >= 0 && p < s.length)
      }),
    )
  })
  it('normIndexAtOrAfter', () => {
    const { map } = normalizeText('a, b. c')
    expect([...map]).toEqual([0, 3, 6])
    expect(normIndexAtOrAfter(map, 1)).toBe(1)
    expect(normIndexAtOrAfter(map, 7)).toBe(3)
  })
})
