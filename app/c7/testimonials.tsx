'use client'

import { useEffect, useRef, useState } from 'react'
import { c7Site as site } from './content'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

export function C7Testimonials() {
  const railRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const count = site.testimonials.list.length
  const updateIndex = () => {
    const rail = railRef.current
    if (!rail) return
    const maximum = rail.scrollWidth - rail.clientWidth
    const closest = maximum > 0 ? Math.max(0, Math.min(count - 1, Math.round(rail.scrollLeft / maximum * (count - 1)))) : 0
    indexRef.current = closest
    setIndex(current => current === closest ? current : closest)
  }
  const goTo = (next: number, smooth = true) => {
    const rail = railRef.current
    if (!rail) return
    const left = (rail.scrollWidth - rail.clientWidth) * ((next + count) % count) / Math.max(1, count - 1)
    rail.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches && !readMotionPaused() ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setAllowed(!media.matches && !readMotionPaused() && !document.hidden)
    sync()
    media.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener(C7_MOTION_EVENT, sync)
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(records => setVisible(records.some(record => record.isIntersecting && record.intersectionRatio >= .2)), { threshold: .2 }) : null
    observer?.observe(rail)
    const resize = new ResizeObserver(() => { goTo(indexRef.current, false); updateIndex() })
    resize.observe(rail)
    return () => {
      observer?.disconnect(); resize.disconnect()
      media.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener(C7_MOTION_EVENT, sync)
    }
  }, [])
  useEffect(() => {
    if (paused || hovered || !allowed || !visible || count < 2) return
    const timer = setTimeout(() => {
      const selection = getSelection()
      if (selection?.toString() && selection.anchorNode && railRef.current?.contains(selection.anchorNode)) { setPaused(true); return }
      goTo(index + 1)
    }, 7000)
    return () => clearTimeout(timer)
  }, [index, paused, hovered, allowed, visible, count])
  const move = (direction: number) => { setPaused(true); goTo(index + direction) }

  return <div className="c7-quotes-wrap" onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={() => setHovered(false)}>
    <div className="c7-quotes-controls" role="group" aria-label="Управление отзывами">
      <span className="c7-quotes-position" aria-live="off">{index + 1} / {count}</span>
      <button type="button" onClick={() => move(-1)} onFocus={() => setPaused(true)} aria-label="Предыдущий отзыв">←</button>
      <button type="button" onClick={() => move(1)} onFocus={() => setPaused(true)} aria-label="Следующий отзыв">→</button>
      <button type="button" className="c7-quotes-play" onClick={() => setPaused(current => !current)} aria-label={paused || !allowed ? 'Включить смену отзывов' : 'Остановить смену отзывов'} aria-pressed={!paused && allowed} disabled={!allowed}>
        <span aria-hidden="true">{paused || !allowed ? '▶' : 'Ⅱ'}</span>
      </button>
    </div>
    <div ref={railRef} className="c7-quotes" role="region" aria-roledescription="карусель" aria-label={site.testimonials.title} tabIndex={0}
      onPointerDown={() => setPaused(true)} onFocus={() => setPaused(true)} onScroll={updateIndex} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); setPaused(true)
        if (event.key === 'Home') goTo(0, false)
        else if (event.key === 'End') goTo(count - 1, false)
        else goTo(index + (event.key === 'ArrowRight' ? 1 : -1), false)
      }}>
      <ul role="list">{site.testimonials.list.map((item, itemIndex) => <li key={item.name} aria-current={itemIndex === index ? 'true' : undefined}>
        <blockquote>{item.paragraphs.map(paragraph => <p key={paragraph.slice(0, 36)}>{paragraph}</p>)}</blockquote>
        <p className="c7-quote-author"><strong>{item.name}</strong>{item.role ? <span>{item.role}</span> : null}</p>
      </li>)}</ul>
    </div>
  </div>
}
