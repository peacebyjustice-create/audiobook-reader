// AC-3: 1GB 오디오를 열어 재생하고 임의 위치로 50번 이동해도 브라우저 메모리 증가가 300MB 미만
// 준비: sh scripts/make-big-fixture.sh  (local-fixtures/big-1gb.mp3, .srt)
import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const DIR = join(import.meta.dirname, '../local-fixtures')
const MP3 = join(DIR, 'big-1gb.mp3')
const SRT = join(DIR, 'big-1gb.srt')
/** 이동 횟수(AC-3은 50회). 누수 확인 때는 SEEKS=150처럼 늘림 */
const SEEKS = Number(process.env.SEEKS ?? 50)

/** Playwright가 띄운 브라우저 프로세스들의 RSS 합(MB) */
function browserRssMB(): number {
  const out = execSync('ps -A -o rss=,command=', { encoding: 'utf8', maxBuffer: 1 << 24 })
  return Math.round(
    out
      .split('\n')
      .filter((l) => l.includes('ms-playwright') && !l.includes('ps -A'))
      .reduce((s, l) => s + Number(l.trim().split(/\s+/)[0] || 0), 0) / 1024,
  )
}

test.skip(!existsSync(MP3), '1GB 픽스처가 없음(scripts/make-big-fixture.sh)')

test.setTimeout(900_000)
test(`1GB 오디오 재생·이동 ${SEEKS}회 메모리`, async ({ page }) => {
  expect(statSync(MP3).size).toBeGreaterThanOrEqual(1e9)
  await page.goto('/')
  await page.waitForSelector('.top')
  await page.waitForTimeout(1000)
  const base = browserRssMB()

  const t0 = Date.now()
  await page.locator('.top input[type=file]').setInputFiles([MP3, SRT])
  await page.waitForSelector('.reader .s', { timeout: 60_000 })
  const openMs = Date.now() - t0
  const opened = browserRssMB()

  await page.locator('.reader .s').first().click()
  await page.waitForTimeout(2000)
  const seeks: { target: number; landed: number }[] = []
  /** 10회 이동마다 RSS: 계속 늘면 누수, 평평하면 버퍼 상한 */
  const trend: number[] = []
  for (let i = 0; i < SEEKS; i++) {
    const target = Math.floor(Math.random() * 24_000) * 1000
    const landed = await page.evaluate(async (ms) => {
      const r = document.querySelector<HTMLInputElement>('.bar .progress')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(r, String(ms))
      r.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((res) => setTimeout(res, 400))
      return Number(r.value)
    }, target)
    seeks.push({ target, landed })
    if (i % (SEEKS > 100 ? 50 : 10) === (SEEKS > 100 ? 49 : 9)) trend.push(browserRssMB())
  }
  await page.waitForTimeout(1500)
  const after = browserRssMB()
  const playing = await page.locator('[aria-label="일시정지"]').count()

  const delta = after - base
  console.log(JSON.stringify({ fileMB: Math.round(statSync(MP3).size / 1e6), openMs, rssMB: { base, opened, after, delta, every10Seeks: trend }, playing: playing > 0 }))
  // 이동한 위치가 대체로 맞는지(진행바 값 기준 ±2초)
  expect(seeks.filter((s) => Math.abs(s.landed - s.target) > 2000).length).toBeLessThanOrEqual(2)
  expect(delta).toBeLessThan(300)
})
