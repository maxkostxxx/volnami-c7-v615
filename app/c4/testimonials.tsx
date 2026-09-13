'use client'

import { useEffect, useRef } from 'react'
import { site } from '@/content/site'

export function C4Testimonials() {
  const ref = useRef<HTMLDivElement>(null)
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  useEffect(() => {
    const el = ref.current; if (!el) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const max = el.scrollWidth - el.clientWidth
      if (!delta || (delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return
      event.preventDefault(); el.scrollLeft += delta
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  return <div ref={ref} className="c4-quotes" tabIndex={0} role="region" aria-label={site.testimonials.title} onKeyDown={(event) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
    event.preventDefault(); const el = ref.current; if (!el) return
    if (event.key === 'Home') el.scrollTo({ left: 0, behavior: motion() })
    else if (event.key === 'End') el.scrollTo({ left: el.scrollWidth, behavior: motion() })
    else el.scrollBy({ left: event.key === 'ArrowRight' ? 560 : -560, behavior: motion() })
  }}><ul role="list">{site.testimonials.list.map((item) => <li key={item.name}>
    <blockquote>{item.paragraphs.map((p) => <p key={p.slice(0, 30)}>{p}</p>)}</blockquote>
    <p className="c4-quote-author"><strong>{item.name}</strong>{item.role ? <span>{item.role}</span> : null}</p>
  </li>)}</ul></div>
}
