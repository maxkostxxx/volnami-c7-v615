'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '@/content/site'

export function C6Chrome({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
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
    window.addEventListener('hashchange', focusFragment)
    return () => window.removeEventListener('hashchange', focusFragment)
  }, [focusFragment])

  useEffect(() => {
    if (!open) return
    const layer = layerRef.current
    const siblings: Element[] = []

    for (const element of Array.from(layer?.parentElement?.children ?? [])) {
      if (element === layer || element.hasAttribute('inert')) continue
      element.setAttribute('inert', '')
      siblings.push(element)
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () => Array.from(layer?.querySelectorAll<HTMLElement>('a[href], button') ?? [])
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)

    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !layer?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      siblings.forEach((element) => element.removeAttribute('inert'))
      triggerRef.current?.focus()
    }
  }, [close, open])

  return <>
    <header className="c6-header">
      <Link className="c6-home" href={base || '#hero'}>
        <Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} priority />
      </Link>
      <div className="c6-header-actions">
        <Link className="c6-brief" href={`${base}${site.header.cta.href}`}>{site.header.cta.label}</Link>
        <a className="c6-tg" href={site.header.telegram.href} aria-label={site.header.telegram.label}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.94 4.6 18.9 19.3c-.23 1.03-.85 1.28-1.72.8l-4.75-3.53-2.29 2.22c-.25.26-.47.48-.96.48l.34-4.9 8.83-8.05c.38-.34-.09-.53-.6-.19L6.85 13.02 2.16 11.53c-1.02-.32-1.04-1.03.21-1.52L20.63 2.9c.85-.31 1.6.2 1.31 1.7Z" /></svg>
        </a>
        <button ref={triggerRef} type="button" className="c6-menu-button" aria-expanded={open} aria-controls="c6-menu" onClick={() => setOpen(true)}>
          <span className="c6-vh">{site.header.menuLabel}</span><i /><i /><i />
        </button>
      </div>
    </header>

    {open ? <div ref={layerRef} className="c6-menu-layer">
      <div className="c6-menu-scrim" aria-hidden="true" />
      <div id="c6-menu" className="c6-menu" role="dialog" aria-modal="true" aria-label={site.header.menuLabel}>
        <button className="c6-menu-close" type="button" onClick={close} aria-label={site.header.menuCloseLabel}><span /><span /></button>
        <nav aria-label={site.header.menuLabel}>
          <ul role="list">{site.nav.map((item) => <li key={item.href}><Link href={`${base}${item.href}`} onClick={(event) => goToFragment(event, item.href)}>{item.label}</Link></li>)}</ul>
        </nav>
        <a className="c6-menu-contact" href={site.contacts.email.href}>{site.contacts.email.value}</a>
      </div>
    </div> : null}
  </>
}
