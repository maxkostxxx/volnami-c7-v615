'use client'

import { useRef } from 'react'
import { site } from '@/content/site'

export function C4Testimonials() {
  const ref = useRef<HTMLDivElement>(null)
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  return <div ref={ref} className="c4-quotes" tabIndex={0} role="group" aria-label={site.testimonials.title} onKeyDown={(event) => {
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
