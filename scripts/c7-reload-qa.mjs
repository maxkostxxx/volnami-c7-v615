#!/usr/bin/env node
import { chromium } from 'playwright'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const sizes = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const browser = await chromium.launch({ headless: true })
let failures = 0
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 })
    await context.addInitScript(() => {
      window.__c7ScrollSamples = []
      addEventListener('DOMContentLoaded', () => {
        const started = performance.now()
        const sample = () => {
          window.__c7ScrollSamples.push({ y: scrollY, t: performance.now() - started })
          if (performance.now() - started < 1700) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      }, { once: true })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    for (const destination of ['#brief', '#cases']) {
      await page.goto(`${base}/c7/${destination}`, { waitUntil: 'domcontentloaded' })
      await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(1800)
      const first = await page.evaluate(() => scrollY)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 15_000 })
      await page.waitForTimeout(1800)
      const state = await page.evaluate(() => {
        const samples = window.__c7ScrollSamples ?? []
        const positions = samples.map(({ y }) => y)
        const gaps = samples.slice(1).map(({ t }, index) => t - samples[index].t)
        return {
          last: scrollY,
          range: Math.max(...positions) - Math.min(...positions),
          samples: samples.length,
          firstFrameMs: Math.round(samples[0]?.t ?? 0),
          maxGapMs: Math.round(Math.max(0, ...gaps)),
          spanMs: Math.round((samples.at(-1)?.t ?? 0) - (samples[0]?.t ?? 0)),
        }
      })
      const passed = Math.abs(state.last - first) <= 2 && state.range <= 3 && state.samples > 10
      if (!passed) failures++
      console.log(`${size.name} ${destination}: ${passed ? 'pass' : 'FAIL'}; before ${first}px, after ${state.last}px, visible range ${state.range}px (${state.samples} samples; first ${state.firstFrameMs}ms, span ${state.spanMs}ms, max gap ${state.maxGapMs}ms)`)
    }
    if (errors.length) failures++
    for (const error of errors) console.log(`  console: ${error}`)
    await context.close()
  }
} finally {
  await browser.close()
}
if (failures) process.exitCode = 1
