import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { verifiedBuild } from './c7-qa-build.mjs'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3017'
const output = process.env.QA_OUTPUT
if (!output) throw new Error('QA_OUTPUT required')
await mkdir(output, { recursive: true })
const build = await verifiedBuild(base)
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const results = { base, time: new Date().toISOString(), build, runs: {} }

function monitor(page) {
  const errors = []
  const badResponses = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }) })
  return { errors, badResponses }
}

async function openReady(page) {
  const response = await page.goto(base + '/c7/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  assert.equal(response.status(), 200)
  await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

function pathMetrics(path) {
  const values = path.match(/-?\d*\.?\d+/g).map(Number)
  const xs = values.filter((_, index) => index % 2 === 0)
  const ys = values.filter((_, index) => index % 2 === 1)
  const radii = xs.map((x, index) => Math.hypot(x / 1.26, ys[index] / 0.9))
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    normalizedRadiusRange: Math.max(...radii) - Math.min(...radii),
  }
}

function transform(transform) {
  const match = transform.match(/translate3d\(\s*(-?\d*\.?\d+)px,\s*(-?\d*\.?\d+)px,.*?rotate\((-?\d*\.?\d+)deg\)/)
  return match ? { x: Number(match[1]), y: Number(match[2]), angle: Number(match[3]) } : null
}

try {
  const fineContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  })
  await fineContext.addInitScript(() => {
    window.__c7QaCommits = 0
    const hook = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id },
      onScheduleFiberRoot() {},
      onCommitFiberRoot() { window.__c7QaCommits += 1 },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
    }
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook })
  })
  const page = await fineContext.newPage()
  const fineMonitor = monitor(page)
  await openReady(page)
  assert.equal(await page.evaluate(() => matchMedia('(pointer: fine)').matches), true)
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false)
  const cursor = page.locator('.c7-wave-cursor')
  assert.equal(await cursor.evaluate(element => getComputedStyle(element).display), 'block')
  assert.equal(await cursor.getAttribute('aria-hidden'), 'true')
  assert.equal(await cursor.evaluate(element => getComputedStyle(element).pointerEvents), 'none')
  assert.equal(await cursor.evaluate(element => getComputedStyle(element).userSelect), 'none')
  assert.equal(await cursor.evaluate(element => element.tabIndex), -1)
  assert.notEqual(await page.locator('.c7').evaluate(element => getComputedStyle(element).cursor), 'none')
  assert.notEqual(await page.locator('.c7-menu-button').evaluate(element => getComputedStyle(element).cursor), 'none')

  const commitsBefore = await page.evaluate(() => window.__c7QaCommits)
  await page.mouse.move(220, 220)
  await page.waitForTimeout(250)
  const latencyProbe = page.evaluate(() => new Promise(resolve => {
    const root = document.querySelector('.c7-wave-cursor')
    const previous = root.style.transform
    window.addEventListener('pointermove', () => {
      const started = performance.now()
      const check = () => {
        if (root.style.transform !== previous) {
          resolve({ milliseconds: performance.now() - started, previous, current: root.style.transform })
        } else if (performance.now() - started > 2000) {
          resolve({ milliseconds: null, previous, current: root.style.transform })
        } else requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    }, { once: true })
  }))
  await page.mouse.move(660, 340)
  const latency = await latencyProbe
  assert.ok(latency.milliseconds !== null && latency.milliseconds < 80, JSON.stringify(latency))
  const damped = transform(latency.current)
  assert.ok(damped && damped.x > 184 && damped.x < 624 && damped.y > 184 && damped.y < 304, JSON.stringify(damped))
  await page.waitForFunction(() => {
    const matrix = new DOMMatrix(document.querySelector('.c7-wave-cursor').style.transform)
    return Math.abs(matrix.e - 624) < 0.02 && Math.abs(matrix.f - 304) < 0.02
  })

  const idleMutations = await page.evaluate(() => new Promise(resolve => {
    const root = document.querySelector('.c7-wave-cursor')
    let count = 0
    const observer = new MutationObserver(records => { count += records.length })
    observer.observe(root, { attributes: true, subtree: true })
    setTimeout(() => { observer.disconnect(); resolve(count) }, 220)
  }))
  assert.equal(idleMutations, 0, 'Cursor must stop writing when damping has settled')

  await page.mouse.move(760, 420)
  await page.waitForTimeout(450)
  const restingPath = await page.locator('.c7-wave-cursor__arc').getAttribute('d')
  const brief = await page.locator('.c7-brief').boundingBox()
  await page.mouse.move(brief.x + brief.width / 2, brief.y + brief.height / 2)
  await page.waitForTimeout(450)
  const interactivePath = await page.locator('.c7-wave-cursor__arc').getAttribute('d')
  assert.notEqual(interactivePath, restingPath)
  const restingMetrics = pathMetrics(restingPath)
  const interactiveMetrics = pathMetrics(interactivePath)
  assert.ok(interactiveMetrics.width > restingMetrics.width * 1.08, JSON.stringify({ restingMetrics, interactiveMetrics }))
  assert.ok(interactiveMetrics.normalizedRadiusRange > 2, 'Interactive arc must be a stretched wave, not a scaled circle')
  assert.equal(await page.locator('.c7-wave-cursor__arc').evaluate(element => element.tagName.toLowerCase()), 'path')
  await page.screenshot({ path: output + '/fine-interactive.png' })

  await page.mouse.move(700, 420)
  await page.waitForTimeout(450)
  const commitsAfter = await page.evaluate(() => window.__c7QaCommits)
  assert.equal(commitsAfter, commitsBefore, 'Pointer movement and hover must not commit React roots')
  assert.ok(commitsBefore > 0, 'React commit instrumentation did not initialize')

  await page.evaluate(() => {
    window.__c7QaRippleStarts = 0
    const ripple = document.querySelector('.c7-wave-cursor__ripple')
    let active = false
    window.__c7QaRippleObserver = new MutationObserver(() => {
      const visible = Number(getComputedStyle(ripple).opacity) > 0
      if (visible && !active) window.__c7QaRippleStarts += 1
      active = visible
    })
    window.__c7QaRippleObserver.observe(ripple, { attributes: true, attributeFilter: ['style', 'd'] })
  })
  await page.evaluate(() => {
    const ripple = document.querySelector('.c7-wave-cursor__ripple')
    window.__c7QaRippleFrame = new Promise(resolve => {
      const timeout = setTimeout(() => { observer.disconnect(); resolve({ opacity: 0, closedWave: false }) }, 2000)
      const observer = new MutationObserver(() => {
        const opacity = Number(ripple.style.opacity)
        if (opacity > 0) {
          clearTimeout(timeout)
          observer.disconnect()
          resolve({ opacity, closedWave: ripple.getAttribute('d')?.endsWith('Z') ?? false })
        }
      })
      observer.observe(ripple, { attributes: true, attributeFilter: ['style', 'd'] })
    })
  })
  await page.mouse.click(700, 420)
  const rippleVisible = await page.evaluate(() => window.__c7QaRippleFrame)
  assert.ok(rippleVisible.opacity > 0 && rippleVisible.closedWave, JSON.stringify(rippleVisible))
  await page.screenshot({ path: output + '/fine-ripple.png' })
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.c7-wave-cursor__ripple')).opacity) === 0, null, { timeout: 2500 })
  assert.equal(await page.locator('.c7-wave-cursor__ripple').evaluate(element => Number(getComputedStyle(element).opacity)), 0)
  assert.equal(await page.evaluate(() => window.__c7QaRippleStarts), 1)
  assert.equal(await page.locator('.c7-wave-cursor__ripple').count(), 1)
  await page.evaluate(() => window.__c7QaRippleObserver.disconnect())

  const scrollProbe = await page.evaluate(() => new Promise(resolve => {
    const root = document.querySelector('.c7-wave-cursor')
    const angles = []
    const observer = new MutationObserver(() => {
      const match = root.style.transform.match(/rotate\((-?\d*\.?\d+)deg\)/)
      if (match) angles.push(Number(match[1]))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['style'] })
    let count = 0
    const timer = setInterval(() => {
      scrollBy(0, 140)
      count += 1
      if (count === 24) {
        clearInterval(timer)
        setTimeout(() => { observer.disconnect(); resolve(angles) }, 550)
      }
    }, 4)
  }))
  const maximumTilt = Math.max(...scrollProbe.map(Math.abs))
  assert.ok(maximumTilt > 0.05 && maximumTilt <= 8, `Unexpected scroll tilt: ${maximumTilt}`)

  await page.locator('.c7-about-lead').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const textBox = await page.locator('.c7-about-lead').boundingBox()
  await page.mouse.move(textBox.x + 5, textBox.y + 12)
  await page.mouse.down()
  await page.mouse.move(textBox.x + Math.min(210, textBox.width - 8), textBox.y + 12, { steps: 10 })
  await page.mouse.up()
  const selection = await page.evaluate(() => getSelection().toString().trim())
  assert.ok(selection.length > 0, 'Text selection must remain available')

  await page.locator('.c7-menu-button').click()
  await page.locator('.c7-menu').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.c7-menu-button').getAttribute('aria-expanded'), 'true')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('c7-menu-button')), true)
  const focusOutline = await page.locator('.c7-menu-button').evaluate(element => getComputedStyle(element).outlineStyle)
  assert.notEqual(focusOutline, 'none')
  await page.locator('.c7-home').click()
  await page.waitForFunction(() => location.hash === '#hero' && document.activeElement?.id === 'hero')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.c7-wave-cursor')).display === 'none')
  await page.mouse.move(500, 300)
  await page.mouse.click(500, 300)
  assert.equal(await cursor.evaluate(element => getComputedStyle(element).opacity), '0')
  assert.equal(await page.locator('.c7-wave-cursor__ripple').evaluate(element => Number(getComputedStyle(element).opacity)), 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.c7-wave-cursor')).display === 'block')
  await page.mouse.move(505, 305)
  await page.waitForTimeout(100)
  await page.mouse.move(510, 310)
  await page.waitForFunction(() => document.querySelector('.c7-wave-cursor').style.opacity === '1', null, { timeout: 2000 })
  assert.equal(await cursor.evaluate(element => element.style.opacity), '1')
  assert.deepEqual(fineMonitor, { errors: [], badResponses: [] })
  results.runs.fine = {
    pointerFine: true,
    reducedMotion: false,
    latencyMs: latency.milliseconds,
    damping: damped,
    reactCommitsBefore: commitsBefore,
    reactCommitsAfter: commitsAfter,
    idleMutations,
    restingMetrics,
    interactiveMetrics,
    rippleVisible,
    rippleStarts: 1,
    maximumTilt,
    textSelection: selection,
    dynamicReducedMotion: 'disabled and re-enabled successfully',
    nativeInteractions: ['text selection', 'menu click', 'Escape focus return', 'fragment link focus'],
    ...fineMonitor,
  }
  console.log(`fine: latency ${latency.milliseconds.toFixed(1)} ms, React commits ${commitsBefore} → ${commitsAfter}, max tilt ${maximumTilt.toFixed(2)}° PASS`)
  await fineContext.close()

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const reducedPage = await reducedContext.newPage()
  const reducedMonitor = monitor(reducedPage)
  await openReady(reducedPage)
  assert.equal(await reducedPage.evaluate(() => matchMedia('(pointer: fine)').matches), true)
  assert.equal(await reducedPage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
  assert.equal(await reducedPage.locator('.c7-wave-cursor').evaluate(element => getComputedStyle(element).display), 'none')
  await reducedPage.mouse.move(400, 300)
  await reducedPage.mouse.click(400, 300)
  assert.equal(await reducedPage.locator('.c7-wave-cursor').evaluate(element => getComputedStyle(element).opacity), '0')
  assert.equal(await reducedPage.locator('.c7-wave-cursor__ripple').getAttribute('d'), null)
  assert.deepEqual(reducedMonitor, { errors: [], badResponses: [] })
  results.runs.reduced = { pointerFine: true, reducedMotion: true, display: 'none', ripple: 'none', ...reducedMonitor }
  console.log('reduced-motion: disabled PASS')
  await reducedContext.close()

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  })
  const touchPage = await touchContext.newPage()
  const touchMonitor = monitor(touchPage)
  await openReady(touchPage)
  const touchMedia = await touchPage.evaluate(() => ({ fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches }))
  assert.equal(touchMedia.fine, false)
  assert.equal(touchMedia.coarse, true)
  assert.equal(await touchPage.locator('.c7-wave-cursor').evaluate(element => getComputedStyle(element).display), 'none')
  await touchPage.touchscreen.tap(180, 300)
  assert.equal(await touchPage.locator('.c7-wave-cursor').evaluate(element => getComputedStyle(element).opacity), '0')
  await touchPage.locator('.c7-menu-button').tap()
  await touchPage.locator('.c7-menu').waitFor({ state: 'visible' })
  assert.deepEqual(touchMonitor, { errors: [], badResponses: [] })
  results.runs.touch = { ...touchMedia, display: 'none', nativeMenuTap: 'passed', ...touchMonitor }
  console.log('touch/coarse pointer: disabled, native tap preserved PASS')
  await touchContext.close()
} finally {
  await browser.close()
  await writeFile(output + '/results.json', JSON.stringify(results, null, 2))
}
