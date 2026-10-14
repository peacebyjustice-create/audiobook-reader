import { useEffect, useRef, useState } from 'react'
import { classifyFile } from '../core/classify'
import { useInstallPrompt } from './useInstallPrompt'
import { readTextFile } from '../io/decodeText'
import { downloadJson } from '../io/download'
import { deleteBook, exportBooks, importBooks, listBooks, storageEstimate, type BookMeta } from '../io/store'
import { addFromFiles, openStored, reopen, type LoadedBook } from '../reader/openBook'
import { formatTime } from '../format'

/** 서재: 최근 책 목록(Q35 B)과 책 추가 */
export function Library({ onOpen }: { onOpen: (b: LoadedBook) => void }) {
  const install = useInstallPrompt()
  const [books, setBooks] = useState<BookMeta[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [usage, setUsage] = useState<string>('')
  const reopenTarget = useRef<BookMeta | null>(null)
  const audioInput = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void listBooks().then(setBooks)
    void storageEstimate().then((e) => e && setUsage(`저장 공간 ${(e.usage / 1e6).toFixed(1)}MB 사용`))
  }
  useEffect(refresh, [])

  const run = async (label: string, fn: () => Promise<LoadedBook>) => {
    setError('')
    setBusy(label)
    try {
      onOpen(await fn())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const onAdd = async (list: FileList | null) => {
    if (!list?.length) return
    const files = [...list]
    // 책 패키지(.json): 서재에 가져오기만 하고, 열 때 오디오를 고름
    const packages = files.filter((f) => classifyFile(f.name, f.type) === 'package')
    if (packages.length) {
      setError('')
      try {
        let n = 0
        for (const p of packages) n += await importBooks((await readTextFile(p)).text)
        setBusy(`${n}권을 가져왔습니다. 책을 누르고 오디오 파일을 고르면 이어서 들을 수 있습니다.`)
        refresh()
      } catch (e) {
        setError((e as Error).message)
      }
    }
    const rest = files.filter((f) => classifyFile(f.name, f.type) !== 'package')
    if (rest.length) void run('책을 읽고 정렬하는 중…', () => addFromFiles(rest))
  }

  const backup = async () => {
    const pkg = await exportBooks()
    downloadJson(pkg, `오디오북리더-백업-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const onReopenFile = (list: FileList | null) => {
    const meta = reopenTarget.current
    const file = list?.[0]
    if (!meta || !file) return
    if (classifyFile(file.name, file.type) !== 'audio') return setError('오디오 파일을 골라 주세요.')
    if ((file.name !== meta.audioName || file.size !== meta.audioSize) && !confirm(`'${meta.audioName}'과 다른 파일 같습니다. 그래도 열까요?`)) return
    void run('여는 중…', () => reopen(meta, file))
  }

  return (
    <div className="app library">
      <header className="top">
        <h1>오디오북리더</h1>
        {install && (
          <button type="button" className="open" onClick={install}>
            앱 설치
          </button>
        )}
        <label className="open">
          책 추가
          {/* accept를 비워 둠: Android에서 .srt가 회색으로 막히는 문제 회피(FR-01) */}
          <input type="file" multiple hidden onChange={(e) => onAdd(e.currentTarget.files)} />
        </label>
      </header>
      <input ref={audioInput} type="file" hidden onChange={(e) => onReopenFile(e.currentTarget.files)} />

      {busy && <p className="notice">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {books && books.length === 0 && (
        <section className="empty">
          <p>낭독 오디오(mp3·m4a)와 자막(.srt), 책 원문(md·txt·epub)을 한꺼번에 골라 주세요.</p>
          <p>책 원문이 없으면 자막을 본문처럼 보여 줍니다.</p>
        </section>
      )}

      <ul className="books">
        {books?.map((b) => {
          const pct = b.durationMs > 0 ? Math.min(100, Math.round((100 * b.positionMs) / b.durationMs)) : 0
          return (
            <li key={b.id}>
              <button
                type="button"
                className="book"
                onClick={() => {
                  reopenTarget.current = b
                  if (b.stored) {
                    void run('여는 중…', async () => {
                      const l = await openStored(b)
                      if (l) return l
                      throw new Error(`앱에 보관한 오디오가 없어졌습니다. 책을 다시 눌러 '${b.audioName}'을 골라 주세요.`)
                    }).then(refresh)
                    return
                  }
                  if (audioInput.current) {
                    audioInput.current.value = ''
                    audioInput.current.click()
                  }
                }}
              >
                <span className="title">{b.title}</span>
                <span className="sub">
                  {b.bookFormat ? '책 모드' : '자막 보기'} · {formatTime(b.positionMs)}
                  {b.durationMs > 0 && ` / ${formatTime(b.durationMs)} (${pct}%)`}
                </span>
                <span className="bar-mini">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="hint">{b.stored ? '앱에 보관됨 · 누르면 바로 열림' : `눌러서 '${b.audioName}' 고르기`}</span>
              </button>
              <button
                type="button"
                className="icon"
                aria-label="서재에서 삭제"
                onClick={async () => {
                  if (!confirm(`'${b.title}'의 진도·북마크를 지울까요? 오디오 파일은 지워지지 않습니다.`)) return
                  await deleteBook(b.id)
                  refresh()
                }}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>

      <p className="meta-info">
        다른 앱을 쓸 때 재생이 멈추면: 휴대폰 설정 › 애플리케이션 › Chrome › 배터리 › '제한 없음'으로 바꿔 주세요. 그래도 멈추면 진단 페이지의 결과 JSON(재생 기록 포함)을 보내 주세요.
      </p>
      <footer className="lib-foot">
        <span>{usage}</span>
        {books && books.length > 0 && (
          <button type="button" className="link-inline" onClick={() => void backup()}>
            전체 백업(.json)
          </button>
        )}
        <a href="#diag">진단 페이지</a>
      </footer>
    </div>
  )
}
