import { defineConfig } from '@playwright/test'

// E2E: 배포용 빌드를 띄워 확인. 파일 이름은 *.e2e.ts(Vitest와 겹치지 않게)
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 300_000,
  // 메모리 시험은 브라우저 프로세스 전체 RSS를 재므로 시험을 하나씩 돌림
  workers: 1,
  use: { baseURL: 'http://localhost:4173', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
})
