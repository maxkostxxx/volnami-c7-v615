export const C7_MOTION_EVENT = 'c7-motion-change'
const key = 'c7-motion-paused'

export function readMotionPaused() {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

export function setMotionPaused(paused: boolean) {
  try { localStorage.setItem(key, paused ? '1' : '0') } catch { /* Memory-only choice still works. */ }
  window.dispatchEvent(new CustomEvent(C7_MOTION_EVENT, { detail: { paused } }))
}
