import type { C7Scene } from './shared-world'

type Size = { width: number; height: number; low: boolean }
type Pose = { progress: number; time: number; sequence: number }

// A capability failure before transfer leaves the original canvas available
// to the main-thread renderer. After transfer, a failure uses the page fallback.
export function createWorkerWorld(
  canvas: HTMLCanvasElement, low: boolean, wake: () => void, signal: AbortSignal, mobile = false,
): Promise<C7Scene | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'
    || !canvas.transferControlToOffscreen) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      const early = window.__c7EarlyWorld
      if (early && early.version !== 'v646') early.dispose()
      worker = (early?.version === 'v646' ? early.take() : null)
        ?? new Worker('/3d/c7/runtime-v646/worker-entry.js', { type: 'module' })
    }
    catch { resolve(null); return }
    let transferred = false, settled = false, disposed = false, inFlight = false
    let active = true, requestedSequence = 0, submittedSequence = 0
    let mode: 'loading' | 'ready' | 'failed' = 'loading'
    let size: Size = { width: canvas.clientWidth, height: canvas.clientHeight, low }
    let pending: Pose | undefined
    let state: Record<string, unknown> = {}
    let disposalTimer: ReturnType<typeof setTimeout> | undefined
    const capabilityTimer = setTimeout(() => {
      if (!transferred && !settled) finishUnavailable()
    }, 2500)
    const stop = () => {
      clearTimeout(capabilityTimer)
      clearTimeout(disposalTimer)
      signal.removeEventListener('abort', abort)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
    }
    const finishUnavailable = () => {
      settled = true; disposed = true; stop(); resolve(null)
    }
    const abort = () => {
      disposed = true; mode = 'failed'; stop()
      if (!settled) { settled = true; reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }
    }
    const fail = (message: string) => {
      if (disposed) return
      if (!transferred) { finishUnavailable(); return }
      mode = 'failed'; pending = undefined; stop()
      if (!settled) { settled = true; reject(new Error(message)) }
      else { console.error('C7 rendering worker failed', message); wake() }
    }
    const flush = () => {
      if (disposed || !active || mode !== 'ready' || inFlight || !pending) return
      const pose = pending; pending = undefined; inFlight = true
      worker.postMessage({ type: 'render', ...pose, size })
    }
    const world: C7Scene = {
      render(progress, time) {
        if (!disposed && active) { pending = { progress, time, sequence: ++requestedSequence }; flush() }
        return state
      },
      setActive(next) {
        if (disposed || next === active) return
        active = next
        if (!active) { pending = undefined; submittedSequence = requestedSequence }
        worker.postMessage({ type: 'active', active })
      },
      resize(width, height, nextLow) { size = { width: Math.max(1, width), height: Math.max(1, height), low: nextLow } },
      restore() { if (!disposed) worker.postMessage({ type: 'restore' }) },
      dispose() {
        if (disposed) return
        disposed = true; mode = 'failed'; pending = undefined
        worker.postMessage({ type: 'dispose' })
        // A stalled context cannot keep an abandoned route or worker alive.
        disposalTimer = setTimeout(stop, 250)
      },
      status: () => mode,
      diagnostics: () => ({ ...state, execution: 'worker', pendingFrame: Boolean(pending),
        inFlight: active && (inFlight || requestedSequence > submittedSequence) }),
    }
    worker.onmessage = ({ data }) => {
      if (data.type === 'disposed') { stop(); return }
      if (disposed) return
      if (data.type === 'capable') {
        if (transferred || settled) return
        clearTimeout(capabilityTimer)
        if (!data.supported) { finishUnavailable(); return }
        try {
          signal.throwIfAborted()
          const offscreen = canvas.transferControlToOffscreen()
          transferred = true
          worker.postMessage({ type: 'init', canvas: offscreen, size, mobile,
            debug: new URLSearchParams(location.search).has('c7-debug') }, [offscreen])
        } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
      } else if (data.type === 'ready') {
        state = data.state; mode = 'ready'; settled = true
        signal.removeEventListener('abort', abort)
        resolve(world)
      } else if (data.type === 'accepted') {
        // Receipt is independent of GPU admission. A waiting worker still gets
        // the latest pose, while only one message plus one pose can wait here.
        inFlight = false; flush()
      } else if (data.type === 'frame') {
        state = data.state; submittedSequence = Math.max(submittedSequence, data.sequence)
        world.onFrame?.()
      } else if (data.type === 'contextlost') {
        mode = 'loading'; pending = undefined; inFlight = false
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      } else if (data.type === 'contextrestored') {
        mode = 'ready'
        canvas.dispatchEvent(new Event('webglcontextrestored'))
      } else if (data.type === 'failed') fail(data.message)
    }
    worker.onerror = event => { event.preventDefault(); fail(event.message || 'Worker execution failed') }
    worker.onmessageerror = () => fail('Worker message could not be decoded')
    if (signal.aborted) abort()
    else {
      signal.addEventListener('abort', abort, { once: true })
      // The early worker may have sent its first capability event before
      // hydration. Probe is idempotent and never transfers a second canvas.
      worker.postMessage({ type: 'probe' })
    }
  })
}
