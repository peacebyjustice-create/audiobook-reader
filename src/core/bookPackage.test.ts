import { expect, it } from 'vitest'
import { buildPackage, parsePackage, pickNewer } from './bookPackage'

const meta = (id: string, updatedAt: number) => ({ id, title: id, updatedAt })

it('내보낸 패키지를 다시 읽으면 같음', () => {
  const p = buildPackage([{ meta: meta('a', 1), texts: { srtText: '1\n00:00:00,000 --> 00:00:01,000\nhi\n', bookText: null } }], new Date(0))
  expect(parsePackage(JSON.stringify(p))).toEqual(p)
})

it('잘못된 파일은 이유와 함께 거부', () => {
  expect(() => parsePackage('not json')).toThrow('JSON')
  expect(() => parsePackage('{"format":"x"}')).toThrow('패키지가 아닙니다')
  expect(() => parsePackage('{"format":"audiobook-reader-books","version":99,"books":[]}')).toThrow('새로운 버전')
  expect(() => parsePackage('{"format":"audiobook-reader-books","version":1,"books":[{"meta":{"id":"a","title":"a","updatedAt":1},"texts":{}}]}')).toThrow('자막')
})

it('같은 책이면 더 최근 진도를 남김', () => {
  expect(pickNewer(meta('a', 5), meta('a', 3)).updatedAt).toBe(5)
  expect(pickNewer(meta('a', 2), meta('a', 3)).updatedAt).toBe(3)
  expect(pickNewer(undefined, meta('a', 3)).updatedAt).toBe(3)
})
