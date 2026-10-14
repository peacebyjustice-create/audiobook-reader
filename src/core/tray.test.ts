import { expect, it } from 'vitest'
import { addToTray, EMPTY_TRAY, trayReady } from './tray'

const f = (name: string, type = '') => ({ name, type })

it('나눠 넣어도 종류별 칸에 모이고, 같은 종류는 바뀜', () => {
  let r = addToTray(EMPTY_TRAY, [f('a.mp3'), f('a.srt')])
  expect(trayReady(r.tray)).toBe(true)
  expect(r.tray.book).toBeNull()
  r = addToTray(r.tray, [f('책.epub')])
  expect(r.tray.book?.name).toBe('책.epub')
  expect(r.tray.audio?.name).toBe('a.mp3')
  r = addToTray(r.tray, [f('b.m4a', 'audio/mp4')])
  expect(r.tray.audio?.name).toBe('b.m4a')
})

it('책 파일이 여럿이면 오디오와 이름이 같은 것, 패키지·모르는 파일은 따로', () => {
  const r = addToTray(EMPTY_TRAY, [f('X-guide.mp3'), f('X-guide-ko.md'), f('X-guide.md'), f('backup.json'), f('cover.jpg')])
  expect(r.tray.book?.name).toBe('X-guide.md')
  expect(r.packages.map((x) => x.name)).toEqual(['backup.json'])
  expect(r.unknown.map((x) => x.name)).toEqual(['cover.jpg'])
  expect(trayReady(r.tray)).toBe(false)
})
