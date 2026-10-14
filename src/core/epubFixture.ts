// 시험용 EPUB 생성(테스트 전용)
import { strToU8, zipSync } from 'fflate'

/** 시험용 EPUB 만들기 */
export function makeEpub(chapters: { file: string; html: string; navTitle?: string }[], opts: { encryptedHtml?: boolean; fixed?: boolean; nav?: 'nav' | 'ncx' } = {}) {
  const nav = opts.nav ?? 'nav'
  const items = chapters.map((c, i) => `<item id="c${i}" href="text/${c.file}" media-type="application/xhtml+xml"/>`).join('')
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>시험 책</dc:title>${opts.fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}</metadata>` +
        `<manifest>${items}${nav === 'nav' ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'}</manifest>` +
        `<spine${nav === 'ncx' ? ' toc="ncx"' : ''}>${spine}</spine></package>`,
    ),
  }
  for (const c of chapters) files[`OEBPS/text/${c.file}`] = strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body>${c.html}</body></html>`)
  const titled = chapters.filter((c) => c.navTitle)
  if (nav === 'nav')
    files['OEBPS/nav.xhtml'] = strToU8(`<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${titled.map((c) => `<li><a href="text/${c.file}">${c.navTitle}</a></li>`).join('')}</ol></nav></body></html>`)
  else
    files['OEBPS/toc.ncx'] = strToU8(`<ncx><navMap>${titled.map((c, i) => `<navPoint id="n${i}"><navLabel><text>${c.navTitle}</text></navLabel><content src="text/${c.file}"/></navPoint>`).join('')}</navMap></ncx>`)
  if (opts.encryptedHtml)
    files['META-INF/encryption.xml'] = strToU8(`<encryption><EncryptedData><CipherData><CipherReference URI="OEBPS/text/${chapters[0].file}"/></CipherData></EncryptedData></encryption>`)
  return zipSync(files)
}
