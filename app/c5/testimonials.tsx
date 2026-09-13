'use client'

import { useRef } from 'react'
import { site } from '@/content/site'

export function C5Testimonials() {
  const ref = useRef<HTMLDivElement>(null)
  const behavior = (): ScrollBehavior => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

  return <div ref={ref} className="c5-quotes" tabIndex={0} role="group" aria-label={site.testimonials.title} onKeyDown={(event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const element = ref.current
    if (!element) return
    if (event.key === 'Home') element.scrollTo({ left: 0, behavior: behavior() })
    else if (event.key === 'End') element.scrollTo({ left: element.scrollWidth, behavior: behavior() })
    else element.scrollBy({ left: event.key === 'ArrowRight' ? element.clientWidth * 0.82 : element.clientWidth * -0.82, behavior: behavior() })
  }}>
    <div className="c5-quote-run">{site.testimonials.list.map((item, index) => <article key={item.name} className={`c5-quote c5-quote-${index + 1}`}>
        <blockquote>{item.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</blockquote>
        <p className="c5-quote-name"><strong>{item.name}</strong>{item.role ? <span>{item.role}</span> : null}</p>
      </article>)}</div>
  </div>
}
