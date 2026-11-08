'use client'

import { useEffect, useRef, type HTMLAttributes } from 'react'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

type Item = { element: HTMLElement; phase: 'armed' | 'running' | 'shown'; animation?: Animation; top: number; bottom: number; direction: number }

export function C7WaveReveal({ children, className = '', intro = false, ...props }: HTMLAttributes<HTMLDivElement> & { intro?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = ref.current
    if (!panel || !('IntersectionObserver' in window) || !Element.prototype.animate) return
    const content = panel.querySelector<HTMLElement>('.c7-wave-reveal__content')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    // Reading units enter independently, including cards deep in mobile sections.
    const candidates = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, .c7-about-copy > p, .c7-process li, .c7-service-list > article, .c7-section-heading, .c7-case, .c7-quotes-wrap, .c7-contact-copy, address, .c7-brief-intro, form, .c7-project-story-text, .c7-project-gallery figure, .c7-project-lead, .c7-project-eyebrow, .c7-project-scroll'))
    const elements = candidates.filter(element => !candidates.some(parent => parent !== element && parent.contains(element)))
    if (panel.classList.contains('c7-hero-copy')) elements.push(...Array.from(content.querySelectorAll<HTMLElement>(':scope > p')))
    if (!elements.length) elements.push(...Array.from(content.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.tagName !== 'NOSCRIPT'))
    const items: Item[] = elements.map(element => ({ element, phase: 'shown', top: 0, bottom: 0, direction: 1 }))
    const byElement = new Map(items.map(item => [item.element, item]))
    const tokens = getComputedStyle(panel)
    const duration = parseFloat(tokens.getPropertyValue('--c7-wave-duration')) || 620
    const rise = parseFloat(tokens.getPropertyValue('--c7-wave-rise')) || 36
    const stagger = parseFloat(tokens.getPropertyValue('--c7-wave-stagger')) || 42
    let disposed = false, entries = 0
    const enabled = () => !reduced.matches && !readMotionPaused()
    const report = () => { panel.dataset.waveState = items.some(item => item.phase === 'running') ? 'running' : items.every(item => item.phase === 'armed') ? 'armed' : 'shown' }
    const stop = (item: Item) => { item.animation?.cancel(); item.animation = undefined }
    const show = (item: Item) => {
      stop(item)
      item.phase = 'shown'
      item.element.classList.remove('is-motion-pending', 'is-motion-running')
      item.element.dataset.motionState = 'shown'
    }
    const showAll = () => { items.forEach(show); report() }
    const arm = (item: Item, top: number, bottom: number) => {
      if (!enabled()) { show(item); return }
      stop(item)
      item.top = top + scrollY; item.bottom = bottom + scrollY
      item.direction = top >= 0 ? 1 : -1
      item.phase = 'armed'
      item.element.classList.remove('is-motion-running')
      item.element.classList.add('is-motion-pending')
      item.element.dataset.motionState = 'armed'
    }
    const enter = (item: Item, index = 0) => {
      if (disposed || item.phase !== 'armed') return
      if (!enabled()) { show(item); return }
      // Keep the untransformed layout position: the lift must not cancel itself
      // when its animated edge momentarily moves outside the viewport.
      const box = item.element.getBoundingClientRect()
      item.top = box.top + scrollY; item.bottom = box.bottom + scrollY
      item.phase = 'running'
      item.element.classList.remove('is-motion-pending')
      item.element.classList.add('is-motion-running')
      item.element.dataset.motionState = 'running'
      item.element.dataset.motionEntries = String(Number(item.element.dataset.motionEntries || 0) + 1)
      panel.dataset.waveDirection = item.direction > 0 ? 'down' : 'up'
      panel.dataset.waveEntries = String(++entries)
      const y = item.direction * rise
      const animation = item.element.animate([
        { transform: `translate3d(0,${y}px,0)`, opacity: 0, offset: 0, easing: 'cubic-bezier(.16,.7,.25,1)' },
        { transform: `translate3d(0,${-item.direction * 3}px,0)`, opacity: 1, offset: .76, easing: 'ease-out' },
        { transform: 'translate3d(0,0,0)', opacity: 1, offset: 1 },
      ], { duration, delay: Math.min(index * stagger, 100), fill: 'both' })
      item.animation = animation
      animation.finished.then(() => {
        if (disposed || item.animation !== animation) return
        show(item); report()
      }).catch(() => {})
    }
    const sync = () => {
      showAll()
      if (!enabled()) return
      const bounds = items.map(item => item.element.getBoundingClientRect())
      items.forEach((item, index) => {
        const box = bounds[index]
        if (box.bottom <= 0 || box.top >= innerHeight) arm(item, box.top, box.bottom)
      })
      report()
    }
    const hashTarget = () => {
      let target: Element | null = null
      try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))) } catch { /* Invalid fragment. */ }
      if (target && (panel.contains(target) || target.contains(panel))) showAll()
    }
    const initial = items.map(item => item.element.getBoundingClientRect())
    const introItems: Item[] = []
    items.forEach((item, index) => {
      item.element.classList.add('c7-motion-item')
      const box = initial[index]
      if (enabled() && (box.bottom <= 0 || box.top >= innerHeight)) arm(item, box.top, box.bottom)
      else if (enabled() && intro && scrollY < 24 && !location.hash) { arm(item, box.top, box.bottom); introItems.push(item) }
      else show(item)
    })
    const observer = new IntersectionObserver(records => {
      const entering: Item[] = []
      for (const record of records) {
        const item = byElement.get(record.target as HTMLElement)!
        if (record.isIntersecting && record.intersectionRect.height > .5) {
          if (item.phase === 'armed') entering.push(item)
        } else {
          const box = item.phase === 'running' ? { top: item.top - scrollY, bottom: item.bottom - scrollY } : item.element.getBoundingClientRect()
          if (box.bottom <= .5 || box.top >= innerHeight - .5) arm(item, box.top, box.bottom)
        }
      }
      entering.sort((a, b) => a.element.getBoundingClientRect().left - b.element.getBoundingClientRect().left)
      entering.forEach(enter)
      report()
    }, { threshold: [0, .001] })
    items.forEach(item => observer.observe(item.element))
    introItems.forEach(enter)
    report(); hashTarget()
    const onVisibility = () => { if (document.hidden) showAll(); else sync() }
    panel.addEventListener('focusin', showAll)
    reduced.addEventListener('change', sync)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(C7_MOTION_EVENT, sync)
    window.addEventListener('hashchange', hashTarget)
    window.addEventListener('popstate', hashTarget)
    return () => {
      disposed = true; observer.disconnect(); showAll()
      items.forEach(item => item.element.classList.remove('c7-motion-item'))
      panel.removeEventListener('focusin', showAll)
      reduced.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(C7_MOTION_EVENT, sync)
      window.removeEventListener('hashchange', hashTarget)
      window.removeEventListener('popstate', hashTarget)
    }
  }, [intro])

  return <div ref={ref} className={`c7-wave-reveal ${className}`} {...props}>
    <div className="c7-wave-reveal__content">{children}</div>
  </div>
}
