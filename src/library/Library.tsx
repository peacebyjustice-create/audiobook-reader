import { useEffect, useRef, useState } from 'react'
import { classifyFile } from '../core/classify'
import { addToTray, EMPTY_TRAY, trayReady, type Tray } from '../core/tray'
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

  const [tray, setTray] = useState<Tray<File>>(EMPTY_TRAY)
  const [trayOpen, setTrayOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  /** 고르거나 끌어다 놓은 파일을 트레이 칸에 넣음(여러 번 나눠 넣어도 됨) */
  const onAdd = async (list: FileList | File[] | null) => {
    if (!list?.length) return
    const r = addToTray(tray, [...list])
    setTray(r.tray)
    if (r.tray.audio || r.tray.subtitle || r.tray.book) setTrayOpen(true)
    setError(r.unknown.length ? `알 수 없는 파일은 뺐습니다: ${r.unknown.map((f) => f.name).join(', ')}` : '')
    // 책 패키지(.json): 서재에 가져오기만 하고, 열 때 오디오를 고름
    const packages = r.packages
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
  }

  const openTray = () => {
    const { audio, subtitle, book } = tray
    if (!audio || !subtitle) return
    void run('책을 읽고 정렬하는 중…', () => addFromFiles(book ? [audio, subtitle, book] : [audio, subtitle])).then(() => {
      setTray(EMPTY_TRAY)
      setTrayOpen(false)
    })
  }

  // 최신 트레이 상태로 처리하도록 ref로 넘김
  const dropped = useRef<((files: File[]) => void) | null>(null)
  useEffect(() => {
    dropped.current = (files) => void onAdd(files)
  })

  // 화면 어디에나 끌어다 놓기
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault()
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) dropped.current?.([...e.dataTransfer.files])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

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
        <button type="button" className="open" onClick={() => setTrayOpen((o) => !o)}>
          책 추가
        </button>
      </header>

      {dragging && <div className="drop-overlay">여기에 놓으면 오디오·자막·책을 칸에 나눠 담습니다</div>}

      {trayOpen && (
        <section className="tray">
          <p className="meta-info">파일을 여러 번 나눠 골라도 되고, 화면에 끌어다 놓아도 됩니다. 오디오와 자막이 있으면 열 수 있습니다.</p>
          {(
            [
              ['audio', '오디오', 'mp3·m4a'],
              ['subtitle', '자막', 'srt·vtt'],
              ['book', '책 원문(선택)', 'md·txt·epub'],
            ] as const
          ).map(([k, label, hint]) => (
            <div key={k} className="row tray-row">
              <span className="tray-label">{label}</span>
              <span className={`tray-file ${tray[k] ? '' : 'blank'}`}>{tray[k]?.name ?? hint}</span>
              {tray[k] && (
                <button type="button" className="icon" aria-label={`${label} 빼기`} onClick={() => setTray({ ...tray, [k]: null })}>
                  ×
                </button>
              )}
              <label className="open small">
                고르기
                {/* accept를 비워 둠: Android에서 .srt가 회색으로 막히는 문제 회피(FR-01) */}
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    void onAdd(e.currentTarget.files)
                    e.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          ))}
          <div className="tray-actions">
            <button type="button" className="link-inline" onClick={() => setTray(EMPTY_TRAY)}>
              비우기
            </button>
            <button type="button" className="primary" disabled={!trayReady(tray) || !!busy} onClick={openTray}>
              열기
            </button>
          </div>
        </section>
      )}
      <input ref={audioInput} type="file" hidden onChange={(e) => onReopenFile(e.currentTarget.files)} />

      {busy && <p className="notice">{busy}</p>}
      {error && <p className="error">{error}</p>}

      {books && books.length === 0 && (
        <section className="empty">
          <p>'책 추가'를 눌러 낭독 오디오(mp3·m4a), 자막(.srt), 책 원문(md·txt·epub)을 담거나, 화면에 끌어다 놓으세요.</p>
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
