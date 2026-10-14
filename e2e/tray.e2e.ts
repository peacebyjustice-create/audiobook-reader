// 책 추가 트레이: 다른 폴더의 파일을 나눠 넣고(고르기 + 끌어다 놓기) 열기
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const NAME = 'Cosmos (코스모스)-Carl Sagan-guide'
const SAMPLES = join(import.meta.dirname, '../samples')
const EPUB = join(import.meta.dirname, '../local-fixtures', `${NAME}.epub`)

test.skip(!existsSync(EPUB) || !existsSync(join(SAMPLES, `${NAME}.mp3`)), '로컬 샘플 없음(scripts/md-to-epub.ts로 EPUB 생성)')

test('오디오·자막은 고르고, EPUB은 따로 끌어다 놓아 열기', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '책 추가' }).click()
  const open = page.getByRole('button', { name: '열기' })
  await expect(open).toBeDisabled()

  // 1) 한 폴더에서 오디오만 → 아직 못 엶
  await page.locator('.tray input[type=file]').nth(0).setInputFiles(join(SAMPLES, `${NAME}.mp3`))
  await expect(open).toBeDisabled()
  // 2) 자막 칸에서 자막
  await page.locator('.tray input[type=file]').nth(1).setInputFiles(join(SAMPLES, `${NAME}.srt`))
  await expect(open).toBeEnabled()
  await expect(page.locator('.tray-file').nth(2)).toHaveClass(/blank/)

  // 3) 다른 폴더의 EPUB을 화면에 끌어다 놓기
  const dt = await page.evaluateHandle(
    ({ name, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const d = new DataTransfer()
      d.items.add(new File([bytes], name, { type: 'application/epub+zip' }))
      return d
    },
    { name: `${NAME}.epub`, b64: readFileSync(EPUB).toString('base64') },
  )
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt })
  await expect(page.locator('.drop-overlay')).toBeVisible()
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt })
  await expect(page.locator('.drop-overlay')).toHaveCount(0)
  await expect(page.locator('.tray-file').nth(2)).toHaveText(`${NAME}.epub`)

  await open.click()
  await page.waitForSelector('.reader [data-sent]')
  expect(await page.locator('[data-sent]').count()).toBeGreaterThan(300)
})
