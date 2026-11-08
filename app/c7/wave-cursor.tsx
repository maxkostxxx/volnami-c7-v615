'use client'

import { useEffect, useRef } from 'react'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

const wavePath = (radiusX: number, radiusY: number, amplitude: number) => {
  const points = Array.from({ length: 24 }, (_, index) => {
    const angle = index / 24 * Math.PI * 2
    const radius = Math.sin(angle * 3) * amplitude
    return [36 + Math.cos(angle) * (radiusX + radius), 36 + Math.sin(angle) * (radiusY + radius)]
  })
  return `M${points.map(point => point.map(value => value.toFixed(2)).join(' ')).join('L')}Z`
}

export function C7WaveCursor() {
  const rootRef = useRef<SVGSVGElement>(null)
  const arcRef = useRef<SVGPathElement>(null)
  const rippleRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const arc = arcRef.current
    const ripple = rippleRef.current
    if (!root || !arc || !ripple) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const fine = matchMedia('(pointer: fine) and (hover: hover)')
    let targetX = -100, targetY = -100, x = -100, y = -100
    let tilt = 0, tiltTarget = 0, lastScroll = scrollY
    let shape = 0, interactive = false, visible = false
    let raf = 0, lastFrame = 0, rippleStarted = 0
    const enabled = () => fine.matches && !reduced.matches && !readMotionPaused() && !document.hidden
    const path = (rx: number, ry: number, amplitude: number) => wavePath(rx, ry, amplitude)
    const setArc = (value: string) => { if (arc.getAttribute('d') !== value) arc.setAttribute('d', value) }
    const writePosition = () => {
      root.style.transform = `translate3d(${x - 36}px,${y - 36}px,0) rotate(${tilt}deg)`
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      lastFrame = 0
    }
    const clear = () => {
      stop()
      visible = false
      root.style.opacity = '0'
      ripple.style.opacity = '0'
      ripple.removeAttribute('d')
      rippleStarted = 0
      tilt = tiltTarget = 0
    }
    const frame = (timestamp: number) => {
      raf = 0
      if (!enabled()) { clear(); return }
      const delta = lastFrame ? Math.min(.05, Math.max(.001, (timestamp - lastFrame) / 1000)) : 1 / 60
      lastFrame = timestamp
      const positionDamping = 1 - Math.exp(-23 * delta)
      const shapeDamping = 1 - Math.exp(-15 * delta)
      x += (targetX - x) * positionDamping
      y += (targetY - y) * positionDamping
      tilt += (tiltTarget - tilt) * (1 - Math.exp(-12 * delta))
      tiltTarget *= Math.exp(-9 * delta)
      shape += ((interactive ? 1 : 0) - shape) * shapeDamping
      writePosition()
      setArc(path(15.5 + shape * 4.8, 13 + shape * 2.2, 1.4 + shape * 2.6))
      if (rippleStarted) {
        const progress = Math.min(1, (timestamp - rippleStarted) / 680)
        if (progress >= 1) {
          rippleStarted = 0
          ripple.style.opacity = '0'
          ripple.removeAttribute('d')
        } else {
          const eased = 1 - (1 - progress) ** 3
          ripple.setAttribute('d', path(12 + eased * 37, 10 + eased * 31, 1.2 + eased * 3))
          ripple.style.opacity = String((1 - progress) * .78)
        }
      }
      const moving = Math.hypot(targetX - x, targetY - y) > .025
        || Math.abs((interactive ? 1 : 0) - shape) > .002
        || Math.abs(tiltTarget) > .02 || Math.abs(tilt) > .02 || rippleStarted
      if (moving) raf = requestAnimationFrame(frame)
      else {
        x = targetX; y = targetY; tilt = 0; tiltTarget = 0
        shape = interactive ? 1 : 0
        lastFrame = 0
        writePosition()
        setArc(path(15.5 + shape * 4.8, 13 + shape * 2.2, 1.4 + shape * 2.6))
      }
    }
    const wake = () => { if (!raf && enabled()) raf = requestAnimationFrame(frame) }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !enabled()) return
      targetX = event.clientX; targetY = event.clientY
      if (!visible) { x = targetX; y = targetY; visible = true }
      root.style.opacity = '1'
      interactive = event.target instanceof Element && Boolean(event.target.closest('a,button,input,textarea,select,[role="button"]'))
      wake()
    }
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !enabled()) return
      rippleStarted = performance.now()
      wake()
    }
    const onScroll = () => {
      if (!enabled()) { lastScroll = scrollY; return }
      tiltTarget = Math.max(-6, Math.min(6, (scrollY - lastScroll) * .075))
      lastScroll = scrollY
      wake()
    }
    const onLeave = (event: MouseEvent) => { if (!event.relatedTarget) clear() }
    const onVisibility = () => { if (document.hidden) clear() }
    const sync = () => { if (!enabled()) clear() }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('mouseout', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener(C7_MOTION_EVENT, sync)
    reduced.addEventListener('change', sync)
    fine.addEventListener('change', sync)
    return () => {
      clear()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('mouseout', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener(C7_MOTION_EVENT, sync)
      reduced.removeEventListener('change', sync)
      fine.removeEventListener('change', sync)
    }
  }, [])

  return <svg ref={rootRef} className="c7-wave-cursor" viewBox="0 0 72 72" aria-hidden="true" focusable="false" style={{ transform: 'translate3d(-100px,-100px,0)' }}>
    <path ref={arcRef} className="c7-wave-cursor__arc" d={wavePath(15.5, 13, 1.4)} />
    <path ref={rippleRef} className="c7-wave-cursor__ripple" />
    <circle className="c7-wave-cursor__dot" cx="36" cy="36" r="1.6" />
  </svg>
}
