'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

type Props = { src: string; alt: string; width: number; height: number }

// Browser-native lazy loading can fetch these large, distant cards while the
// first 3D frame is still downloading. Keep their original images and layout,
// but give the scene the network until the visitor approaches the cases.
export function C7CaseImage(props: Props) {
  const image = useRef<HTMLImageElement>(null)
  const [requested, setRequested] = useState(false)
  useEffect(() => {
    const element = image.current
    if (!element) return
    if (!('IntersectionObserver' in window)) { setRequested(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setRequested(true)
        observer.disconnect()
      }
    }, { rootMargin: '1000px 0px' })
    observer.observe(element)
    // Start at navigation intent as well as scroll proximity, including
    // keyboard focus. A direct #cases URL is covered by the first observation.
    const onIntent = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest('a[href="#cases"]')) {
        setRequested(true)
        observer.disconnect()
      }
    }
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    document.addEventListener('click', onIntent)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
      document.removeEventListener('click', onIntent)
    }
  }, [])
  const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${props.width}' height='${props.height}'/%3E`
  return <>
    <Image {...props} ref={image} className="c7-case-deferred" src={requested ? props.src : placeholder} sizes="(max-width: 720px) 100vw, 50vw" loading="eager" fetchPriority="low" />
    <noscript>
      <style>{'.c7-case-deferred{display:none}.c7-case noscript{display:contents}'}</style>
      <Image {...props} sizes="(max-width: 720px) 100vw, 50vw" loading="lazy" />
    </noscript>
  </>
}
