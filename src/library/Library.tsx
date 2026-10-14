import { useEffect, useRef, useState } from 'react'
import { classifyFile } from '../core/classify'
import { deleteBook, listBooks, storageEstimate, type BookMeta } from '../io/store'
import { addFromFiles, reopen, type LoadedBook } from '../reader/openBook'
import { formatTime } from '../format'

/** 서재: 최근 책 목록(Q35 B)과 책 추가 */
export function Library({ onOpen }: { onOpen: (b: LoadedBook) => void }) {
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

  const onAdd = (list: FileList | null) => {
    if (list?.length) void run('책을 읽고 정렬하는 중…', () => addFromFiles([...list]))
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
          <p>낭독 오디오(mp3·m4a)와 자막(.srt), 책 원문(md·txt)을 한꺼번에 골라 주세요.</p>
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
                <span className="hint">눌러서 '{b.audioName}' 고르기</span>
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

      <footer className="lib-foot">
        <span>{usage}</span>
        <a href="#diag">진단 페이지</a>
      </footer>
    </div>
  )
}
