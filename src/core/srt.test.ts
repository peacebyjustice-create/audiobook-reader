import { describe, expect, it } from 'vitest'
import { parseSrt } from './srt'

describe('parseSrt', () => {
  it('기본 SRT', () => {
    const { cues } = parseSrt('1\n00:00:00,620 --> 00:00:05,580\nHello world.\n\n2\n00:00:09,600 --> 00:00:10,800\nOne-page summary.\n')
    expect(cues).toEqual([
      { index: 0, startMs: 620, endMs: 5580, text: 'Hello world.' },
      { index: 1, startMs: 9600, endMs: 10800, text: 'One-page summary.' },
    ])
  })

  it('BOM, CRLF, 여러 줄, 태그, 제로폭 문자', () => {
    const { cues } = parseSrt('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>안녕</i>​\r\n{\\an8}하세요\r\n')
    expect(cues[0].text).toBe('안녕 하세요')
  })

  it('VTT 헤더와 점 밀리초', () => {
    const { cues } = parseSrt('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nhi\n')
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2500, text: 'hi' })
  })

  it('역순 정렬, 겹침 잘라내기, 빈 큐 제거', () => {
    const { cues } = parseSrt(
      '2\n00:00:05,000 --> 00:00:07,000\nB\n\n1\n00:00:01,000 --> 00:00:06,000\nA\n\n3\n00:00:08,000 --> 00:00:09,000\n\n',
    )
    expect(cues.map((c) => [c.text, c.startMs, c.endMs])).toEqual([
      ['A', 1000, 5000],
      ['B', 5000, 7000],
    ])
  })

  it('연속 중복 큐(환각 반복)를 하나로 접음', () => {
    const r = parseSrt(
      '1\n00:00:01,000 --> 00:00:02,000\nThank you.\n\n2\n00:00:02,000 --> 00:00:03,000\nthank you\n\n3\n00:00:03,000 --> 00:00:04,000\nNext\n',
    )
    expect(r.folded).toBe(1)
    expect(r.cues.map((c) => [c.text, c.endMs])).toEqual([
      ['Thank you.', 3000],
      ['Next', 4000],
    ])
  })

  it('빈 줄 없이 붙은 다음 블록 번호를 본문에 넣지 않음', () => {
    const { cues } = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n')
    expect(cues.map((c) => c.text)).toEqual(['A', 'B'])
  })

  it('시각이 깨진 블록은 건너뛰고 셈', () => {
    const r = parseSrt('1\nxx --> yy\nA\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n')
    expect(r.skipped).toBe(1)
    expect(r.cues.map((c) => c.text)).toEqual(['B'])
  })
})
