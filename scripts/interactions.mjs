#!/usr/bin/env node
import { chromium } from 'playwright'

const baseURL = process.env.QA_BASE_URL ?? `http://127.0.0.1:${Number(process.env.QA_PORT ?? 3000)}`
const routes = process.env.QA_ROUTES ? process.env.QA_ROUTES.split(',').map(r=>r.replace(/\/+$/,'')+'/') : Array.from({ length: 7 }, (_, index) => `/c${index + 1}/`)
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]
const findings = []
const testimonialSelector = {
  '/c1/': '.c1-strip',
  '/c2/': '.c2-strip',
  '/c3/': '.c3-quotes',
  '/c4/': '.c4-quotes',
  '/c5/': '.c5-quotes',
  '/c6/': '.c6-quotes',
  '/c7/': '.c7-quotes',
}

function record(level, route, viewport, check, detail) {
  findings.push({ level, route, viewport, check, detail })
}

const browser = await chromium.launch({ headless: true, args: process.env.QA_GPU==='metal'?['--use-angle=metal']:[] })
try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      })
      await context.addInitScript(() => {
        window.__layoutShifts = []
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value)
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      const page = await context.newPage()
      const runtimeErrors = []
      page.on('pageerror', (error) => runtimeErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(message.text())
      })

      try {
        const response = await page.goto(route === '/c7/' ? route+'?c7-debug' : route, { waitUntil: 'networkidle', timeout: 120_000 })
        if (!response || response.status() >= 400) {
          record('error', route, viewport.name, 'route', `HTTP ${response?.status() ?? 'нет ответа'}`)
          continue
        }
        await page.evaluate(() => document.fonts.ready)

        const trigger = page.locator('button[aria-controls]').first()
        if (await trigger.count()) {
          await trigger.click()
          const expanded = await trigger.getAttribute('aria-expanded')
          const controlled = await trigger.getAttribute('aria-controls')
          const panelVisible = controlled ? await page.locator(`#${controlled}`).isVisible().catch(() => false) : false
          if (expanded !== 'true' || !panelVisible) {
            record('error', route, viewport.name, 'menu-open', `expanded=${expanded}, panelVisible=${panelVisible}`)
          }
          await page.keyboard.press('Escape')
          const closed = await trigger.getAttribute('aria-expanded')
          if (closed !== 'false') record('error', route, viewport.name, 'menu-close', `aria-expanded=${closed}`)
        } else {
          record('error', route, viewport.name, 'menu', 'не найдена кнопка с aria-controls')
        }

        const skip = page.locator('a[class*="-skip"]').first()
        if (!(await skip.count())) {
          record('error', route, viewport.name, 'skip-link', 'ссылка пропуска навигации не найдена')
        } else {
          const href = await skip.getAttribute('href')
          const targetIsMain = href?.startsWith('#')
            ? await page.locator(`${href}`).evaluate((element) => element.tagName === 'MAIN').catch(() => false)
            : false
          if (!targetIsMain) record('error', route, viewport.name, 'skip-link', `не ведёт к main: ${href}`)
        }

        const headerTarget = route.replace(/\/$/, '') === '/c7' ? '#brief' : '#contacts'
        const headerCta = page.locator(`header a[href$="${headerTarget}"]`).first()
        if (await headerCta.count()) {
          await headerCta.click()
          await page.waitForTimeout(80)
          const contactState = await page.evaluate(() => ({
            hash: location.hash,
            active: document.activeElement?.id,
          }))
          if (contactState.hash !== headerTarget || contactState.active !== headerTarget.slice(1)) {
            record('error', route, viewport.name, 'header-cta', JSON.stringify(contactState))
          }
        } else {
          record('error', route, viewport.name, 'header-cta', `ссылка на ${headerTarget} не найдена`)
        }

        const contactCta = page.locator('#contacts a[href^="mailto:"]').first()
        const contactHref = await contactCta.getAttribute('href').catch(() => null)
        if (!contactHref?.startsWith('mailto:')) {
          record('error', route, viewport.name, 'contact-cta', `href=${contactHref}`)
        }

        const strip = page.locator(testimonialSelector[route]).first()
        if (!(await strip.count())) {
          record('error', route, viewport.name, 'testimonials', 'листемая область не найдена')
        } else {
          const before = await strip.evaluate((element) => element.scrollLeft)
          await strip.focus()
          await page.keyboard.press('ArrowRight')
          await page.waitForTimeout(420)
          const after = await strip.evaluate((element) => element.scrollLeft)
          if (after <= before) record('error', route, viewport.name, 'testimonials-keyboard', `${before} → ${after}`)
          const ctrlWheelAllowed = await strip.evaluate((element) => {
            const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 120 })
            return element.dispatchEvent(event)
          })
          if (!ctrlWheelAllowed) record('error', route, viewport.name, 'testimonials-zoom', 'Ctrl+wheel был перехвачен')
        }

        if (route === '/c4/') {
          await page.locator('.c4-stage.is-ready canvas').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
          const dimensions = await page.locator('.c4-stage canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height })).catch(() => ({ width: 0, height: 0 }))
          if (!dimensions.width || !dimensions.height) record('error', route, viewport.name, 'webgl', JSON.stringify(dimensions))
        }

        if (route === '/c7/') {
          await page.locator('.c7-landscape.is-ready canvas').waitFor({ state: 'visible', timeout: 25_000 })
          const ready = await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug??'{}'))
          if(ready.version!=='v613-deferred-image-readiness'||!(ready.frames>0)||!(ready.calls>0)||!(ready.triangles>0))record('error',route,viewport.name,'world-state',JSON.stringify(ready))
          const dimensions = await page.locator('.c7-landscape canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height })).catch(() => ({ width: 0, height: 0 }))
          if (!dimensions.width || !dimensions.height) record('error', route, viewport.name, 'webgl', JSON.stringify(dimensions))
        }

        if (route === '/c5/') {
          const buttons = page.locator('#hero button[aria-pressed]')
          if (await buttons.count() > 1) {
            const before = await page.locator('#hero figure img').getAttribute('src')
            await buttons.last().click()
            const after = await page.locator('#hero figure img').getAttribute('src')
            if (before === after) record('error', route, viewport.name, 'case-selector', 'изображение не изменилось')
          }
        }

        if (route === '/c6/' && viewport.name === 'desktop') {
          await page.locator('#hero').hover({ position: { x: 180, y: 220 } })
          const active = await page.locator('#hero').getAttribute('data-spotlight')
          if (active !== 'active') record('error', route, viewport.name, 'spotlight', `data-spotlight=${active}`)
        }

        const badLinks = await page.evaluate(async () => {
          const urls = [...new Set([...document.querySelectorAll('a[href]')]
            .map((link) => link.href)
            .filter((href) => href.startsWith(location.origin))
            .map((href) => href.split('#')[0]))]
          const results = await Promise.all(urls.map(async (url) => {
            try {
              const response = await fetch(url, { method: 'HEAD' })
              return response.ok ? null : `${url} → ${response.status}`
            } catch (error) {
              return `${url} → ${String(error)}`
            }
          }))
          return results.filter(Boolean)
        })
        for (const link of badLinks) record('error', route, viewport.name, 'internal-link', link)

        const unnamed = await page.locator('button').evaluateAll((buttons) => buttons.filter((button) => {
          const name = button.getAttribute('aria-label') || button.textContent?.trim()
          return !name
        }).length)
        if (unnamed) record('error', route, viewport.name, 'button-name', `${unnamed} кнопок без имени`)

        const cls = await page.evaluate(() => (window.__layoutShifts ?? []).reduce((sum, value) => sum + value, 0))
        if (cls > 0.15) record('error', route, viewport.name, 'layout-shift', `CLS=${cls.toFixed(4)}`)
        else if (cls > 0.08) record('warn', route, viewport.name, 'layout-shift', `CLS=${cls.toFixed(4)}`)

        for (const detail of runtimeErrors) record('error', route, viewport.name, 'runtime', detail)
      } catch (error) {
        record('error', route, viewport.name, 'crash', error.stack || error.message)
      } finally {
        await context.close()
      }
    }
  }

  for (const route of routes) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    try {
      await page.goto(route === '/c7/' ? route+'?c7-debug' : route, { waitUntil: 'networkidle', timeout: 120_000 })
      const matches = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
      if (!matches) record('error', route, 'mobile-reduced', 'reduced-motion', 'media query не активен')
      const infinite = await page.evaluate(() => document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming()
        return timing?.iterations === Infinity && animation.playState === 'running'
      }).length)
      if (infinite) record('error', route, 'mobile-reduced', 'reduced-motion', `${infinite} бесконечных DOM-анимаций продолжают играть`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

for (const item of findings) {
  console.log(`${item.level === 'error' ? 'FAIL' : 'WARN'} ${item.route} ${item.viewport} [${item.check}] ${item.detail}`)
}
const errors = findings.filter((item) => item.level === 'error')
const warnings = findings.filter((item) => item.level === 'warn')
console.log(`interactions: ${errors.length} failures, ${warnings.length} warnings`)
process.exitCode = errors.length ? 1 : 0
