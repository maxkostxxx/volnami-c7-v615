'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { site } from '@/content/site'

/**
 * Горизонтальная полоса отзывов.
 *
 * Листается тремя способами, и все три проверены на живой странице:
 *  - мышью: полосу можно тащить за карточку и тянуть за видимый скроллбар;
 *  - трекпадом: явный горизонтальный жест листает полосу нативно, а обычное
 *    вертикальное колесо всегда продолжает прокручивать страницу;
 *  - с клавиатуры: ←/→ на карточку, Home/End на края.
 *
 * Пока полоса едет, CSS-снэп выключен. Иначе `scroll-snap-type: x mandatory`
 * отменял каждый шаг: полоса возвращалась в ноль, а страница при этом уже
 * отдала прокрутку — не двигалось вообще ничего.
 */
export function TestimonialStrip() {
  const ref = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const [rail, setRail] = useState({ w: 100, x: 0 })

  /** Шаг листания — карточка плюс гэп. */
  const step = useCallback(() => {
    const el = ref.current
    if (!el) return 0
    const card = el.querySelector<HTMLElement>('.c2-quote')
    return card ? card.offsetWidth + 32 : Math.round(el.clientWidth * 0.8)
  }, [])

  /** Плавность — только если пользователь её не запретил. */
  const ease = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'

  /* Перетаскивание мышью. Тач не трогаем — там прокрутка нативная. */
  const drag = useRef<{
    id: number
    x: number
    left: number
    on: boolean
  } | null>(null)

  const stopDrag = () => {
    const el = ref.current
    const d = drag.current
    if (!el || !d) return
    drag.current = null
    el.classList.remove('c2-strip--drag', 'c2-strip--free')
    if (d.on && el.hasPointerCapture(d.id)) el.releasePointerCapture(d.id)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = ref.current
    if (!el) return
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      left: el.scrollLeft,
      on: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    const d = drag.current
    if (!el || !d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x
    if (!d.on) {
      if (Math.abs(dx) < 4) return
      d.on = true
      el.setPointerCapture(d.id)
      el.classList.add('c2-strip--drag', 'c2-strip--free')
      window.getSelection()?.removeAllRanges()
    }
    el.scrollLeft = d.left - dx
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      el.scrollBy({ left: step(), behavior: ease() })
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      el.scrollBy({ left: -step(), behavior: ease() })
    } else if (e.key === 'Home') {
      e.preventDefault()
      el.scrollTo({ left: 0, behavior: ease() })
    } else if (e.key === 'End') {
      e.preventDefault()
      el.scrollTo({ left: el.scrollWidth, behavior: ease() })
    }
  }

  /* Какая карточка сейчас в полосе — на ней и показывается фокус.
     Заодно пересчитывается линия прокрутки под полосой. */
  const onScroll = useCallback(() => {
    const el = ref.current
    const s = step()
    if (!el) return
    if (s) {
      const i = Math.max(
        0,
        Math.min(
          site.testimonials.list.length - 1,
          Math.round(el.scrollLeft / s)
        )
      )
      setCurrent((prev) => (prev === i ? prev : i))
    }
    const total = el.scrollWidth
    const seen = el.clientWidth
    const w = Math.min(100, (seen / total) * 100)
    const x = total > seen ? (el.scrollLeft / (total - seen)) * (100 - w) : 0
    setRail((prev) =>
      Math.abs(prev.w - w) < 0.1 && Math.abs(prev.x - x) < 0.1
        ? prev
        : { w, x }
    )
  }, [step])

  useEffect(() => {
    onScroll()
  }, [onScroll])

  return (
    <>
      <div
        ref={ref}
        className="c2-strip"
        tabIndex={0}
        role="group"
        aria-labelledby="c2-testimonials-title"
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
      >
        {site.testimonials.list.map((t, i) => (
          <figure
            key={t.name}
            className={`c2-quote${i === current ? ' c2-quote--current' : ''}`}
          >
            <blockquote className="c2-quote-text">
              {t.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </blockquote>
            <figcaption className="c2-quote-by">
              <span className="c2-quote-name">{t.name}</span>
              {t.role ? <span className="c2-quote-role">{t.role}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Линия прокрутки. Ничего не объявляет: сама полоса уже объявлена
          как список, а это её визуальный след. */}
      <div className="c2-strip-rail" aria-hidden="true">
        <span
          className="c2-strip-thumb"
          style={{ width: `${rail.w}%`, left: `${rail.x}%` }}
        />
      </div>
    </>
  )
}
