// md → 간단한 EPUB(시험용): '## 제목'마다 문서 하나. 사용: npx tsx scripts/md-to-epub.ts 입력.md 출력.epub
import { readFileSync, writeFileSync } from 'node:fs'
import { Marked } from 'marked'
import { makeEpub } from '../src/core/epubFixture'
const [src, out] = process.argv.slice(2)
const md = readFileSync(src, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^---(#{1,6}\s)/gm, '\n---\n\n$1')
const m = new Marked()
const chapters = md.split(/\n(?=## )/).map((p, i) => ({ file: `c${i}.xhtml`, html: (m.parse(p, { async: false }) as string).replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>').replace(/<img([^>]*?)>/g, '<img$1/>') }))
writeFileSync(out, makeEpub(chapters))
