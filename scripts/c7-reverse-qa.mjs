#!/usr/bin/env node
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const sizes = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]
const stages = ['.c7-process', '#testimonials', '#contacts']
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12)

const browser = await chromium.launch({ headless: true })
let failures = 0
try {
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`${base}/c7/`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    for (const stage of stages) {
      const target = await page.evaluate((selector) => {
        const element = document.querySelector(selector)
        return element.offsetTop + element.offsetHeight * 0.5 - innerHeight * 0.5
      }, stage)
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), target)
      await page.waitForTimeout(250)
      const before = { y: await page.evaluate(() => scrollY), image: await page.screenshot() }
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await page.waitForTimeout(250)
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), target)
      await page.waitForTimeout(250)
      const after = { y: await page.evaluate(() => scrollY), image: await page.screenshot() }
      const passed = Math.abs(before.y - after.y) <= 1 && before.image.equals(after.image)
      if (!passed) failures++
      console.log(`${size.name} ${stage}: ${passed ? 'pass' : 'FAIL'}; scroll ${before.y}/${after.y}, frame ${digest(before.image)}/${digest(after.image)}`)
    }
    if (errors.length) failures++
    for (const error of errors) console.log(`  console: ${error}`)
    await context.close()
  }
} finally {
  await browser.close()
}
if (failures) process.exitCode = 1
