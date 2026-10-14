/** 브라우저 다운로드로 파일 저장(작은 JSON 전용) */
export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 파일 이름에 못 쓰는 글자 제거 */
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120)
}
