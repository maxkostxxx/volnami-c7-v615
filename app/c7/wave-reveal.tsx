'use client'

import { useEffect, useRef, type HTMLAttributes } from 'react'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

type Item = { element: HTMLElement; direction: 'up' | 'down'; state: 'armed' | 'running' | 'shown' }

/**
 * A deliberately small, reversible reveal system. The former variant built a
 * unique clip-path for every element and animated those paths with WAAPI. That
 * made a fast scroll coalesce into a visible jump and pushed clip compositing
 * on top of the live WebGL landscape. This path only animates opacity and a
 * compositor transform; the drawn SVG wave is the shared visual cue.
 */
export function C7WaveReveal({ children, className = '', intro = false, ...props }: HTMLAttributes<HTMLDivElement> & { intro?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = ref.current
    const content = panel?.querySelector<HTMLElement>('.c7-wave-reveal__content')
    if (!panel || !content || !('IntersectionObserver' in window)) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const selector = [
      'h1 > span', 'h1', 'h2', '.c7-about-copy > p', '.c7-process li',
      '.c7-service-list > article', '.c7-section-heading', '.c7-case',
      '.c7-quotes-wrap', '.c7-contact-copy', 'address', '.c7-brief-intro',
      'form', '.c7-project-story-text', '.c7-project-gallery figure',
      '.c7-project-lead', '.c7-project-eyebrow', '.c7-project-scroll',
    ].join(', ')
    const candidates = Array.from(content.querySelectorAll<HTMLElement>(selector))
    const elements = candidates.filter(element => !candidates.some(parent => parent !== element && parent.contains(element)))
    if (!elements.length) elements.push(...Array.from(content.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.tagName !== 'NOSCRIPT'))

    const items = elements.map((element): Item => ({ element, direction: 'up', state: 'shown' }))
    const byElement = new Map(items.map(item => [item.element, item]))
    let disposed = false
    let entries = 0
    const enabled = () => !reduced.matches && !readMotionPaused() && !document.hidden
    const report = () => {
      panel.dataset.waveState = items.some(item => item.state === 'running') ? 'running' : items.every(item => item.state === 'armed') ? 'armed' : 'shown'
    }
    const show = (item: Item) => {
      item.state = 'shown'
      item.element.classList.remove('is-motion-pending', 'is-motion-running', 'is-motion-from-top')
      item.element.dataset.motionState = 'shown'
    }
    const showAll = () => { items.forEach(show); report() }
    const arm = (item: Item, direction: Item['direction']) => {
      if (!enabled()) { show(item); return }
      item.state = 'armed'
      item.direction = direction
      item.element.classList.remove('is-motion-running')
      item.element.classList.toggle('is-motion-from-top', direction === 'down')
      item.element.classList.add('is-motion-pending')
      item.element.dataset.motionState = 'armed'
    }
    const enter = (item: Item, index: number) => {
      if (disposed || item.state !== 'armed') return
      if (!enabled()) { show(item); return }
      item.state = 'running'
      item.element.style.setProperty('--c7-wave-delay', `${Math.min(index * 74, 296)}ms`)
      item.element.classList.remove('is-motion-pending')
      item.element.classList.add('is-motion-running')
      item.element.dataset.motionState = 'running'
      item.element.dataset.motionEntries = String(Number(item.element.dataset.motionEntries || 0) + 1)
      panel.dataset.waveDirection = item.direction
      panel.dataset.waveEntries = String(++entries)
    }
    const onAnimationEnd = (event: AnimationEvent) => {
      const item = byElement.get(event.target as HTMLElement)
      if (!item || !event.animationName.startsWith('c7-wave-item')) return
      show(item); report()
    }
    const sync = () => {
      showAll()
      if (!enabled()) return
      for (const item of items) {
        const box = item.element.getBoundingClientRect()
        if (box.bottom < -40) arm(item, 'down')
        else if (box.top > innerHeight + 40) arm(item, 'up')
      }
      report()
    }

    for (const item of items) item.element.classList.add('c7-motion-item')
    if (enabled()) {
      items.forEach(item => {
        const box = item.element.getBoundingClientRect()
        if (box.bottom < -40) arm(item, 'down')
        else if (box.top > innerHeight + 40 || (intro && scrollY < 24 && !location.hash)) arm(item, 'up')
      })
    }
    const observer = new IntersectionObserver(records => {
      const entering: Item[] = []
      for (const record of records) {
        const item = byElement.get(record.target as HTMLElement)
        if (!item) continue
        if (record.isIntersecting && record.intersectionRect.height > 1) {
          if (item.state === 'armed') entering.push(item)
          continue
        }
        const box = item.element.getBoundingClientRect()
        // Do not reset an item while it grazes the viewport: that was the old
        // snap-back on a quick wheel/touch scroll.
        if (box.bottom < -40) arm(item, 'down')
        else if (box.top > innerHeight + 40) arm(item, 'up')
      }
      entering.sort((a, b) => {
        const first = a.element.getBoundingClientRect()
        const second = b.element.getBoundingClientRect()
        return first.top - second.top || first.left - second.left
      })
      entering.forEach(enter)
      report()
    }, { rootMargin: '-7% 0px -10% 0px', threshold: [0, .01] })

    items.forEach(item => observer.observe(item.element))
    items.filter(item => item.state === 'armed' && item.element.getBoundingClientRect().bottom > 0 && item.element.getBoundingClientRect().top < innerHeight).forEach(enter)
    panel.addEventListener('animationend', onAnimationEnd)
    panel.addEventListener('focusin', showAll)
    reduced.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener(C7_MOTION_EVENT, sync)
    return () => {
      disposed = true
      observer.disconnect()
      panel.removeEventListener('animationend', onAnimationEnd)
      panel.removeEventListener('focusin', showAll)
      reduced.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener(C7_MOTION_EVENT, sync)
      showAll()
      items.forEach(item => {
        item.element.classList.remove('c7-motion-item')
        item.element.style.removeProperty('--c7-wave-delay')
      })
    }
  }, [intro])

  return <div ref={ref} className={`c7-wave-reveal ${className}`} {...props}>
    <div className="c7-wave-reveal__content">{children}</div>
    <svg className="c7-wave-reveal__front" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M-80 94C96 14 206 153 376 83S686 27 842 90s282 77 678-55" />
      <path d="M-80 112C92 39 226 169 394 106s302-49 454 13 278 68 672-38" />
    </svg>
  </div>
}
