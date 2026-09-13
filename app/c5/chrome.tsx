'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '@/content/site'

export function C5Chrome({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false)
  const header = useRef<HTMLElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLAnchorElement>(null)
  const focusFragment = useCallback(() => {
    const id = decodeURIComponent(location.hash.slice(1)); if (!id) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(id); if (!target) return
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
        target.focus({ preventScroll: true })
      })
    })
  }, [])
  const goToFragment = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (base) { setOpen(false); return }
    event.preventDefault()
    setOpen(false)
    history.pushState(null, '', href)
    focusFragment()
  }, [base, focusFragment])
  useEffect(() => { focusFragment(); addEventListener('hashchange', focusFragment); return () => removeEventListener('hashchange', focusFragment) }, [focusFragment])
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    const siblings: Element[] = []
    for (const element of Array.from(header.current?.parentElement?.children ?? [])) {
      if (element === header.current || element.hasAttribute('inert')) continue
      element.setAttribute('inert', '')
      siblings.push(element)
    }
    root.style.overflow = 'hidden'
    first.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        button.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(header.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
        .filter((element) => element.getClientRects().length > 0)
      const firstElement = focusable[0]
      const lastElement = focusable.at(-1)
      if (!firstElement || !lastElement) return
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      root.style.overflow = previousOverflow
      siblings.forEach((element) => element.removeAttribute('inert'))
    }
  }, [open])
  return <header
    ref={header}
    className={`c5-header${open ? ' c5-header-open' : ''}`}
    role={open ? 'dialog' : undefined}
    aria-modal={open ? 'true' : undefined}
    aria-label={open ? site.header.menuLabel : undefined}
  >
    <div className="c5-header-row">
      <Link className="c5-home" href={base || '#hero'} aria-label={site.brand.name}>
        <Image className="c5-home-icon" src="/logo/volnami-icon-black.svg" alt="" width={384} height={384} priority />
        <Image className="c5-home-wordmark" src="/logo/volnami-wordmark-black.svg" alt="" width={842} height={271} priority />
      </Link>
      <Link className="c5-brief" href={`${base}${site.header.cta.href}`}>{site.header.cta.label}</Link>
      <a className="c5-tg" href={site.header.telegram.href} aria-label={site.header.telegram.label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.94 4.6 18.9 19.3c-.23 1.03-.85 1.28-1.72.8l-4.75-3.53-2.29 2.22c-.25.26-.47.48-.96.48l.34-4.9 8.83-8.05c.38-.34-.09-.53-.6-.19L6.85 13.02 2.16 11.53c-1.02-.32-1.04-1.03.21-1.52L20.63 2.9c.85-.31 1.6.2 1.31 1.7Z" /></svg></a>
      <button ref={button} type="button" className="c5-menu-button" aria-label={open ? site.header.menuCloseLabel : site.header.menuLabel} aria-expanded={open} aria-controls="c5-menu" onClick={() => setOpen((v) => !v)}><i /><i /></button>
    </div>
    <div id="c5-menu" className="c5-menu-dialog" hidden={!open}>
      <nav aria-label={site.header.menuLabel}><ul role="list">{site.nav.map((item, i) => <li key={item.href}><Link ref={i === 0 ? first : undefined} href={`${base}${item.href}`} onClick={(event) => goToFragment(event, item.href)}>{item.label}</Link></li>)}</ul></nav>
    </div>
  </header>
}
