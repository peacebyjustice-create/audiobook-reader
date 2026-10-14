// 앱 안 보관(F26)과 이어 듣기: 한 번 추가하면 새로고침·서재에서 파일을 다시 고르지 않고 마지막 위치로 열림
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const NAME = '1-2-3 Magic (1 2 3 매직)-Thomas W. Phelan-guide'
const AUDIO = join(import.meta.dirname, '../local-fixtures', `${NAME}.m4a`)
const SAMPLES = join(import.meta.dirname, '../samples')

test.skip(!existsSync(AUDIO) || !existsSync(join(SAMPLES, `${NAME}.srt`)), '로컬 샘플 없음')

const pos = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelector('.time')!.textContent!.split(' / ')[0])

test('한 번 추가한 책은 다시 고르지 않고 마지막 위치에서 열림', async ({ page }) => {
  await page.goto('/')
  await page.locator('.top input[type=file]').setInputFiles([AUDIO, join(SAMPLES, `${NAME}.srt`), join(SAMPLES, `${NAME}.md`)])
  await page.waitForSelector('.reader .s')
  // 40번 문장부터 재생, 저장 주기(5초)보다 조금 더 기다림
  await page.locator('[data-seg="40"]').click()
  await page.waitForTimeout(6500)
  const before = await pos(page)
  // 앱 안 보관이 끝날 때까지
  await expect.poll(async () => page.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('audio', { create: true })
    let n = 0
    for await (const _ of (d as unknown as AsyncIterable<unknown>)) n++
    return n
  }), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(500)

  // 1) 새로고침(백그라운드 종료 흉내): 자동으로 같은 책, 같은 위치
  await page.reload()
  await page.waitForSelector('.reader .s', { timeout: 15_000 })
  await expect.poll(() => pos(page), { timeout: 10_000 }).not.toBe('00:00')
  const afterReload = await pos(page)
  expect(Math.abs(toSec(afterReload) - toSec(before))).toBeLessThanOrEqual(6)

  // 2) 서재로 나가면 자동으로 열지 않고, 책을 누르면 파일 선택 없이 바로 열림
  await page.locator('[aria-label="서재로"]').click()
  await expect(page.locator('.book .hint').first()).toContainText('앱에 보관됨')
  await page.reload()
  await expect(page.locator('.books')).toBeVisible()
  await expect(page.locator('.reader')).toHaveCount(0)
  await page.locator('.book').first().click()
  await page.waitForSelector('.reader .s')
  await expect.poll(() => pos(page), { timeout: 10_000 }).not.toBe('00:00')
  console.log(JSON.stringify({ before, afterReload, reopened: await pos(page) }))
})

function toSec(t: string) {
  return t.split(':').reduce((s, x) => s * 60 + Number(x), 0)
}
