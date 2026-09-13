'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '@/content/site'

export function C4Chrome({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const focusFragment = useCallback(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(id)
        if (!target) return
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
        target.focus({ preventScroll: true })
      })
    })
  }, [])

  const goToFragment = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (base) { close(); return }
    event.preventDefault()
    close()
    history.pushState(null, '', href)
    focusFragment()
  }, [base, close, focusFragment])

  useEffect(() => {
    focusFragment()
    addEventListener('hashchange', focusFragment)
    return () => removeEventListener('hashchange', focusFragment)
  }, [focusFragment])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const touched: Element[] = []
    for (const el of Array.from(panel?.parentElement?.children ?? [])) {
      if (el === panel || el.hasAttribute('inert')) continue
      el.setAttribute('inert', '')
      touched.push(el)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href],button') ?? [])
      .filter((el) => el.tabIndex >= 0 && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0)
    focusables()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return }
      if (event.key !== 'Tab') return
      const list = focusables(); if (!list.length) return
      const first = list[0]; const last = list[list.length - 1]; const active = document.activeElement
      if (event.shiftKey && (active === first || !panel?.contains(active))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = previous
      touched.forEach((el) => el.removeAttribute('inert'))
      buttonRef.current?.focus()
    }
  }, [open, close])

  return <>
    <header className="c4-header">
      <Link className="c4-home" href={base || '#hero'}>
        <Image src="/logo/volnami-wordmark-black.svg" alt={site.brand.name} width={841} height={271} priority />
      </Link>
      <div className="c4-header-actions">
        <Link className="c4-brief" href={`${base}${site.header.cta.href}`}>{site.header.cta.label}</Link>
        <a className="c4-telegram" href={site.header.telegram.href} aria-label={site.header.telegram.label}><Telegram /></a>
        <button ref={buttonRef} className="c4-menu-button" type="button" aria-expanded={open} aria-controls="c4-menu" onClick={() => setOpen(true)}>
          <span className="c4-vh">{site.header.menuLabel}</span><i /><i /><i />
        </button>
      </div>
    </header>
    {open ? <div ref={panelRef} id="c4-menu" className="c4-menu" role="dialog" aria-modal="true" aria-label={site.header.menuLabel}>
      <button className="c4-menu-close" type="button" onClick={close} aria-label={site.header.menuCloseLabel}><span /><span /></button>
      <nav aria-label={site.header.menuLabel}><ul role="list">{site.nav.map((item) => <li key={item.href}><Link href={`${base}${item.href}`} onClick={(event) => goToFragment(event, item.href)}>{item.label}</Link></li>)}</ul></nav>
      <a className="c4-menu-contact" href={site.contacts.email.href}>{site.contacts.email.value}</a>
    </div> : null}
  </>
}

function Telegram() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.94 4.6 18.9 19.3c-.23 1.03-.85 1.28-1.72.8l-4.75-3.53-2.29 2.22c-.25.26-.47.48-.96.48l.34-4.9 8.83-8.05c.38-.34-.09-.53-.6-.19L6.85 13.02 2.16 11.53c-1.02-.32-1.04-1.03.21-1.52L20.63 2.9c.85-.31 1.6.2 1.31 1.7Z" /></svg>
}
