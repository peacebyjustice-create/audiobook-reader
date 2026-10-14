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
