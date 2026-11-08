#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/2026-10-23-exec-r2')
const label = process.env.QA_LABEL ?? 'current'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const size of [
    { name: '390', width: 390, height: 844, videoWidth: 390, videoHeight: 844 },
    { name: '1440', width: 1440, height: 900, videoWidth: 960, videoHeight: 600 },
  ].filter((size) => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      recordVideo: { dir: output, size: { width: size.videoWidth, height: size.videoHeight } },
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/c7/`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 20_000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(700)
    const target = await page.evaluate(() => document.getElementById('process').offsetTop + innerHeight * 0.35)
    for (let i = 0; i <= 80; i++) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), target * i / 80)
      await page.waitForTimeout(42)
    }
    for (let i = 80; i >= 0; i--) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), target * i / 80)
      await page.waitForTimeout(42)
    }
    await page.waitForTimeout(200)
    const source = await page.video().path()
    await page.close()
    await context.close()
    const targetPath = path.join(output, `t20-slow-down-up-${size.name}-${label}.webm`)
    await rename(source, targetPath)
    console.log(`${size.name}: ${targetPath}, pageerrors ${errors.length}`)
    if (errors.length) process.exitCode = 1
  }
} finally {
  await browser.close()
}
