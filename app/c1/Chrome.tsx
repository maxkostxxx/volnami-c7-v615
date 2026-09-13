'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '@/content/site'

/**
 * Верхняя плашка концепта 1 и полноэкранное меню.
 * Живёт внутри app/c1/ — общей библиотеки компонентов у концептов нет.
 *
 * `base` — префикс для якорных ссылок: '' на главной концепта,
 * '/c1' на странице кейса, чтобы «Услуги» вели туда же.
 */
export default function Chrome({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false)
  const [lifted, setLifted] = useState(false)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)

  /* фон плашки появляется, когда ушли ниже первого экрана */
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > window.innerHeight * 0.9)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  /* Якорная навигация переносит не только экран, но и программный фокус. */
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

  /* открытое меню: фон inert, скролл заперт, фокус внутри, Escape закрывает */
  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const touched: Element[] = []
    for (const el of Array.from(menu?.parentElement?.children ?? [])) {
      if (el === menu || el.hasAttribute('inert')) continue
      el.setAttribute('inert', '')
      touched.push(el)
    }
    const prevOverflow = document.body.style.overflow
    const gap = window.innerWidth - document.documentElement.clientWidth
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`

    const focusables = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []
      ).filter((el) => {
        const style = window.getComputedStyle(el)
        return (
          el.tabIndex >= 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          el.getClientRects().length > 0
        )
      })

    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !menuRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
      for (const el of touched) el.removeAttribute('inert')
      burgerRef.current?.focus()
    }
  }, [open, close])

  return (
    <>
      <header
        ref={barRef}
        className={`c1-topbar${lifted ? ' c1-topbar--lifted' : ''}`}
      >
        {/* На странице кейса плашка — единственный путь назад, поэтому знак
            становится ссылкой на главную. На самой главной знак стоит
            в первом экране и второй раз не нужен. */}
        {base ? (
          <div className="c1-topbar-left">
            <Link className="c1-topbar-home" href={base}>
              <Image
                src="/logo/volnami-wordmark-pink.svg"
                alt={site.brand.name}
                width={841}
                height={271}
              />
            </Link>
          </div>
        ) : null}

        <div className="c1-topbar-center">
          <Link className="c1-btn" href={`${base}${site.header.cta.href}`}>
            {site.header.cta.label}
          </Link>
          <a
            className="c1-icon-btn"
            href={site.header.telegram.href}
          >
            <TelegramGlyph />
            <span className="c1-vh">{site.header.telegram.label}</span>
          </a>
        </div>

        <div className="c1-topbar-right">
          <button
            ref={burgerRef}
            type="button"
            className="c1-icon-btn"
            aria-expanded={open}
            aria-controls="c1-menu"
            onClick={() => setOpen(true)}
          >
            {/* три полоски — прямое требование ТЗ */}
            <span className="c1-burger-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="c1-vh">{site.header.menuLabel}</span>
          </button>
        </div>
      </header>

      {open && (
        <div
          id="c1-menu"
          ref={menuRef}
          className="c1-menu"
          role="dialog"
          aria-modal="true"
          aria-label={site.header.menuLabel}
        >
          <Image
            className="c1-menu-mark"
            src="/logo/volnami-wordmark-pink.svg"
            alt={site.brand.name}
            width={841}
            height={271}
          />

          {/* aria-expanded снят: крестик сворачивает, а не раскрывает,
              и объявлять его «развёрнуто» — врать скринридеру.
              Имя — menuCloseLabel: две кнопки с именем «Меню» на одном
              экране неразличимы на слух. */}
          <button type="button" className="c1-icon-btn c1-menu-close" onClick={close}>
            <CloseGlyph />
            <span className="c1-vh">{site.header.menuCloseLabel}</span>
          </button>

          <nav>
            <ul className="c1-menu-list">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={`${base}${item.href}`} onClick={(event) => goToFragment(event, item.href)}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  )
}

function TelegramGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.94 4.6 18.9 19.3c-.23 1.03-.85 1.28-1.72.8l-4.75-3.53-2.29 2.22c-.25.26-.47.48-.96.48l.34-4.9 8.83-8.05c.38-.34-.09-.53-.6-.19L6.85 13.02 2.16 11.53c-1.02-.32-1.04-1.03.21-1.52L20.63 2.9c.85-.31 1.6.2 1.31 1.7Z" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M1 1 19 19M19 1 1 19" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}
