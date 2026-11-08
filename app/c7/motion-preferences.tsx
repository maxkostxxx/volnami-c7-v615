'use client'

import { useEffect } from 'react'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

export function C7MotionPreferences() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.c7')
    if (!root) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      root.dataset.c7Motion = reduced.matches || readMotionPaused() ? 'paused' : 'running'
    }
    sync()
    reduced.addEventListener('change', sync)
    window.addEventListener(C7_MOTION_EVENT, sync)
    return () => {
      reduced.removeEventListener('change', sync)
      window.removeEventListener(C7_MOTION_EVENT, sync)
      delete root.dataset.c7Motion
    }
  }, [])

  return null
}
