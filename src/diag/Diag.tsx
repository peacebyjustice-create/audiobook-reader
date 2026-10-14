// 개발용 진단 페이지(#diag, PRD F24·질문지 Q36). 결과 JSON을 복사해 Claude Code에 붙여 넣는 용도.
import { useEffect, useRef, useState } from 'react'
import { HtmlAudioEngine } from '../audio/htmlAudioEngine'
import { Player } from '../core/player'
import { DEFAULT_REPEAT, RepeatController } from '../core/repeat'
import { requestPersist, storageEstimate } from '../io/store'

type Results = Record<string, unknown>

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null)

/** 톤 파일: 초 s의 주파수 = 400 + 20 × (s mod 100) */
function detectSecond(an: AnalyserNode, buf: Float32Array<ArrayBuffer>, rate: number): number | null {
  an.getFloatFrequencyData(buf)
  const binHz = rate / an.fftSize
  let best = -Infinity
  let bin = -1
  for (let i = Math.floor(380 / binHz); i < Math.ceil(2420 / binHz); i++) {
    if (buf[i] > best) {
      best = buf[i]
      bin = i
    }
  }
  if (best < -70) return null
  return ((Math.round((bin * binHz - 400) / 20) % 100) + 100) % 100
}

/** 재생 위치 k초 → k+1초 경계에서 주파수가 바뀌는 순간의 currentTime 오차(ms) */
async function boundaryError(el: HTMLAudioElement, an: AnalyserNode, nextSec: number): Promise<{ errMs: number | null; coarse: number | null }> {
  const buf = new Float32Array(an.frequencyBinCount)
  await wait(150)
  const coarse = detectSecond(an, buf, an.context.sampleRate)
  const t0 = performance.now()
  while (performance.now() - t0 < 2500) {
    const s = detectSecond(an, buf, an.context.sampleRate)
    if (s === nextSec % 100) return { errMs: Math.round(el.currentTime * 1000 - nextSec * 1000), coarse }
    await wait(4)
  }
  return { errMs: null, coarse }
}

async function measureSeeks(file: File, n: number, log: (s: string) => void) {
  const url = URL.createObjectURL(file)
  const el = new Audio(url)
  const ctx = new AudioContext()
  try {
    await new Promise((res, rej) => {
      el.onloadedmetadata = res
      el.onerror = () => rej(new Error('재생할 수 없는 파일'))
    })
    const an = ctx.createAnalyser()
    an.fftSize = 4096
    an.smoothingTimeConstant = 0
    const gain = ctx.createGain()
    gain.gain.value = 0.15
    ctx.createMediaElementSource(el).connect(an)
    an.connect(gain).connect(ctx.destination)
    await ctx.resume()
    // 기준값: 처음부터 이어서 재생할 때의 경계 지연(분석 창 지연 포함)
    el.currentTime = 0
    await el.play()
    const base = await boundaryError(el, an, 2)
    el.pause()
    const dur = el.duration
    const rows: { targetSec: number; coarseOk: boolean; errMs: number | null }[] = []
    for (let i = 0; i < n; i++) {
      const k = Math.floor(5 + ((dur - 20) * i) / Math.max(1, n - 1))
      el.currentTime = k + 0.6
      await new Promise((r) => (el.onseeked = r))
      await el.play()
      const r = await boundaryError(el, an, k + 1)
      el.pause()
      const errMs = r.errMs === null || base.errMs === null ? null : r.errMs - base.errMs
      rows.push({ targetSec: k + 0.6, coarseOk: r.coarse === k % 100, errMs })
      log(`이동 ${i + 1}/${n}: ${k + 0.6}초 → 오차 ${errMs ?? '측정 실패'}ms${r.coarse === k % 100 ? '' : ' (초 단위부터 어긋남)'}`)
    }
    const errs = rows.flatMap((r) => (r.errMs === null ? [] : [Math.abs(r.errMs)]))
    return {
      file: { name: file.name, size: file.size, durationSec: Math.round(dur) },
      baselineMs: base.errMs,
      absErrMs: { p50: pct(errs, 0.5), p90: pct(errs, 0.9), max: errs.length ? Math.max(...errs) : null },
      wrongSecond: rows.filter((r) => !r.coarseOk).length,
      rows,
    }
  } finally {
    el.pause()
    void ctx.close()
    URL.revokeObjectURL(url)
  }
}

async function opfsCopy(file: File) {
  const root = await navigator.storage.getDirectory()
  const h = await root.getFileHandle('diag-copy.bin', { create: true })
  const t0 = performance.now()
  const w = await h.createWritable()
  await file.stream().pipeTo(w)
  const ms = Math.round(performance.now() - t0)
  await root.removeEntry('diag-copy.bin')
  return { name: file.name, sizeMB: Math.round(file.size / 1e5) / 10, ms, MBps: Math.round(file.size / 1e3 / Math.max(1, ms)) }
}

interface LongRun {
  stop: () => Results
}

