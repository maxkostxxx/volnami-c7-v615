'use client'

import Image from 'next/image'
import { Fragment, useEffect, useRef } from 'react'
import { site } from '@/content/site'

const stageVisual = site.cases.list[1].visuals.find((visual) => visual.src.endsWith('/tr-11.webp')) ?? site.cases.list[1].visuals[0]

function breakableLine(line: string) {
  const parts = line.split('\u00a0')
  return parts.map((part, index) => <Fragment key={`${part}-${index}`}>
    {part}{index < parts.length - 1 ? <>{'\u00a0'}<wbr /></> : null}
  </Fragment>)
}

export function C6Spotlight() {
  const ref = useRef<HTMLElement>(null)
  const bounds = useRef<DOMRect | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const frame = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => { bounds.current = element.getBoundingClientRect() }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  const measure = () => {
    const element = ref.current
    if (element) bounds.current = element.getBoundingClientRect()
  }

  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const element = ref.current
    if (!element) return
    const rect = bounds.current
    if (!rect) return
    pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      element.style.setProperty('--c6-spot-x', `${pointer.current.x}px`)
      element.style.setProperty('--c6-spot-y', `${pointer.current.y}px`)
    })
    element.dataset.spotlight = 'active'
  }

  return <section
    ref={ref}
    className="c6-stage"
    id="hero"
    aria-labelledby="c6-hero-title"
    tabIndex={-1}
    onPointerEnter={measure}
    onPointerMove={move}
    onPointerLeave={() => { if (ref.current) delete ref.current.dataset.spotlight }}
  >
    <Image className="c6-stage-image c6-stage-image-mono" src={stageVisual.src} alt={stageVisual.alt} width={stageVisual.width} height={stageVisual.height} priority sizes="100vw" />
    <Image className="c6-stage-image c6-stage-image-color" src={stageVisual.src} alt="" width={stageVisual.width} height={stageVisual.height} priority sizes="100vw" />
    <div className="c6-stage-copy">
      <h1 id="c6-hero-title">{site.hero.sloganLines.map((line) => <span key={line}>{breakableLine(line)}</span>)}</h1>
      <p>{site.hero.subtitle}</p>
    </div>
  </section>
}
