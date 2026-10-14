// 오디오 앱 안 보관(PRD F26, 질문지 Q33 B): OPFS에 스트리밍 복사(CLAUDE.md 규칙: file.stream().pipeTo만 씀)
const DIR = 'audio'

/** 책 ID → OPFS 파일 이름(오디오 내용이 아니라 ID 문자열만 해시) */
function fileName(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return `a${(h >>> 0).toString(36)}-${id.length}`
}

async function dir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIR, { create: true })
}

export function opfsSupported(): boolean {
  return typeof navigator.storage?.getDirectory === 'function'
}

/** 스트리밍 복사. onProgress(0~1). 실패하면 반쯤 쓴 파일을 지움 */
export async function storeAudio(id: string, file: File, onProgress?: (r: number) => void): Promise<void> {
  const d = await dir()
  const name = fileName(id)
  const handle = await d.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  let done = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      done += chunk.byteLength
      onProgress?.(file.size ? done / file.size : 1)
      ctl.enqueue(chunk)
    },
  })
  try {
    await file.stream().pipeThrough(counter).pipeTo(writable)
  } catch (e) {
    await d.removeEntry(name).catch(() => {})
    throw e
  }
}

/** 보관한 오디오(디스크를 가리키는 File). 없으면 null */
export async function loadAudio(id: string, name: string, type = ''): Promise<File | null> {
  try {
    const f = await (await (await dir()).getFileHandle(fileName(id))).getFile()
    return new File([f], name, { type: type || f.type })
  } catch {
    return null
  }
}

export async function removeAudio(id: string): Promise<void> {
  await (await dir()).removeEntry(fileName(id)).catch(() => {})
}
