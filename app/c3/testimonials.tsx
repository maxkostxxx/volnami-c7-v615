'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { site } from '@/content/site'
import { QuotesArc } from './arcs'

const BLOCK = 600 + 42 // ширина блока + гэп

/** Плавная докрутка — только если пользователь не просил убрать движение. */
const behavior = (): ScrollBehavior =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

/**
 * Горизонтальная листающаяся полоса отзывов.
 * Блоки без рамок, фона и скруглений — отделяются волосяной линией слева.
 *
 * Единственное движение на всей странице: фирменная дуга под полосой
 * смещается пропорционально scrollLeft. Само по себе не движется ничего;
 * при prefers-reduced-motion дуга стоит, полоса листается как обычно.
 */
export function Testimonials() {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [shift, setShift] = useState(0)

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const strip = stripRef.current
    if (!strip) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      strip.scrollBy({ left: BLOCK, behavior: behavior() })
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      strip.scrollBy({ left: -BLOCK, behavior: behavior() })
    } else if (event.key === 'Home') {
      event.preventDefault()
      strip.scrollTo({ left: 0, behavior: behavior() })
    } else if (event.key === 'End') {
      event.preventDefault()
      strip.scrollTo({ left: strip.scrollWidth, behavior: behavior() })
    }
  }, [])

  /*
    Колесо мыши. Одного `overflow-y: hidden` мало: проверено — Chromium
    не переводит вертикальный deltaY в горизонтальную прокрутку, страница
    уезжает, а полоса стоит. Поэтому колесо листает полосу по блоку, как
    ←/→ с клавиатуры. На краях полосы событие возвращается странице,
    чтобы прокрутка не запиралась.
  */
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    let lock = 0
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const max = strip.scrollWidth - strip.clientWidth
      if (max <= 0) return
      const dir = event.deltaY > 0 ? 1 : -1
      if (dir < 0 ? strip.scrollLeft <= 1 : strip.scrollLeft >= max - 1) return

      event.preventDefault()
      const now = event.timeStamp
      if (now < lock) return
      lock = now + 320
      strip.scrollBy({ left: dir * BLOCK, behavior: behavior() })
    }

    strip.addEventListener('wheel', onWheel, { passive: false })
    return () => strip.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const update = () => {
      frame = 0
      const span = strip.scrollWidth - strip.clientWidth
      setShift(span > 0 ? Math.min(1, Math.max(0, strip.scrollLeft / span)) : 0)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    strip.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      strip.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    /* Вторая колонка секции: полоса и её дуга стоят правее корешка
       с заголовком и уходят за правый край экрана. */
    <div className="c3-quotes-body">
      <div
        className="c3-quotes"
        ref={stripRef}
        role="group"
        aria-label={site.testimonials.title}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {site.testimonials.list.map((item) => (
          <figure className="c3-quote" key={item.name}>
            <blockquote className="c3-quote-text">
              {item.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </blockquote>
            <figcaption className="c3-quote-cite">
              <cite className="c3-quote-name">{item.name}</cite>
              {item.role ? <span className="c3-quote-role">{item.role}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>

      <div
        className="c3-quotes-rail"
        style={{ ['--c3-shift' as string]: String(shift) }}
      >
        <QuotesArc />
      </div>
    </div>
  )
}
