import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  srt: 'text/plain; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
}

/**
 * 개발 전용: /samples/* 를 HTTP Range로 서빙(NFR-10 픽스처 로더). 빌드에는 포함되지 않음.
 * local-fixtures/(직접 변환한 시험 파일)를 먼저 찾고, 없으면 samples 심볼릭 링크에서 찾음
 */
function samplesPlugin(): Plugin {
  const dirs = ['local-fixtures', 'samples'].map((d) => join(import.meta.dirname, d))
  return {
    name: 'samples',
    apply: 'serve',
    configureServer(server) {
      const roots = dirs.filter((d) => existsSync(d)).map((d) => realpathSync(d))
      server.middlewares.use('/samples/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = roots.map((r) => join(r, rel)).find((f) => roots.some((r) => f.startsWith(r + sep)) && existsSync(f))
        if (!file) return next()
        const { size } = statSync(file)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Type', MIME[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream')
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (m) {
          const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
          const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
          if (start >= size || start > end) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${size}`)
            return res.end()
          }
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', end - start + 1)
          createReadStream(file, { start, end }).pipe(res)
        } else {
          res.setHeader('Content-Length', size)
          createReadStream(file).pipe(res)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages는 /<저장소 이름>/ 아래에서 서빙됨(배포 워크플로가 BASE_PATH를 넘김)
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    samplesPlugin(),
    // 설치형 앱·오프라인(F21, NFR-05): 앱 코드만 캐시하고 미디어 파일은 캐시하지 않음
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '오디오북리더',
        short_name: '오디오북리더',
        description: '낭독 오디오에 맞춰 책 원문 문장을 강조하고 구간반복하는 리더',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#fdfcf8',
        theme_color: '#3a6ea5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
