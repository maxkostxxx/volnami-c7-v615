'use client'

import { useEffect, useRef, type HTMLAttributes } from 'react'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

/** First entrance only; finished text returns to ordinary, unlayered DOM. */
export function C7WaveReveal({ children, className = '', intro = false, ...props }: HTMLAttributes<HTMLDivElement> & { intro?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = ref.current
    const content = panel?.querySelector<HTMLElement>('.c7-wave-reveal__content')
    if (!panel || !content || !('IntersectionObserver' in window)) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const active = new Set<() => void>()
    const visited = new WeakSet<Element>()
    const candidates = Array.from(content.querySelectorAll<HTMLElement>(
      'h1, h2, .c7-about-copy > p, .c7-process li, .c7-service-list > article, .c7-section-heading, .c7-case, .c7-quotes-wrap, .c7-contact-copy, address, .c7-brief-intro, form, .c7-project-story-text, .c7-project-gallery figure, .c7-project-lead',
    ))
    const items = candidates.filter(e => !candidates.some(parent => parent !== e && parent.contains(e)))
    const enabled = () => !reduced.matches && !readMotionPaused() && !document.hidden
    const finishAll = () => { for (const finish of [...active]) finish() }
    const enter = (element: HTMLElement) => {
      if (visited.has(element)) return
      visited.add(element)
      observer.unobserve(element)
      element.dataset.motionEntries = '1'
      element.dataset.motionState = 'shown'
      if (!enabled()) return
      const animations: Animation[] = []
      const restores: (() => void)[] = []
      // Split short reading units only as they enter. Body copy and controls
      // keep normal wrapping; temporary spans are removed after the entrance.
      const texts = element.matches('h1,h2,p') ? [element] : Array.from(element.querySelectorAll<HTMLElement>('h2,h3,.c7-about-lead'))
      const stagger = Math.min(16, 600 / Math.max(1, texts.reduce((sum, text) => sum + (text.textContent?.length || 0), 0)))
      let count = 0
      for (const text of texts) {
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
        const nodes: Text[] = []
        while (walker.nextNode()) nodes.push(walker.currentNode as Text)
        for (const node of nodes) {
          const value = node.textContent || ''
          if (!value.trim() || count + value.length > 220) continue
          const wrapper = document.createElement('span')
          wrapper.className = 'c7-letter-run'
          wrapper.setAttribute('aria-hidden', 'true')
          const accessible = document.createElement('span')
          accessible.className = 'c7-letter-source'
          accessible.textContent = value
          const group = document.createElement('span')
          group.append(accessible, wrapper)
          for (const token of value.split(/(\s+)/u)) {
            if (/^\s+$/u.test(token)) { wrapper.append(document.createTextNode(token)); continue }
            const word = document.createElement('span')
            word.className = 'c7-letter-word'
            for (const letter of Array.from(token)) {
              const span = document.createElement('span')
              span.className = 'c7-letter'
              span.textContent = letter
              word.append(span)
              const delay = count++ * stagger
              animations.push(span.animate([
                { opacity: 0, transform: 'translateY(-.85em) rotate(-5deg)' },
                { opacity: 1, transform: 'translateY(.06em) rotate(0)', offset: .78 },
                { opacity: 1, transform: 'translateY(0)' },
              ], { duration: 620, delay, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' }))
            }
            wrapper.append(word)
          }
          node.replaceWith(group)
          restores.push(() => group.replaceWith(node))
        }
      }
      if (!animations.length) animations.push(element.animate([
        { opacity: .35, transform: 'translateY(-18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 620, easing: 'cubic-bezier(.2,.7,.25,1)' }))
      element.dataset.motionState = 'running'
      let done = false
      const finish = () => {
        if (done) return
        done = true
        animations.forEach(animation => animation.cancel())
        restores.forEach(restore => restore())
        element.dataset.motionState = 'shown'
        active.delete(finish)
      }
      active.add(finish)
      Promise.allSettled(animations.map(animation => animation.finished)).then(finish)
    }
    const observer = new IntersectionObserver(records => {
      for (const record of records) if (record.isIntersecting) enter(record.target as HTMLElement)
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0 })
    for (const item of items) {
      if (item.getBoundingClientRect().bottom < 0) visited.add(item)
      else observer.observe(item)
    }
    panel.addEventListener('focusin', finishAll)
    reduced.addEventListener('change', finishAll)
    document.addEventListener('visibilitychange', finishAll)
    window.addEventListener(C7_MOTION_EVENT, finishAll)
    return () => {
      observer.disconnect()
      finishAll()
      panel.removeEventListener('focusin', finishAll)
      reduced.removeEventListener('change', finishAll)
      document.removeEventListener('visibilitychange', finishAll)
      window.removeEventListener(C7_MOTION_EVENT, finishAll)
    }
  }, [intro])
  return <div ref={ref} className={`c7-wave-reveal ${className}`} {...props}>
    <div className="c7-wave-reveal__content">{children}</div>
  </div>
}
