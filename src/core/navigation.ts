/** 시작 시각 배열(오름차순)에서 t 이하인 마지막 위치. t가 첫 시작보다 앞이면 -1. 무음 구간에서는 직전 큐 유지(FR-05). */
export function findIndexAt(starts: ArrayLike<number>, t: number): number {
  let lo = 0
  let hi = starts.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** '이전'을 이 시간 안에 누르면 이전 문장, 그 뒤면 현재 문장 처음(FR-06) */
export const PREV_GRACE_MS = 1500

export function prevTarget(starts: ArrayLike<number>, t: number): number {
  if (starts.length === 0) return -1
  const i = findIndexAt(starts, t)
  if (i < 0) return 0
  if (t - starts[i] < PREV_GRACE_MS) return Math.max(0, i - 1)
  return i
}

export function nextTarget(starts: ArrayLike<number>, t: number): number {
  if (starts.length === 0) return -1
  return Math.min(starts.length - 1, findIndexAt(starts, t) + 1)
}
