'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const KEY = 'c7-privacy-notice-v1'
const EVENT = 'c7-open-privacy'
const MAX_AGE = 180 * 24 * 60 * 60 * 1000

export function C7PrivacyButton() {
  return <button type="button" className="c7-privacy-open" onClick={() => window.dispatchEvent(new Event(EVENT))}>Конфиденциальность</button>
}

export function C7PrivacyNotice() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    let seen = false
    try {
      const timestamp = Number(localStorage.getItem(KEY))
      const age = Date.now() - timestamp
      seen = timestamp > 0 && age >= 0 && age < MAX_AGE
    } catch { /* Storage may be unavailable; the page still works. */ }
    let timer: ReturnType<typeof setTimeout> | undefined
    let focusFrame = 0
    const showAutomatically = () => {
      // Do not insert a new interactive sibling behind an already open modal.
      if (document.querySelector('.c7-menu')) { timer = setTimeout(showAutomatically, 500); return }
      setOpen(true)
    }
    if (!seen) timer = setTimeout(showAutomatically, 2200)
    const show = () => {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
      focusFrame = requestAnimationFrame(() => button.current?.focus())
    }
    window.addEventListener(EVENT, show)
    return () => { clearTimeout(timer); cancelAnimationFrame(focusFrame); window.removeEventListener(EVENT, show) }
  }, [])
  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* Memory-only dismissal. */ }
    setOpen(false)
    restoreFocus.current?.focus({ preventScroll: true })
    restoreFocus.current = null
  }
  if (!open) return null
  return <aside className="c7-privacy-notice" aria-labelledby="c7-privacy-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close() }
  }}>
    <svg viewBox="0 0 300 28" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18C40 18 50 3 95 3S155 27 200 17S265 1 300 12"/></svg>
    <div>
      <h2 id="c7-privacy-title">Cookies и настройки</h2>
      <p>Мы не используем аналитические и рекламные cookies. На этом устройстве сохраняются только настройки интерфейса.</p>
      <div className="c7-privacy-actions">
        <Link href="/cookie/">Подробнее о cookies</Link>
        <button ref={button} type="button" onClick={close}>Понятно</button>
      </div>
    </div>
  </aside>
}
