import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  srt: 'text/plain; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
}

/** 개발 전용: /samples/* 를 samples 심볼릭 링크에서 HTTP Range로 서빙(NFR-10 픽스처 로더). 빌드에는 포함되지 않음 */
function samplesPlugin(): Plugin {
  const link = join(import.meta.dirname, 'samples')
  return {
    name: 'samples',
    apply: 'serve',
    configureServer(server) {
      if (!existsSync(link)) return
      const root = realpathSync(link)
      server.middlewares.use('/samples/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = join(root, rel)
        if (!file.startsWith(root + sep) || !existsSync(file)) return next()
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
  plugins: [react(), samplesPlugin()],
})
