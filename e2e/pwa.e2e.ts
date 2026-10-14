// F21: 서비스워커가 등록되고, 네트워크가 끊겨도 앱이 열림(앱 코드만 캐시)
import { expect, test } from '@playwright/test'

test('서비스워커 등록과 오프라인 실행', async ({ page, context }) => {
  await page.goto('/')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toMatch(/\/$/)
  // 첫 방문 뒤 캐시가 채워질 때까지 잠시 기다림
  await page.waitForTimeout(1500)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.top h1')).toHaveText('오디오북리더')
  await page.goto('/#diag')
  await expect(page.locator('.diag h2').first()).toBeVisible()
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json())
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
  await context.setOffline(false)
})
