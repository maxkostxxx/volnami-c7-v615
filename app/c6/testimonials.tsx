'use client'

import { useRef } from 'react'
import { site } from '@/content/site'

export function C6Testimonials() {
  const ref = useRef<HTMLDivElement>(null)
  const behavior = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

  return <div
    ref={ref}
    className="c6-quotes"
    tabIndex={0}
    role="group"
    aria-label={site.testimonials.title}
    onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const element = ref.current
      if (!element) return
      if (event.key === 'Home') element.scrollTo({ left: 0, behavior: behavior() })
      else if (event.key === 'End') element.scrollTo({ left: element.scrollWidth, behavior: behavior() })
      else element.scrollBy({ left: event.key === 'ArrowRight' ? element.clientWidth : -element.clientWidth, behavior: behavior() })
    }}
  >
    <ul role="list">{site.testimonials.list.map((item) => <li key={item.name} style={{ backgroundColor: 'var(--c6-ink)' }}>
      <blockquote>{item.paragraphs.map((paragraph) => <p key={paragraph.slice(0, 30)}>{paragraph}</p>)}</blockquote>
      <p><strong>{item.name}</strong>{item.role ? <span>{item.role}</span> : null}</p>
    </li>)}</ul>
  </div>
}
