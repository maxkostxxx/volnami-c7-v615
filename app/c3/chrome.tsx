'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '@/content/site'
import { BurgerMark, TelegramMark } from './arcs'

const MENU_ID = 'c3-menu-list'

/**
 * Верхняя плашка: кнопка и Telegram по центру, гамбургер справа.
 * Гамбургер остаётся и на десктопе.
 *
 * Раскрытие встроенное: шапка растёт вниз и расталкивает страницу.
 * Оверлея нет, фон не блокируется — значит это disclosure, а не диалог:
 * aria-expanded + aria-controls, без role="dialog" и без inert.
 *
 * И, раз это disclosure, фокус внутри шапки НЕ запирается: контент страницы
 * виден, кликается и обязан оставаться достижимым с клавиатуры. Запертый
 * Tab оставлял пользователя, не знающего про Escape, в ловушке из восьми
 * элементов. Escape закрывает меню и возвращает фокус на гамбургер.
 */
export function Chrome({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    burgerRef.current?.focus()
  }, [])

  /* Ссылка из меню переносит программный фокус в названную секцию. */
  const focusFragment = useCallback(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(id)
        if (!target) return
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        })
        target.focus({ preventScroll: true })
      })
    })
  }, [])

  const goToFragment = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (base) { setOpen(false); return }
    event.preventDefault()
    setOpen(false)
    window.history.pushState(null, '', href)
    focusFragment()
  }, [base, focusFragment])

  useEffect(() => {
    focusFragment()
    window.addEventListener('hashchange', focusFragment)
    return () => window.removeEventListener('hashchange', focusFragment)
  }, [focusFragment])

  useEffect(() => {
    if (!open) return
    firstLinkRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  return (
    <header className="c3-topbar">
      <div className="c3-topbar-row">
        <a className="c3-btn" href={`${base}${site.header.cta.href}`}>
          {site.header.cta.label}
        </a>

        <a
          className="c3-tg"
          href={site.header.telegram.href}
        >
          <TelegramMark />
          <span className="c3-sr">{site.header.telegram.label}</span>
        </a>

        <button
          type="button"
          className="c3-burger"
          ref={burgerRef}
          aria-expanded={open}
          aria-controls={MENU_ID}
          aria-label={site.header.menuLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <BurgerMark open={open} />
        </button>
      </div>

      <nav className="c3-menu" id={MENU_ID} hidden={!open} aria-label={site.header.menuLabel}>
        <ul className="c3-menu-list">
          {site.nav.map((item, i) => (
            <li key={item.href}>
              <a
                className="c3-menu-link"
                href={`${base}${item.href}`}
                ref={i === 0 ? firstLinkRef : undefined}
                onClick={(event) => goToFragment(event, item.href)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
