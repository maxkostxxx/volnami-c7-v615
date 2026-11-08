#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/2026-10-23-exec-r2')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const { name, width, height } of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 20_000 })
    for (const progress of [0.5, 0.55, 0.6]) {
      await page.evaluate((target) => {
        const a = document.getElementById('services').offsetTop
        const b = document.getElementById('cases').offsetTop
        scrollTo({ top: a + (b - a) * ((target - 0.47) / (0.66 - 0.47)), behavior: 'instant' })
      }, progress)
      await page.waitForTimeout(350)
      const debug = await page.locator('.c7-landscape').evaluate((element) => JSON.parse(element.dataset.c7Debug ?? '{}'))
      const file = path.join(output, `t13-reflection-gate-${name}-p${Math.round(progress * 100)}.jpg`)
      await page.screenshot({ path: file, type: 'jpeg', quality: 74 })
      console.log(`${name} p${progress}: exact ${debug.exactProgress?.toFixed(3)} smooth ${debug.smoothProgress?.toFixed(3)}; ${file}`)
    }
    console.log(`${name}: ${errors.length} pageerrors`)
    await context.close()
  }
} finally {
  await browser.close()
}
