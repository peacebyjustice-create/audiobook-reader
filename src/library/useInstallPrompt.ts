import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

/** Chrome이 설치 가능하다고 알려 주면(beforeinstallprompt) 설치 함수를 돌려줌. 이미 설치됐거나 지원 안 하면 null */
export function useInstallPrompt(): (() => void) | null {
  const [ev, setEv] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault()
      setEv(e as BeforeInstallPromptEvent)
    }
    const done = () => setEv(null)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', on)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  return ev ? () => void ev.prompt().finally(() => setEv(null)) : null
}
