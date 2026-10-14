import { describe, expect, it } from 'vitest'
import { baseName, classifyFile } from './classify'

describe('classifyFile', () => {
  it('확장자로 분류', () => {
    expect(classifyFile('a.MP3')).toBe('audio')
    expect(classifyFile('책.M4A', 'audio/x-m4a')).toBe('audio')
    expect(classifyFile('book.m4b', '')).toBe('audio')
    expect(classifyFile('a.srt', 'application/octet-stream')).toBe('subtitle')
    expect(classifyFile('a.vtt')).toBe('subtitle')
    expect(classifyFile('book-guide.md')).toBe('book')
    expect(classifyFile('x.epub')).toBe('book')
    expect(classifyFile('백업.abr.json')).toBe('package')
  })
  it('확장자가 없으면 MIME', () => {
    expect(classifyFile('recording', 'audio/mpeg')).toBe('audio')
    expect(classifyFile('recording', 'audio/x-m4a')).toBe('audio')
    expect(classifyFile('notes', 'text/plain')).toBe('unknown')
  })
  it('baseName', () => {
    expect(baseName('1-2-3 Magic (1 2 3 매직)-guide.srt')).toBe('1-2-3 Magic (1 2 3 매직)-guide')
  })
})
