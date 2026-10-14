import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { AudioEngine } from './core/audioEngine'

export interface EngineSnapshot {
  currentMs: number
  durationMs: number
  paused: boolean
  error: string | null
}

const EMPTY: EngineSnapshot = { currentMs: 0, durationMs: 0, paused: true, error: null }
const noop = () => () => {}

/** 엔진 상태 구독. 값이 바뀔 때만 새 객체를 돌려줘 다시 그림 */
export function useEngine(engine: AudioEngine | null): EngineSnapshot {
  const cache = useRef(EMPTY)
  const getSnapshot = useCallback(() => {
    if (!engine) return EMPTY
    const s = cache.current
    if (s.currentMs !== engine.currentMs || s.durationMs !== engine.durationMs || s.paused !== engine.paused || s.error !== engine.error)
      cache.current = { currentMs: engine.currentMs, durationMs: engine.durationMs, paused: engine.paused, error: engine.error }
    return cache.current
  }, [engine])
  const subscribe = useCallback((l: () => void) => (engine ? engine.subscribe(l) : noop()), [engine])
  return useSyncExternalStore(subscribe, getSnapshot)
}
