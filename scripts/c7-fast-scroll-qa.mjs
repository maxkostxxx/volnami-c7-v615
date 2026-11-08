#!/usr/bin/env node
import { chromium } from 'playwright'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const sizes = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]
const stages = ['.c7-process', '#testimonials', '#contacts']

const browser = await chromium.launch({ headless: true })
let failures = 0
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 15_000 })
    for (const stage of stages) {
      const target = await page.evaluate((selector) => {
        const element = document.querySelector(selector)
        return element.offsetTop + element.offsetHeight * 0.5 - innerHeight * 0.5
      }, stage)
      const sample = async () => page.evaluate(() => {
        const debug = JSON.parse(document.querySelector('.c7-landscape')?.dataset.c7Debug ?? '{}')
        return { y: scrollY, expected: debug.exactProgress,
          progress: debug.smoothProgress, opacity: debug.photo?.opacity }
      })
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), target)
      await page.waitForTimeout(1500)
      const forward = await sample()
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await page.waitForTimeout(100)
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), target)
      await page.waitForTimeout(1500)
      const reverse = await sample()
      const passed = Math.abs(forward.y - reverse.y) <= 1
        && Math.abs(forward.progress - forward.expected) < 0.002
        && Math.abs(reverse.progress - reverse.expected) < 0.002
        && Math.abs(forward.progress - reverse.progress) < 0.002
        && forward.opacity < 0.01 && reverse.opacity < 0.01
      if (!passed) failures++
      console.log(`${size.name} ${stage}: ${passed ? 'pass' : 'FAIL'}; scroll ${forward.y}/${reverse.y}, scene ${forward.progress?.toFixed(4)}/${reverse.progress?.toFixed(4)}, target ${forward.expected.toFixed(4)}`)
    }
    if (errors.length) failures++
    for (const error of errors) console.log(`  console: ${error}`)
    await context.close()
  }
} finally {
  await browser.close()
}
if (failures) process.exitCode = 1
