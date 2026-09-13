'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'
import { Display } from './type'

/** Бумажный самолётик Telegram — рисуется вектором, а не иконочным шрифтом. */
function TelegramMark() {
  return (
    <svg
      className="c2-tg-mark"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.6 11.3 21 4.1c.7-.3 1.4.3 1.2 1L19 20.4c-.2.8-1.1 1.1-1.7.6l-4.6-3.7-2.4 2.4c-.5.5-1.3.2-1.4-.5l-.7-4.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="m8.2 14.6 9.9-7.4-11 6.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Верхняя плашка концепта 2.
 *
 * `base` пустой на самой /c2 (якоря ведут по текущей странице) и равен
 * '/c2' на странице кейса, чтобы те же пункты вели на главную концепта.
 */
export function TopBar({
  base = '',
  mark = false,
}: {
  base?: string
  mark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => setOpen(false), [])

  /* После перехода по меню фокус следует за экраном к целевой секции. */
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
    if (base) { close(); return }
    event.preventDefault()
    close()
    window.history.pushState(null, '', href)
    focusFragment()
  }, [base, close, focusFragment])

  useEffect(() => {
    focusFragment()
    window.addEventListener('hashchange', focusFragment)
    return () => window.removeEventListener('hashchange', focusFragment)
  }, [focusFragment])

  /* Фокус: внутрь панели при раскрытии, обратно на гамбургер при закрытии. */
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      closeRef.current?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      burgerRef.current?.focus()
    }
  }, [open])

  /* Остальной документ становится inert: панель — модальный диалог. */
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const touched: Element[] = []
    for (const el of Array.from(document.body.children)) {
      if (panel && (el === panel || el.contains(panel))) continue
      if (!el.hasAttribute('inert')) {
        el.setAttribute('inert', '')
        touched.push(el)
      }
    }
    const prevOverflow = document.body.style.overflow
    const gap = window.innerWidth - document.documentElement.clientWidth
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`
    return () => {
      for (const el of touched) el.removeAttribute('inert')
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
    }
  }, [open])

  /* Escape закрывает, Tab не выпускает фокус за пределы панели. */
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement
    if (e.shiftKey && (current === first || !panel.contains(current))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <header className="c2-topbar">
        {mark ? (
          <Link className="c2-topbar-mark" href="/c2">
            <Image
              src="/logo/volnami-wordmark-green.svg"
              alt={site.brand.name}
              width={158}
              height={51}
            />
          </Link>
        ) : null}

        <div className="c2-topbar-center">
          <Link className="c2-pill" href={`${base}${site.header.cta.href}`}>
            {site.header.cta.label}
          </Link>
          <a
            className="c2-tg"
            href={site.header.telegram.href}
          >
            <TelegramMark />
            <span className="c2-sr">
              {site.header.telegram.label} {site.header.telegram.handle}
            </span>
          </a>
        </div>

        <button
          ref={burgerRef}
          type="button"
          className="c2-burger"
          aria-label={site.header.menuLabel}
          aria-expanded={open}
          aria-controls="c2-menu-panel"
          onClick={() => setOpen(true)}
        >
          {/* Три полоски — прямое требование ТЗ. Нижняя короче: гамбургер
              выровнен по правому краю и повторяет ступень лок-апа. */}
          <span className="c2-burger-bar" />
          <span className="c2-burger-bar" />
          <span className="c2-burger-bar" />
        </button>
      </header>

      <div className="c2-menu-layer" hidden={!open}>
        <button
          type="button"
          className="c2-scrim"
          aria-label={site.header.menuCloseLabel}
          tabIndex={-1}
          onClick={close}
        />
        <div
          id="c2-menu-panel"
          ref={panelRef}
          className="c2-menu"
          role="dialog"
          aria-modal="true"
          aria-label={site.header.menuLabel}
          onKeyDown={onPanelKeyDown}
        >
          {/* aria-expanded здесь не ставится: кнопка сворачивает панель,
              а скринридер объявлял бы её как «Меню, развёрнуто». Имя берётся
              из своей строки `menuCloseLabel` — иначе кнопка открытия
              и кнопка закрытия объявляются одинаково.
              Крест — две полоски, а не три: третья в нём лишний штрих. */}
          <button
            ref={closeRef}
            type="button"
            className="c2-burger c2-burger--close"
            aria-label={site.header.menuCloseLabel}
            onClick={close}
          >
            <span className="c2-burger-bar" />
            <span className="c2-burger-bar" />
          </button>

          <nav className="c2-menu-nav">
            <ul className="c2-menu-list">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    className="c2-menu-link"
                    href={`${base}${item.href}`}
                    onClick={(event) => goToFragment(event, item.href)}
                  >
                    <Display text={item.label} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  )
}
