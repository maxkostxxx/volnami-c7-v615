#!/usr/bin/env node
// Browser 200% zoom is approximated by halving the CSS viewport at the same
// physical window size. This checks reflow; it is not a native zoom test.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/zoom-qa')
const sizes = [
  { name: 'desktop-1440-at-200', width: 720, height: 450, scale: 2 },
  { name: 'desktop-1280-at-200', width: 640, height: 400, scale: 2 },
  { name: 'wcag-reflow-320', width: 320, height: 568, scale: 1 },
  { name: 'phone-390-at-200', width: 195, height: 422, scale: 2 },
].filter(size => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))
const stages = [
  ['hero', '#hero'], ['process', '.c7-process'], ['services', '#services'],
  ['cases', '#cases'], ['testimonials', '#testimonials'], ['contacts', '#contacts'],
].filter(([name]) => !process.env.QA_STAGE || process.env.QA_STAGE.split(',').includes(name))

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
let failures = 0
try {
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto(`${base}/c7/`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 45_000 })
    await page.evaluate(() => document.fonts.ready)
    for (const [name, selector] of stages) {
      await page.evaluate((target) => {
        const element = document.querySelector(target)
        const top = element?.offsetTop ?? 0
        scrollTo({ top: Math.max(0, top - innerHeight * 0.15), behavior: 'instant' })
      }, selector)
      await page.waitForTimeout(150)
      await page.screenshot({ path: path.join(output, `${size.name}-${name}.png`) })
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        header: [...document.querySelectorAll('.c7-header :is(a,button)')]
          .filter(element => getComputedStyle(element).visibility !== 'hidden')
          .map(element => ({ text: element.textContent?.trim().slice(0, 24),
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right) })),
      }))
      if (metrics.overflow > 1 || errors.length) failures++
      console.log(`${size.name} ${name}: overflow=${metrics.overflow}px errors=${errors.length} header=${JSON.stringify(metrics.header)}`)
    }
    if (process.env.QA_MENU) {
      await page.locator('.c7-menu-button').click()
      await page.locator('.c7-menu[role="dialog"]').waitFor()
      await page.screenshot({ path: path.join(output, `${size.name}-menu.png`) })
      const menu = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        links: [...document.querySelectorAll('.c7-menu a')].map(element => ({
          text: element.textContent?.trim(),
          right: Math.round(element.getBoundingClientRect().right),
        })),
      }))
      await page.keyboard.press('Escape')
      const closed = await page.locator('.c7-menu').count() === 0
      console.log(`${size.name} menu: overflow=${menu.overflow}px closed=${closed} links=${JSON.stringify(menu.links)}`)
      if (menu.overflow > 1 || !closed || menu.links.some(link => link.right > size.width + 1)) failures++
    }
    console.log(`${size.name}: HTTP ${response?.status() ?? 'none'}`)
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(`screenshots: ${output}`)
if (failures) process.exitCode = 1
