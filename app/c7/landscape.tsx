'use client'

import { useEffect, useRef, useState } from 'react'
import type { C7Scene } from './scene/shared-world'
import { C7_MOTION_EVENT, readMotionPaused } from './motion'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const storyAnchors = [
  ['hero', 0],
  ['about', 0.16],
  ['process', 0.3],
  ['services', 0.47],
  ['cases', 0.66],
  ['testimonials', 0.83],
  ['contacts', 0.93],
] as const

export function C7Landscape() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderMode, setRenderMode] = useState<'loading' | 'ready' | 'fallback'>('loading')

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const posterCapture = new URLSearchParams(location.search).has('c7-poster')
    const debugCapture = new URLSearchParams(location.search).has('c7-debug')
    if (posterCapture) document.documentElement.classList.add('c7-poster-capture')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const saveData = Boolean(connection?.saveData)
    if (saveData) {
      window.__c7EarlyWorld?.dispose()
      setRenderMode('fallback')
      return () => {
        if (posterCapture) document.documentElement.classList.remove('c7-poster-capture')
      }
    }
    let webglAvailable = false
    try {
      // Probe on an isolated canvas so leaving during module preparation does
      // not strand a context on the page canvas or fix its renderer options.
      const probe = document.createElement('canvas').getContext('webgl2')
      webglAvailable = Boolean(probe)
      probe?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      // A browser or security policy can reject context creation entirely.
    }
    if (!webglAvailable) {
      window.__c7EarlyWorld?.dispose()
      setRenderMode('fallback')
      return () => {
        if (posterCapture) document.documentElement.classList.remove('c7-poster-capture')
      }
    }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let motionPaused = readMotionPaused()
    const staticMotion = () => reducedMotion.matches || motionPaused
    const compact = matchMedia('(max-width: 720px)')
    const quality = debugCapture ? new URLSearchParams(location.search).get('c7-quality') : null
    const mobileProfile = quality !== 'normal' && (compact.matches || matchMedia('(hover: none) and (pointer: coarse)').matches)
    const lowTier = quality === 'low' || (quality !== 'normal'
      && (compact.matches || (navigator.hardwareConcurrency || 8) <= 4))

    let requestedLowTier=lowTier
    const outputQuality=()=>{
      if(mobileProfile)return true
      if(quality==='low'||(quality!=='normal'&&(navigator.hardwareConcurrency||8)<=4))return true
      if(quality==='normal')return false
      if(requestedLowTier&&host.clientWidth>760)requestedLowTier=false
      else if(!requestedLowTier&&host.clientWidth<680)requestedLowTier=true
      return requestedLowTier
    }
    const preparationAbort=new AbortController()
    let disposed = false
    let world: C7Scene | undefined
    let observer: ResizeObserver | undefined
    let coverObserver: MutationObserver | undefined
    let layoutObserver: ResizeObserver | undefined
    let storyLayoutDirty = true
    let cachedAnchors: { y: number; progress: number }[] = []
    let raf = 0
    let lastFrame = 0
    let ambientTime = 0
    let exactProgress = 0
    let smoothProgress = 0
    let announcedMode: 'loading' | 'ready' | 'fallback' = 'loading'
    let visible = !document.hidden
    let contextLost = false
    let viewportWidth=0,viewportHeight=0,renderSuspended=false
    let coverDirty = true, cachedCover = false

    const pageAnchors = () => {
      if (!storyLayoutDirty && cachedAnchors.length) return cachedAnchors
      const maximum=Math.max(1,document.documentElement.scrollHeight-innerHeight)
      cachedAnchors = [...storyAnchors.map(([id,progress])=>({
        y:Math.min(maximum,document.getElementById(id)?.offsetTop??maximum*progress),progress,
      })),{y:maximum,progress:1}]
      storyLayoutDirty = false
      return cachedAnchors
    }
    const pageProgress = () => {
      const anchors=pageAnchors(),y=Math.max(0,Math.min(anchors[anchors.length-1].y,scrollY))
      for(let i=0;i<anchors.length-1;i++) {
        const a=anchors[i],b=anchors[i+1]
        if(y<=b.y||i===anchors.length-2)return a.progress+(b.progress-a.progress)*clamp01((y-a.y)/Math.max(1,b.y-a.y))
      }
      return 1
    }
    const scrollForProgress = (progress:number) => {
      const anchors=pageAnchors()
      for(let i=0;i<anchors.length-1;i++) {
        const a=anchors[i],b=anchors[i+1]
        if(progress<=b.progress){scrollTo({top:a.y+(b.y-a.y)*clamp01((progress-a.progress)/(b.progress-a.progress)),behavior:'instant'});return}
      }
    }
    const coveredByPaper = () => {
      if (!coverDirty) return cachedCover
      coverDirty = false
      const menu = document.querySelector('.c7-menu')
      if (menu) {
        if (getComputedStyle(menu).opacity !== '1') coverDirty = true
        else {
          const box = menu.getBoundingClientRect()
          if (box.top <= 0 && box.bottom >= host.clientHeight
            && box.left <= 0 && box.right >= host.clientWidth) return cachedCover = true
        }
      }
      return cachedCover = ['services','cases'].some(id=>{
        const section=document.getElementById(id)
        if(!section||getComputedStyle(section).visibility==='hidden')return false
        const box=section.getBoundingClientRect()
        if (!(box.top<=0&&box.bottom>=host.clientHeight)) return false
        // These sections may now be translucent. A visible world must keep
        // moving; only an actually opaque background can suspend rendering.
        const color = getComputedStyle(section, '::before').backgroundColor
        const channels = color.match(/[\d.]+/g)?.map(Number)
        return color.startsWith('rgb(') || (color.startsWith('rgba(') && channels?.[3] === 1)
      })
    }

    // Worker frames arrive asynchronously, including when reduced motion has
    // stopped rAF. Publish their real counters without scheduling another draw.
    const reportFrame = () => {
      if (debugCapture && world) host.dataset.c7Debug = JSON.stringify({
        ...world.diagnostics(), exactProgress, smoothProgress, renderSuspended, exactPhotoBlend:0,
      })
    }
    const render = () => {
      if (!world) return
      if(world.status()==='failed'){
        if(announcedMode!=='fallback'){announcedMode='fallback';setRenderMode('fallback')}
        return
      }
      const covered=announcedMode==='ready'&&coveredByPaper()
      // Keep semantic state current while the canvas is fully covered. Before
      // revealing it, paint the current pose immediately, without an old chapter.
      if(covered||renderSuspended)smoothProgress=exactProgress
      renderSuspended=covered
      world.setActive?.(visible&&!renderSuspended)
      if(visible&&!renderSuspended)world.render(smoothProgress, ambientTime)
      reportFrame()
      const nextMode = world.status() === 'ready' ? 'ready' : world.status() === 'failed' ? 'fallback' : 'loading'
      if (announcedMode !== nextMode) {
        announcedMode = nextMode
        setRenderMode(nextMode)
      }
    }

    const resize = () => {
      if (!world) return
      coverDirty = true
      const nextWidth=host.clientWidth,nextHeight=host.clientHeight
      // Mobile browser chrome changes height during a touch scroll. Rewriting
      // scrollTop in that case fights native scrolling and jumps the camera.
      // Preserve chapter anchoring only for a real width/orientation reflow.
      const changed=viewportWidth>0&&(nextWidth!==viewportWidth||(!mobileProfile&&nextHeight!==viewportHeight))
      const previousProgress=exactProgress
      storyLayoutDirty = true
      viewportWidth=nextWidth;viewportHeight=nextHeight
      world.resize(nextWidth,nextHeight,outputQuality())
      if(changed)scrollForProgress(previousProgress)
      exactProgress=pageProgress()
      smoothProgress=exactProgress
      render()
      wake()
    }

    const frame = (timestamp: number) => {
      raf = 0
      if (disposed || !visible || contextLost || !world) return
      // Visible animation follows elapsed time even when a frame is delayed.
      // wake() resets the clock after pause, hidden or fully covered states.
      const elapsed = lastFrame ? Math.max(0, (timestamp - lastFrame) / 1000) : 0
      const delta = Math.min(0.08, elapsed)
      lastFrame = timestamp
      if (staticMotion()) {
        smoothProgress = exactProgress
      } else {
        const damping = 1 - Math.exp(-14.4 * delta)
        smoothProgress += (exactProgress - smoothProgress) * damping
        // End the subpixel damping tail at its exact target so settled lighting stays idle.
        if (Math.abs(exactProgress - smoothProgress) < 1e-6) smoothProgress = exactProgress
        ambientTime += elapsed
      }
      render()
      if (!staticMotion()&&world.status()!=='failed'&&!renderSuspended) raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (disposed || !visible || contextLost || !world || raf) return
      lastFrame = 0
      raf = requestAnimationFrame(frame)
    }

    const onScroll = () => {
      coverDirty = true
      // Native resize anchoring may dispatch scroll before ResizeObserver.
      // Preserve the last pre-reflow phase until resize maps it to the new DOM.
      if(viewportWidth&&(host.clientWidth!==viewportWidth||host.clientHeight!==viewportHeight))return
      exactProgress = pageProgress()
      if (staticMotion()||renderSuspended) wake()
    }
    const onVisibility = () => {
      visible = !document.hidden
      if (!visible && raf) cancelAnimationFrame(raf)
      raf = 0
      if (!visible) world?.setActive?.(false)
      if (visible) {
        // A background tab can scroll while native browser chrome also changes
        // the viewport. Read that current DOM position before resize preserves
        // a semantic phase; otherwise it restores the pre-hide chapter.
        exactProgress = pageProgress()
        smoothProgress = exactProgress
        if(host.clientWidth!==viewportWidth||host.clientHeight!==viewportHeight)resize()
        wake()
      }
    }
    const onMotionChange = () => {
      exactProgress = pageProgress()
      wake()
    }
    const onManualMotion = (event: Event) => {
      motionPaused = Boolean((event as CustomEvent<{ paused: boolean }>).detail?.paused)
      onMotionChange()
    }
    // Install before async preparation so a choice made while loading is kept.
    window.addEventListener(C7_MOTION_EVENT, onManualMotion)
    const onContextLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      announcedMode = 'fallback'
      setRenderMode('fallback')
    }
    const onContextRestored = () => {
      contextLost = false
      announcedMode = 'loading'
      world?.restore()
      resize()
      wake()
    }

    // The page and scene laboratory now use the same authored world.
    // Legacy source remains in the repository as a reversible historical baseline.
    const worldModule = import('./scene/shared-world')
    void worldModule.then(async ({ createC7World }) => {
      if (disposed) return
      try {
        world = await createC7World(canvas, lowTier || mobileProfile, wake, preparationAbort.signal, mobileProfile)
        if(disposed){world.dispose();return}
        world.onFrame = reportFrame
        observer = new ResizeObserver(resize)
        observer.observe(host)
        // DOM positions change only with layout, not with every scroll tick.
        layoutObserver = new ResizeObserver(() => {
          coverDirty = true
          storyLayoutDirty = true
          exactProgress = pageProgress()
          if (staticMotion() || renderSuspended) wake()
        })
        document.querySelectorAll('.c7 main, .c7 main > section, #brief').forEach(section => layoutObserver?.observe(section))
        // Closing an opaque menu must wake a suspended world even without scroll.
        coverObserver = new MutationObserver(records => {
          if (records.some(record => [...record.addedNodes, ...record.removedNodes]
            .some(node => node instanceof Element && node.classList.contains('c7-menu')))) { coverDirty = true; wake() }
        })
        if (host.parentElement) coverObserver.observe(host.parentElement, { childList: true })
        window.addEventListener('scroll', onScroll, { passive: true })
        document.addEventListener('visibilitychange', onVisibility)
        reducedMotion.addEventListener('change', onMotionChange)
        canvas.addEventListener('webglcontextlost', onContextLost)
        canvas.addEventListener('webglcontextrestored', onContextRestored)
        exactProgress = pageProgress()
        smoothProgress = exactProgress
        resize()
        wake()
      } catch (error) {
        if(disposed||preparationAbort.signal.aborted)return
        console.error('C7 world failed to initialize', error)
        setRenderMode('fallback')
      }
    }).catch((error) => {
      console.error('C7 world failed to load', error)
      if (!disposed) setRenderMode('fallback')
    })

    return () => {
      disposed = true
      window.__c7EarlyWorld?.dispose()
      preparationAbort.abort()
      if (posterCapture) document.documentElement.classList.remove('c7-poster-capture')
      if (raf) cancelAnimationFrame(raf)
      observer?.disconnect()
      coverObserver?.disconnect()
      layoutObserver?.disconnect()
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      reducedMotion.removeEventListener('change', onMotionChange)
      window.removeEventListener(C7_MOTION_EVENT, onManualMotion)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      world?.dispose()
    }
  }, [])

  return <><div ref={hostRef} className={`c7-landscape is-${renderMode}`} aria-hidden="true">
    <picture className="c7-landscape-fallback">
      <source media="(max-aspect-ratio: 3/5)" srcSet="/3d/c7/backdrop/scene-v606-phone.webp" />
      <source media="(max-aspect-ratio: 22/25)" srcSet="/3d/c7/backdrop/scene-v606-portrait.webp" />
      <img src="/3d/c7/backdrop/scene-v606-wide.webp" alt="" width={1920} height={1080} fetchPriority="high" />
    </picture>
    <canvas ref={canvasRef} />
  </div>
    {renderMode === 'loading' && <p className="c7-scene-status" role="status">Загружаем пейзаж…</p>}
    <noscript><style>{`.c7-landscape.is-loading .c7-landscape-fallback img { visibility: visible; } .c7-scene-status { display: none; }`}</style></noscript>
  </>
}
