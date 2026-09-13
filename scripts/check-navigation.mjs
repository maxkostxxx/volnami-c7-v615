#!/usr/bin/env node
import { chromium } from 'playwright'

const baseURL = (process.env.QA_BASE_URL ?? `http://127.0.0.1:${Number(process.env.QA_PORT ?? 3000)}`).replace(/\/+$/, '')
const routes = process.env.QA_ROUTES
  ? process.env.QA_ROUTES.split(',').map((route) => `${route.trim().replace(/\/+$/, '')}/`)
  : Array.from({ length: 6 }, (_, index) => `/c${index + 1}/`)
const hashes = ['#hero', '#about', '#services', '#cases', '#testimonials', '#contacts']
const allViewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]
const viewports = process.env.QA_VIEWPORT
  ? allViewports.filter((viewport) => viewport.name === process.env.QA_VIEWPORT)
  : allViewports
const findings = []

function fail(route, viewport, check, detail) {
  findings.push({ route, viewport, check, detail })
}

const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      const runtimeErrors = []
      page.on('pageerror', (error) => runtimeErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(message.text())
      })

      try {
        const response = await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 })
        if (!response || response.status() >= 400) {
          fail(route, viewport.name, 'route', `HTTP ${response?.status() ?? 'нет ответа'}`)
          continue
        }
        await page.evaluate(() => document.fonts.ready)

        const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
        if (scrollBehavior !== 'smooth') fail(route, viewport.name, 'smooth-css', `scroll-behavior=${scrollBehavior}`)

        const trigger = page.locator('button[aria-controls]').first()
        if (!(await trigger.count())) {
          fail(route, viewport.name, 'menu', 'не найдена кнопка с aria-controls')
          continue
        }
        const controlled = await trigger.getAttribute('aria-controls')
        if (!controlled) {
          fail(route, viewport.name, 'menu', 'у кнопки нет aria-controls')
          continue
        }

        await trigger.click()
        const initialPanel = page.locator(`#${controlled}`)
        await initialPanel.waitFor({ state: 'visible', timeout: 5_000 })
        const menuHashes = await initialPanel.locator('a[href]').evaluateAll((links) =>
          [...new Set(links.map((link) => new URL(link.href, location.href).hash).filter(Boolean))]
        )
        if (menuHashes.length !== hashes.length || hashes.some((hash) => !menuHashes.includes(hash))) {
          fail(route, viewport.name, 'menu-links', JSON.stringify(menuHashes))
        }
        await page.keyboard.press('Escape')

        for (const hash of hashes) {
          await trigger.click()
          const panel = page.locator(`#${controlled}`)
          await panel.waitFor({ state: 'visible', timeout: 5_000 })
          const link = panel.locator(`a[href$="${hash}"]`).first()
          if (!(await link.count())) {
            fail(route, viewport.name, hash, 'ссылка отсутствует')
            await page.keyboard.press('Escape')
            continue
          }

          const startY = await page.evaluate(() => window.scrollY)
          await page.evaluate(() => {
            if (window.__navigationListener) removeEventListener('scroll', window.__navigationListener)
            window.__navigationSamples = [window.scrollY]
            window.__navigationListener = () => {
              window.__navigationSamples.push(window.scrollY)
            }
            addEventListener('scroll', window.__navigationListener, { passive: true })
          })

          await link.click()
          await page.waitForFunction((expectedHash) => location.hash === expectedHash, hash, { timeout: 5_000 })
          await page.waitForFunction((targetId) => {
            const target = document.getElementById(targetId)
            if (!target) return false
            const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0
            const absoluteTop = target.getBoundingClientRect().top + window.scrollY
            const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
            const expected = Math.min(Math.max(absoluteTop - margin, 0), maximum)
            return Math.abs(window.scrollY - expected) <= 12
          }, hash.slice(1), { timeout: 10_000, polling: 25 })
          await page.waitForFunction((targetId) => document.activeElement?.id === targetId, hash.slice(1), { timeout: 2_000 })

          const state = await page.evaluate((targetId) => {
            const target = document.getElementById(targetId)
            if (window.__navigationListener) removeEventListener('scroll', window.__navigationListener)
            return {
              activeId: document.activeElement?.id ?? '',
              exists: Boolean(target),
              hash: location.hash,
              scrollY: window.scrollY,
              targetTop: target?.getBoundingClientRect().top ?? null,
              atPageEnd: Math.abs(window.scrollY - Math.max(0, document.documentElement.scrollHeight - window.innerHeight)) <= 8,
              samples: [...new Set((window.__navigationSamples ?? []).map((value) => Math.round(value)))],
            }
          }, hash.slice(1))

          if (!state.exists) fail(route, viewport.name, hash, 'целевая секция отсутствует')
          if (state.hash !== hash) fail(route, viewport.name, hash, `получен hash ${state.hash}`)
          if (state.activeId !== hash.slice(1)) fail(route, viewport.name, hash, `фокус на ${state.activeId || 'body'}`)

          const expanded = await trigger.getAttribute('aria-expanded')
          const panelVisible = await page.locator(`#${controlled}`).isVisible().catch(() => false)
          if (expanded !== 'false' || panelVisible) {
            fail(route, viewport.name, hash, `меню не закрыто: expanded=${expanded}, visible=${panelVisible}`)
          }

          if (Math.abs(state.scrollY - startY) > 60 && state.samples.length < 3) {
            fail(route, viewport.name, hash, `нет видимой траектории: ${JSON.stringify(state.samples)}`)
          }
        }

        for (const detail of runtimeErrors) fail(route, viewport.name, 'runtime', detail)
      } catch (error) {
        fail(route, viewport.name, 'crash', error.stack || error.message)
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
      await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 })
      const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
      if (behavior !== 'auto') fail(route, 'mobile-reduced', 'reduced-motion', `scroll-behavior=${behavior}`)
    } catch (error) {
      fail(route, 'mobile-reduced', 'crash', error.stack || error.message)
    } finally {
      await context.close()
    }
  }

  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    const response = await page.goto('/', { waitUntil: 'networkidle', timeout: 120_000 })
    if (!response || response.status() >= 400) fail('/', 'desktop', 'route', `HTTP ${response?.status() ?? 'нет ответа'}`)
    const launcher = await page.evaluate(() => ({
      main: [...document.querySelectorAll('.index-links a')].filter((link) => /^\/c[1-6]\/?$/.test(new URL(link.href).pathname)).length,
      cases: [...document.querySelectorAll('.index-links a')].filter((link) => /^\/c[1-6]\/case\/?$/.test(new URL(link.href).pathname)).length,
      newTabs: [...document.querySelectorAll('.index-links a')].filter((link) => link.target === '_blank').length,
      title: document.title,
    }))
    if (launcher.main !== 6 || launcher.cases !== 6 || launcher.newTabs !== 12) fail('/', 'desktop', 'launcher', JSON.stringify(launcher))
    if (!launcher.title.includes('Шесть концептов')) fail('/', 'desktop', 'title', launcher.title)
  } catch (error) {
    fail('/', 'desktop', 'crash', error.stack || error.message)
  } finally {
    await context.close()
  }
} finally {
  await browser.close()
}

for (const item of findings) {
  console.log(`FAIL ${item.route} ${item.viewport} [${item.check}] ${item.detail}`)
}
console.log(`navigation: ${findings.length} failures; ${routes.length * viewports.length * hashes.length} menu destinations checked`)
process.exitCode = findings.length ? 1 : 0
