import { createWorkerWorld } from './render-worker'

export type C7Scene = {
  render(progress: number, time: number): unknown
  resize(width: number, height: number, low: boolean): void
  restore(): void
  dispose(): void
  status(): 'loading' | 'ready' | 'failed'
  diagnostics(): object
  onFrame?: () => void
  setActive?: (active: boolean) => void
}

type StartupInputs = {
  take(name: string, signal?: AbortSignal): Promise<ArrayBuffer>
  takeCompressed(name: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; format: string | null }>
  dispose(): void
}
type StartupModule = { prepareStartupInputs(options: { compactHorizon?: boolean; signal: AbortSignal }): StartupInputs }
type SharedModule = { createC7Scene(options: {
  canvas: HTMLCanvasElement; width: number; height: number; low: boolean; mobile: boolean; signal: AbortSignal; inputs: StartupInputs
}): Promise<C7Scene & { renderer: { getContext(): WebGL2RenderingContext } }> }

// The fallback used to submit an unbounded stream to the GPU. Keep the same
// latest-pose admission as the worker, including a final draw after scroll/pause.
function admitMainThreadFrames(main: C7Scene & { renderer: { getContext(): WebGL2RenderingContext } }): C7Scene {
  const gl = main.renderer.getContext()
  let pending: { progress: number; time: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = true, disposed = false, failed = false
  const fences: WebGLSync[] = []
  const stopTimer = () => { clearTimeout(timer); timer = undefined }
  const clearFences = () => { for (const fence of fences) gl.deleteSync(fence); fences.length = 0 }
  const pump = () => {
    stopTimer()
    if (!active || disposed || failed || !pending || gl.isContextLost()) return
    while (fences.length) {
      const status = gl.clientWaitSync(fences[0], 0, 0)
      if (status === gl.TIMEOUT_EXPIRED) break
      if (status === gl.WAIT_FAILED) throw new Error('C7 main-thread GPU fence failed')
      gl.deleteSync(fences.shift()!)
    }
    if (fences.length >= 2) {
      timer = setTimeout(safePump, 4)
      return
    }
    const pose = pending
    pending = undefined
    main.render(pose.progress, pose.time)
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (fence) { fences.push(fence); gl.flush() }
    else if (!gl.isContextLost()) throw new Error('C7 main-thread GPU fence unavailable')
    owner.onFrame?.()
  }
  const safePump = () => {
    try { pump() } catch (error) {
      failed = true; pending = undefined; stopTimer()
      console.error('C7 main-thread rendering failed', error)
      owner.onFrame?.()
    }
  }
  const owner: C7Scene = {
    render(progress, time) {
      if (!disposed && active && !failed) { pending = { progress, time }; safePump() }
      return main.diagnostics()
    },
    resize: (width, height, low) => main.resize(width, height, low),
    restore() { stopTimer(); clearFences(); main.restore() },
    setActive(next) {
      if (active === next || disposed) return
      active = next
      if (!active) { pending = undefined; stopTimer() }
    },
    dispose() { disposed = true; pending = undefined; stopTimer(); clearFences(); main.dispose() },
    status: () => failed ? 'failed' : main.status(),
    diagnostics: () => ({ ...main.diagnostics(), execution: 'main-thread', pendingFrame: Boolean(pending), inFlight: Boolean(pending) }),
  }
  const initialFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (initialFence) { fences.push(initialFence); gl.flush() }
  return owner
}

export async function createC7World(canvas: HTMLCanvasElement, low: boolean, _wake: () => void, signal: AbortSignal, mobile = false): Promise<C7Scene> {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  let world: C7Scene | undefined
  let inputs: StartupInputs | undefined
  let rejectPreparation: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    rejectPreparation = () => reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError'))
  })
  controller.signal.addEventListener('abort', rejectPreparation, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('C7 scene preparation timed out')), 45000)
  try {
    controller.signal.throwIfAborted()
    world = await Promise.race([
      (async () => {
        const workerWorld = await createWorkerWorld(canvas, low, _wake, controller.signal, mobile)
        if (workerWorld) return workerWorld
        controller.signal.throwIfAborted()
        const url = '/3d/c7/runtime-v646/world.js'
        const inputsUrl = '/3d/c7/runtime-v646/startup-inputs.js'
        const [module] = await Promise.all([
          import(/* webpackIgnore: true */ url) as Promise<SharedModule>,
          (async () => {
            const loader = await import(/* webpackIgnore: true */ inputsUrl) as StartupModule
            controller.signal.throwIfAborted()
            inputs = loader.prepareStartupInputs({ signal: controller.signal })
          })(),
        ])
        controller.signal.throwIfAborted()
        const mainWorld = await module.createC7Scene({ canvas, width: canvas.clientWidth, height: canvas.clientHeight, low, mobile, signal: controller.signal, inputs: inputs! })
        return admitMainThreadFrames(mainWorld)
      })(),
      cancelled,
    ])
    controller.signal.throwIfAborted()
    return world
  } catch (error) {
    // Also cancels early transport if module evaluation or renderer creation
    // failed before the world could take ownership.
    controller.abort(error)
    inputs?.dispose()
    world?.dispose()
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectPreparation)
  }
}
