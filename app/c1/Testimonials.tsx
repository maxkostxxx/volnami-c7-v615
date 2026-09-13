'use client'

import { useEffect, useRef, useState } from 'react'
import { site } from '@/content/site'

const CARD = 520
const GAP = 24

/**
 * Горизонтальная полоса отзывов: перетаскивание мышью, колесо и клавиатура.
 * Живёт внутри app/c1/ — общей библиотеки компонентов у концептов нет.
 */
export default function Testimonials() {
  const stripRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  /*
    Колесо: вертикальный тик переводится в горизонтальную прокрутку, пока
    полосе есть куда ехать. На краях событие возвращается странице.
  */
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      const max = el.scrollWidth - el.clientWidth
      if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft = el.scrollLeft + delta
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* CSS scroll-behavior не перебивает явный behavior в scrollBy — медиазапрос
     читается из JS, иначе reduce не соблюдается. */
  const behavior = (): ScrollBehavior =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'

  const step = (dir: 1 | -1) => {
    stripRef.current?.scrollBy({ left: dir * (CARD + GAP), behavior: behavior() })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      stripRef.current?.scrollTo({ left: 0, behavior: behavior() })
    } else if (e.key === 'End') {
      e.preventDefault()
      const el = stripRef.current
      el?.scrollTo({ left: el.scrollWidth, behavior: behavior() })
    }
  }

  const drag = useRef({ active: false, x: 0, left: 0 })

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = stripRef.current
    if (!el) return
    drag.current = { active: true, x: e.clientX, left: el.scrollLeft }
    setDragging(true)
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return
    const el = stripRef.current
    if (!el) return
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return
    drag.current.active = false
    setDragging(false)
    const el = stripRef.current
    el?.releasePointerCapture(e.pointerId)
    /* снап сам не срабатывает после программной прокрутки — доводим вручную */
    if (el) {
      const pitch = CARD + GAP
      el.scrollTo({ left: Math.round(el.scrollLeft / pitch) * pitch, behavior: behavior() })
    }
  }

  return (
    <div
      ref={stripRef}
      className={`c1-strip${dragging ? ' c1-strip--dragging' : ''}`}
      tabIndex={0}
      role="group"
      aria-label={site.testimonials.title}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* role="list" возвращает семантику, которую Safari снимает
          вместе с маркерами: иначе «4 отзыва» не объявляются */}
      <ul className="c1-strip-track" role="list">
        {site.testimonials.list.map((t) => (
          <li key={t.name} className="c1-quote">
            <div className="c1-quote-text">
              {t.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
            <p>
              <span className="c1-quote-name">{t.name}</span>
              {t.role ? <span className="c1-quote-role">{t.role}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
