import type { Page } from '@playwright/test'

/** 서재의 '책 추가' 트레이에 파일을 담고 연다 */
export async function addBook(page: Page, files: string[]) {
  if (!(await page.locator('.tray').count())) await page.getByRole('button', { name: '책 추가' }).click()
  await page.locator('.tray input[type=file]').first().setInputFiles(files)
  await page.getByRole('button', { name: '열기' }).click()
}