/** 화면 꺼짐 시험: 1초 타이머 간격, 재생 진행, 2초 구간 반복의 끝점 초과 */
function startLongRun(file: File, gapMs: number): LongRun {
  const url = URL.createObjectURL(file)
  const engine = new HtmlAudioEngine(url)
  const spans = Array.from({ length: 600 }, (_, i) => ({ startMs: i * 2000 + 2000, endMs: i * 2000 + 4000 }))
  const player = new Player(engine, spans)
  const repeat = new RepeatController(player, { ...DEFAULT_REPEAT, gapMs, padStartMs: 0, padEndMs: 0 })
  const overs: number[] = []
  repeat.onWrap = (e) => overs.push(Math.round(e.overshootMs))
  const ticks: number[] = []
  const wall0 = Date.now()
  let last = wall0
  const timer = setInterval(() => {
    const now = Date.now()
    ticks.push(now - last)
    last = now
  }, 1000)
  engine.el.volume = 0.15
  void player.playFrom(10).then(() => repeat.repeatSentence(10))
  return {
    stop() {
      clearInterval(timer)
      const res = {
        gapMs,
        wallSec: Math.round((Date.now() - wall0) / 1000),
        timerGapMs: { p50: pct(ticks, 0.5), max: ticks.length ? Math.max(...ticks) : null },
        wraps: overs.length,
        overshootMs: { p50: pct(overs, 0.5), p90: pct(overs, 0.9), max: overs.length ? Math.max(...overs) : null },
        stillPlaying: !engine.paused,
      }
      repeat.dispose()
      engine.dispose()
      URL.revokeObjectURL(url)
      return res
    },
  }
}

export default function Diag() {
  const [results, setResults] = useState<Results>({})
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const longRun = useRef<LongRun | null>(null)
  const [longActive, setLongActive] = useState(false)
  const [gapMs, setGapMs] = useState(0)
  const addLog = (s: string) => setLog((l) => [...l.slice(-30), s])
  const put = (k: string, v: unknown) => setResults((r) => ({ ...r, [k]: v }))

  useEffect(() => {
    const a = document.createElement('audio')
    const types = {
      mp3: 'audio/mpeg',
      aacM4a: 'audio/mp4; codecs="mp4a.40.2"',
      mp3InMp4: 'audio/mp4; codecs="mp4a.6B"',
      alac: 'audio/mp4; codecs="alac"',
      opus: 'audio/ogg; codecs="opus"',
    }
    void (async () => {
      put('env', {
        ua: navigator.userAgent,
        canPlay: Object.fromEntries(Object.entries(types).map(([k, t]) => [k, a.canPlayType(t)])),
        mediaSession: 'mediaSession' in navigator,
        wakeLock: 'wakeLock' in navigator,
        opfs: typeof navigator.storage?.getDirectory === 'function',
        persisted: await requestPersist(),
        storage: await storageEstimate(),
        deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
        at: new Date().toISOString(),
      })
    })()
  }, [])

  const guard = async (key: string, fn: () => Promise<unknown>) => {
    setRunning(true)
    try {
      put(key, await fn())
    } catch (e) {
      put(key, { error: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  const json = JSON.stringify(results, null, 1)
  return (
    <div className="app diag">
      <header className="top">
        <a className="icon" href="#" aria-label="서재로">
          ‹
        </a>
        <h1>진단</h1>
      </header>
      <p className="meta-info">
        톤 파일은 PC에서 <code>sh scripts/make-tone.sh</code>로 만들어 폰으로 옮겨 주세요. 결과 JSON을 복사해 Claude Code에 붙여 넣으면 됩니다.
      </p>

      <section>
        <h2>1. 이동(seek) 오차</h2>
        <p className="meta-info">tone-cbr.mp3, tone-vbr.mp3, tone.m4a를 각각 골라 20곳으로 이동하며 실제 소리 위치와의 차이를 잽니다. 소리가 작게 납니다.</p>
        <label className="open">
          톤 파일 고르기
          <input type="file" hidden disabled={running} onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            if (f) void guard(`seek:${f.name}`, () => measureSeeks(f, 20, addLog))
          }} />
        </label>
      </section>

      <section>
        <h2>2. 화면 꺼짐 재생·반복</h2>
        <p className="meta-info">톤 파일을 고르고 시작한 뒤 화면을 끄고 20~30분 두었다가 돌아와 '중지'를 누르세요. 2초 구간을 계속 반복하며 끝점 초과를 기록합니다.</p>
        <div className="row">
          <span>반복 사이 쉬기</span>
          <select value={gapMs} onChange={(e) => setGapMs(Number(e.currentTarget.value))} disabled={longActive}>
            <option value={0}>없음</option>
            <option value={3000}>3초</option>
          </select>
        </div>
        {longActive ? (
          <button type="button" onClick={() => {
            put(`screenOff:gap${gapMs}`, longRun.current?.stop())
            longRun.current = null
            setLongActive(false)
            setRunning(false)
          }}>중지</button>
        ) : (
          <label className="open">
            톤 파일 고르고 시작
            <input type="file" hidden disabled={running} onChange={(e) => {
              const f = e.currentTarget.files?.[0]
              if (!f) return
              longRun.current = startLongRun(f, gapMs)
              setLongActive(true)
              setRunning(true)
              addLog('화면 꺼짐 시험 시작')
            }} />
          </label>
        )}
      </section>

      <section>
        <h2>3. 앱 안 보관(OPFS) 복사 속도</h2>
        <p className="meta-info">큰 오디오 파일을 골라 앱 저장소로 스트리밍 복사하는 시간을 잽니다. 잰 뒤 바로 지웁니다.</p>
        <label className="open">
          파일 고르기
          <input type="file" hidden disabled={running} onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            if (f) void guard(`opfs:${f.name}`, () => opfsCopy(f))
          }} />
        </label>
      </section>

      <section>
        <h2>결과</h2>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(json).then(() => addLog('복사했습니다'))}>
          결과 JSON 복사
        </button>
        <textarea readOnly value={json} rows={12} onFocus={(e) => e.currentTarget.select()} />
        <ul className="log">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
