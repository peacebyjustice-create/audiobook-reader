// SRT/VTT 타임스탬프 → 밀리초. 쉼표/점 구분, 시 생략(VTT mm:ss.mmm), 1~3자리 ms 허용.
const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/

export function parseTimestamp(s: string): number | null {
  const m = TIME.exec(s.trim())
  if (!m) return null
  const [, h = '0', min, sec, frac] = m
  const ms = Number(frac.padEnd(3, '0'))
  return ((Number(h) * 60 + Number(min)) * 60 + Number(sec)) * 1000 + ms
}
