#!/usr/bin/env node
// Glyph-level contrast against the actual canvas and retained pseudo-element
// backgrounds. This is a targeted supplement to axe, not a WCAG certificate.
import { chromium } from 'playwright'
import sharp from 'sharp'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const sizes = [
  { name: 'phone-320', width: 320, height: 700 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'wide-2560', width: 2560, height: 1080 },
].filter((size) => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))

const linear = (channel) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const raw = async (buffer) => sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })

const browser = await chromium.launch({ headless: true })
let failed = false
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
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 45_000 })
    await page.evaluate(() => document.fonts.ready)
    for (const fraction of [0, 0.25, 0.5]) {
      const stage = await page.evaluate((part) => {
        const section = document.querySelector('.c7-process')
        scrollTo({ top: section.offsetTop + section.offsetHeight * part, behavior: 'instant' })
        return { top: section.offsetTop, height: section.offsetHeight }
      }, fraction)
      await page.waitForTimeout(450)
      const elements = await page.locator('.c7-process h2, .c7-process h3, .c7-process li p').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          const color = getComputedStyle(node).color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
          return { tag: node.tagName.toLowerCase(), text: node.textContent.trim().slice(0, 32),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, color }
        }).filter((item) => item.rect.y < innerHeight && item.rect.y + item.rect.height > 0))
      const shown = await raw(await page.screenshot())
      const hiddenStyle = await page.addStyleTag({ content:
        '.c7-process h2,.c7-process h3,.c7-process li p{color:transparent!important;text-shadow:none!important}' })
      const hidden = await raw(await page.screenshot())
      await hiddenStyle.evaluate((node) => node.remove())
      const readings = []
      for (const element of elements) {
        if (!element.color) continue
        const ratios = []
        const x0 = Math.max(0, Math.floor(element.rect.x))
        const x1 = Math.min(size.width, Math.ceil(element.rect.x + element.rect.width))
        const y0 = Math.max(0, Math.floor(element.rect.y))
        const y1 = Math.min(size.height, Math.ceil(element.rect.y + element.rect.height))
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * size.width + x) * 3
            const diff = Math.max(...[0, 1, 2].map((channel) =>
              Math.abs(shown.data[i + channel] - hidden.data[i + channel])))
            if (diff < 65) continue // only substantial glyph coverage, not antialias fringes/ambient drift
            ratios.push(contrast(luminance(element.color),
              luminance([hidden.data[i], hidden.data[i + 1], hidden.data[i + 2]])))
          }
        }
        if (!ratios.length) continue
        ratios.sort((a, b) => a - b)
        const p5 = ratios[Math.floor(ratios.length * 0.05)]
        const target = element.tag === 'p' ? 4.5 : 3
        readings.push({ tag: element.tag, text: element.text, p5: Number(p5.toFixed(2)),
          pixels: ratios.length, target, pass: p5 >= target })
        if (p5 < target) failed = true
      }
      console.log(JSON.stringify({ size: size.name, fraction, stage, readings, errors }))
      if (errors.length) failed = true
    }
    await context.close()
  }
} finally {
  await browser.close()
}
if (failed) process.exitCode = 1
