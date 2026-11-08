#!/usr/bin/env node
import { chromium } from 'playwright'
import sharp from 'sharp'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const views = [
  // P's mobile pitch and O2's terrain moved the visible water down. Sample
  // wholly inside the current raw process lake; do not dilute it with grass.
  { name: 'phone-390', width: 390, height: 844, clip: { x: 25, y: 550, width: 130, height: 60 } },
  { name: 'desktop-1440', width: 1440, height: 900, clip: { x: 360, y: 600, width: 300, height: 80 } },
]

const browser = await chromium.launch({ headless: true })
let failures = 0
try {
  for (const view of views) {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: 1,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`${base}/c7/`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 45_000 })
    await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; }' })
    await page.evaluate(() => {
      const section = document.querySelector('.c7-process')
      scrollTo({ top: section.offsetTop + section.offsetHeight * 0.5 - innerHeight * 0.5, behavior: 'instant' })
    })
    await page.waitForTimeout(1500)
    const before = await page.screenshot({ clip: view.clip })
    await page.waitForTimeout(2000)
    const after = await page.screenshot({ clip: view.clip })
    const first = await sharp(before).removeAlpha().raw().toBuffer()
    const second = await sharp(after).removeAlpha().raw().toBuffer()
    let totalDifference = 0
    let visiblyChanged = 0
    const pixels = first.length / 3
    for (let index = 0; index < first.length; index += 3) {
      const difference = (
        Math.abs(first[index] - second[index])
        + Math.abs(first[index + 1] - second[index + 1])
        + Math.abs(first[index + 2] - second[index + 2])
      ) / 3
      totalDifference += difference
      if (difference > 2) visiblyChanged++
    }
    const mean = totalDifference / pixels
    const changed = visiblyChanged / pixels
    console.log(`${view.name}: mean ${mean.toFixed(2)}/255, changed ${(changed * 100).toFixed(1)}% of water crop, console errors ${errors.length}`)
    // This only catches a frozen surface; naturalism still needs visual review.
    if (errors.length || changed < 0.01) failures++
    await page.close()
  }
} finally {
  await browser.close()
}
if (failures) process.exitCode = 1
