#!/usr/bin/env node
// Targeted glyph/background sampling for the white reviews title over moving sky.
import { chromium } from 'playwright'
import sharp from 'sharp'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const sizes = [
  { name: 'short-phone', width: 320, height: 490 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 2560, height: 1080 },
]
const lin = value => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const pixels = async page => sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })

const browser = await chromium.launch({ headless: true })
let failed = false
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)
    for (const phase of [0.8, 0.82, 0.83]) {
      const title = await page.evaluate(p => {
        const casesY = document.getElementById('cases').offsetTop
        const reviewsY = document.getElementById('testimonials').offsetTop
        scrollTo({ top: casesY + (reviewsY - casesY) * (p - 0.66) / 0.17, behavior: 'instant' })
        const node = document.querySelector('.c7-testimonials h2')
        const rect = node.getBoundingClientRect()
        return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          color: getComputedStyle(node).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) }
      }, phase)
      await page.waitForTimeout(400)
      if (size.name === 'short-phone' && phase === 0.83 && process.env.QA_CAPTURE) {
        await page.screenshot({ path: process.env.QA_CAPTURE, type: 'jpeg', quality: 88 })
      }
      const shown = await pixels(page)
      const style = await page.addStyleTag({ content: '.c7-testimonials h2{color:transparent!important;text-shadow:none!important}' })
      const hidden = await pixels(page)
      await style.evaluate(node => node.remove())
      const ratios = []
      for (let y = Math.max(0, Math.floor(title.rect.y)); y < Math.min(size.height, Math.ceil(title.rect.y + title.rect.height)); y++) {
        for (let x = Math.max(0, Math.floor(title.rect.x)); x < Math.min(size.width, Math.ceil(title.rect.x + title.rect.width)); x++) {
          const i = (y * size.width + x) * 3
          if (Math.max(...[0, 1, 2].map(c => Math.abs(shown.data[i + c] - hidden.data[i + c]))) < 65) continue
          ratios.push(ratio(lum(title.color), lum([hidden.data[i], hidden.data[i + 1], hidden.data[i + 2]])))
        }
      }
      ratios.sort((a, b) => a - b)
      const p5 = ratios[Math.floor(ratios.length * 0.05)] ?? 0
      console.log(`${size.name} p${Math.round(phase * 100)}: h2 p5=${p5.toFixed(2)}:1, pixels=${ratios.length}, target>=3:1`)
      if (p5 < 3) failed = true
    }
    await context.close()
  }
} finally {
  await browser.close()
}
if (failed) process.exitCode = 1
