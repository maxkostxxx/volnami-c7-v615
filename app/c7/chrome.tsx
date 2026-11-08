'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { c7Site as site } from './content'
import { readMotionPaused, setMotionPaused } from './motion'

export function C7Chrome() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [motionPaused, updateMotionPaused] = useState(false)
  const [systemReduced, setSystemReduced] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFragmentRef = useRef(false)
  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setOpen(false)
    setClosing(false)
  }, [])
  const close = useCallback(() => {
    if (systemReduced || readMotionPaused() || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose()
      return
    }
    setClosing(true)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(finishClose, 540)
  }, [finishClose, systemReduced])
  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setClosing(false)
    setOpen(true)
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  useEffect(() => {
    updateMotionPaused(readMotionPaused())
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const focusFragment = useCallback((animate = true) => {
    let id: string
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return
    }
    if (!id) return
    document.getElementById(id)?.focus({ preventScroll: true })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (!target) return
      target.scrollIntoView({
        behavior: animate && !readMotionPaused() && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant',
        block: 'start',
      })
      target.focus({ preventScroll: true })
    }))
  }, [])

  const goToFragment = useCallback((event: MouseEvent, link: HTMLAnchorElement, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return
    event.preventDefault()
    let id: string
    try { id = decodeURIComponent(href.slice(1)) } catch { return }
    if (!document.getElementById(id)) return
    if (location.hash !== href) history.pushState(history.state, '', href)
    if (open) {
      // Escape begins the decorative close animation. A subsequent navigation
      // must not inherit its 540 ms delay or leave keyboard focus behind the
      // fading overlay.
      if (closing) {
        finishClose()
        focusFragment()
        return
      }
      pendingFragmentRef.current = true
      close()
      return
    }
    focusFragment()
  }, [close, closing, finishClose, focusFragment, open])

  useEffect(() => {
    // One path for header, menu, hero cue, skip link and footer. Preserve native
    // modified clicks and only handle valid anchors inside this C7 page.
    const navigate = (event: MouseEvent) => {
      const link = (event.target instanceof Element ? event.target.closest('a[href^="#"]') : null) as HTMLAnchorElement | null
      if (link?.closest('.c7')) goToFragment(event, link, link.getAttribute('href')!)
    }
    document.addEventListener('click', navigate)
    return () => document.removeEventListener('click', navigate)
  }, [goToFragment])

  useEffect(() => {
    focusFragment(false)
    const onHashChange = () => focusFragment(false)
    addEventListener('hashchange', onHashChange)
    addEventListener('popstate', onHashChange)
    return () => {
      removeEventListener('hashchange', onHashChange)
      removeEventListener('popstate', onHashChange)
    }
  }, [focusFragment])

  useEffect(() => {
    const update = () => setScrolled(scrollY > 24)
    update()
    addEventListener('scroll', update, { passive: true })
    return () => removeEventListener('scroll', update)
  }, [])

  useEffect(() => {
    if (!open || closing) return
    const panel = panelRef.current
    const touched: Element[] = []
    for (const element of Array.from(panel?.parentElement?.children ?? [])) {
      if (element === panel || element.hasAttribute('inert')) continue
      element.setAttribute('inert', '')
      touched.push(element)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href],button') ?? [])
      .filter((element) => !element.matches(':disabled') && element.tabIndex >= 0 && getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0)
    focusables()[0]?.focus()

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      touched.forEach((element) => element.removeAttribute('inert'))
      buttonRef.current?.focus()
    }
  }, [open, closing, close])

  useEffect(() => {
    if (open || !pendingFragmentRef.current) return
    pendingFragmentRef.current = false
    requestAnimationFrame(() => focusFragment())
  }, [open, focusFragment])

  return <>
    <header className={`c7-header${scrolled ? ' is-scrolled' : ''}`}>
      <a className="c7-home" href="#hero">
        <Image src="/logo/volnami-wordmark-green.svg" alt={site.brand.name} width={841} height={271} priority />
      </a>
      <div className="c7-header-actions">
        <a className="c7-brief" href={site.header.cta.href}>{site.header.cta.label}</a>
        <a className="c7-telegram" href={site.header.telegram.href} aria-label={site.header.telegram.label}><Telegram /></a>
        <button ref={buttonRef} className="c7-menu-button" type="button" aria-expanded={open && !closing} aria-controls="c7-menu" onClick={openMenu}>
          <span className="c7-vh">{site.header.menuLabel}</span><i /><i /><i />
        </button>
      </div>
    </header>

    {open ? <div ref={panelRef} className="c7-menu" id="c7-menu" role="dialog" aria-modal="true" aria-label={site.header.menuLabel}
      data-state={closing ? 'closing' : 'open'} inert={closing} aria-hidden={closing || undefined}
      onAnimationEnd={event => { if (closing && event.target === event.currentTarget) finishClose() }}>
      <button className="c7-menu-close" type="button" onClick={close} aria-label={site.header.menuCloseLabel}><span /><span /></button>
      <nav aria-label={site.header.menuLabel}>
        <ul role="list">{site.nav.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ul>
      </nav>
      <div className="c7-menu-footer">
        <button className="c7-motion-toggle" type="button" disabled={systemReduced}
          aria-pressed={systemReduced || motionPaused}
          title={systemReduced ? 'По настройкам устройства' : undefined}
          onClick={() => { const next = !motionPaused; updateMotionPaused(next); setMotionPaused(next) }}>
          {systemReduced ? 'Движение отключено' : motionPaused ? 'Включить движение' : 'Остановить движение'}
        </button>
        <a href={site.contacts.email.href}>{site.contacts.email.value}</a>
        <a href={site.contacts.telegram.href}>{site.contacts.telegram.value}</a>
      </div>
      <svg className="c7-menu__edge" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 32C220 105 400-22 680 38S1130 98 1440 22V100H0Z" /></svg>
    </div> : null}
  </>
}

function Telegram() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.94 4.6 18.9 19.3c-.23 1.03-.85 1.28-1.72.8l-4.75-3.53-2.29 2.22c-.25.26-.47.48-.96.48l.34-4.9 8.83-8.05c.38-.34-.09-.53-.6-.19L6.85 13.02 2.16 11.53c-1.02-.32-1.04-1.03.21-1.52L20.63 2.9c.85-.31 1.6.2 1.31 1.7Z" /></svg>
}
