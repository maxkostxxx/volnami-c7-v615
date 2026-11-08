#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/2026-10-23-exec-r2')
const label = process.env.QA_LABEL ?? 'candidate'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const size of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'wide', width: 2560, height: 1080 },
  ].filter((size) => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/c7/?c7-poster&c7-debug`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 20_000 })
    await page.evaluate(() => document.documentElement.classList.remove('c7-poster-capture'))
    await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; } .c7-landscape-fallback { display: none !important; } .c7-landscape::after { display: none !important; }' })
    for (const [stage, scroll] of [['raw-hero', false], ['raw-process', true]]) {
      await page.evaluate((atProcess) => scrollTo({ top: atProcess ? document.getElementById('process').offsetTop : 0, behavior: 'instant' }), scroll)
      await page.waitForTimeout(500)
      const debug = await page.locator('.c7-landscape').evaluate((element) => JSON.parse(element.dataset.c7Debug ?? '{}'))
      const file = path.join(output, `t07-${label}-${size.name}-${stage}.jpg`)
      await page.screenshot({ path: file, type: 'jpeg', quality: 78 })
      console.log(`${size.name} ${stage}: exact ${debug.exactProgress?.toFixed(3)} smooth ${debug.smoothProgress?.toFixed(3)} photo ${debug.photo?.opacity?.toFixed(2)}; ${file}`)
    }
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 20_000 })
    await page.evaluate(() => scrollTo({ top: document.getElementById('process').offsetTop, behavior: 'instant' }))
    await page.waitForTimeout(500)
    const debug = await page.locator('.c7-landscape').evaluate((element) => JSON.parse(element.dataset.c7Debug ?? '{}'))
    const file = path.join(output, `t07-${label}-${size.name}-dom-process.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 78 })
    console.log(`${size.name} dom-process: exact ${debug.exactProgress?.toFixed(3)} smooth ${debug.smoothProgress?.toFixed(3)}; ${file}; ${errors.length} errors`)
    await context.close()
  }
} finally {
  await browser.close()
}
