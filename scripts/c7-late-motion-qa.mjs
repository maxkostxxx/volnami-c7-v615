#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/late-motion')
const label = process.env.QA_LABEL ?? 'current'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const size of [
    { name: '390', width: 390, height: 844, videoWidth: 390, videoHeight: 844 },
    { name: '1440', width: 1440, height: 900, videoWidth: 960, videoHeight: 600 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      recordVideo: { dir: output, size: { width: size.videoWidth, height: size.videoHeight } },
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)
    const scrollToPhase = async p => {
      await page.evaluate(phase => {
        const casesY = document.getElementById('cases')?.offsetTop ?? 0
        const reviewsY = document.getElementById('testimonials')?.offsetTop ?? 0
        const contactsY = document.getElementById('contacts')?.offsetTop ?? 0
        const top = phase <= 0.83
          ? casesY + (reviewsY - casesY) * (phase - 0.66) / 0.17
          : reviewsY + (contactsY - reviewsY) * (phase - 0.83) / 0.1
        scrollTo({ top, behavior: 'instant' })
      }, p)
    }
    await scrollToPhase(0.76)
    await page.waitForTimeout(800)
    for (let i = 0; i <= 80; i++) {
      await scrollToPhase(0.76 + 0.10 * i / 80)
      await page.waitForTimeout(46)
    }
    for (let i = 80; i >= 0; i--) {
      await scrollToPhase(0.76 + 0.10 * i / 80)
      await page.waitForTimeout(46)
    }
    await page.waitForTimeout(300)
    const debug = await page.locator('.c7-landscape').evaluate(element => JSON.parse(element.dataset.c7Debug ?? '{}'))
    const source = await page.video().path()
    await page.close()
    await context.close()
    const target = path.join(output, `t20-late-down-up-${size.name}-${label}.webm`)
    await rename(source, target)
    console.log(`${size.name}: ${target}, final exact=${debug.exactProgress?.toFixed(3)} smooth=${debug.smoothProgress?.toFixed(3)}, errors=${errors.length}`)
    if (errors.length) process.exitCode = 1
  }
} finally {
  await browser.close()
}
