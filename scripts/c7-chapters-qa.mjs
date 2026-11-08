#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/2026-10-23-exec-r2')
const label = process.env.QA_LABEL ?? 'current'
const defaultStages = [
  { name: 'dawn', id: 'hero' },
  { name: 'rise', id: 'about' },
  { name: 'day', id: 'process' },
  { name: 'departure', id: 'services' },
  { name: 'hills', id: 'cases' },
  { name: 'dusk', id: 'testimonials' },
  { name: 'contacts', id: 'contacts' },
  { name: 'finish', end: true },
]
const stages = process.env.QA_PROGRESS
  ? process.env.QA_PROGRESS.split(',').map((value) => ({ name: `p${Math.round(Number(value) * 100)}`, progress: Number(value) }))
  : defaultStages.filter((stage) => !process.env.QA_STAGE || process.env.QA_STAGE.split(',').includes(stage.name))
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
    await page.goto(`${base}/c7/?c7-debug${process.env.QA_RAW ? '&c7-poster' : ''}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 20_000 })
    await page.evaluate(() => document.fonts.ready)
    if (process.env.QA_RAW) {
      await page.evaluate(() => document.documentElement.classList.remove('c7-poster-capture'))
      await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; } .c7-landscape-fallback, .c7-landscape::after { display: none !important; }' })
    }
    for (const stage of stages) {
      await page.evaluate(({ id, end, progress }) => {
        let top
        if (Number.isFinite(progress)) {
          const anchors = [
            ['hero', 0], ['about', 0.16], ['process', 0.3], ['services', 0.47],
            ['cases', 0.66], ['testimonials', 0.83], ['contacts', 0.93],
          ]
          const max = document.documentElement.scrollHeight - innerHeight
          top = max
          for (let i = 0; i < anchors.length; i++) {
            const [aId, aProgress] = anchors[i]
            const next = anchors[i + 1]
            if (!next) {
              top = document.getElementById(aId).offsetTop
                + (max - document.getElementById(aId).offsetTop) * ((progress - aProgress) / (1 - aProgress))
              break
            }
            if (progress <= next[1]) {
              const a = document.getElementById(aId).offsetTop
              const b = document.getElementById(next[0]).offsetTop
              top = a + (b - a) * ((progress - aProgress) / (next[1] - aProgress))
              break
            }
          }
        } else top = end ? document.documentElement.scrollHeight - innerHeight : document.getElementById(id).offsetTop
        scrollTo({ top, behavior: 'instant' })
      }, stage)
      await page.waitForTimeout(350)
      const debug = await page.locator('.c7-landscape').evaluate((element) => JSON.parse(element.dataset.c7Debug ?? '{}'))
      const file = path.join(output, `t05-${label}-${size.name}-${stage.name}.jpg`)
      await page.screenshot({ path: file, type: 'jpeg', quality: 76 })
      console.log(`${size.name} ${stage.name}: exact ${debug.exactProgress?.toFixed(3)}, smooth ${debug.smoothProgress?.toFixed(3)}, ${file}`)
    }
    console.log(`${size.name}: ${errors.length} pageerrors`)
    await context.close()
  }
} finally {
  await browser.close()
}
