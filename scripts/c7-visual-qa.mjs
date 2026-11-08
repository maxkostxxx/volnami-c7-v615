#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/stages')
const sizes = [
  { name: 'phone-320', width: 320, height: 700 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'wide-2560-short', width: 2560, height: 1080 },
  { name: 'wide-2560', width: 2560, height: 1440 },
].filter((size) => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))
const positions = [
  ['start', { fraction: 0 }],
  ['early-rise', { fraction: 0.045 }],
  ['pre-about', { section: '#about', sectionPosition: 0 }],
  ['about-exit', { section: '#about', sectionPosition: 0.92 }],
  ['process', { section: '.c7-process', sectionPosition: 0.5 }],
  ['services', { section: '#services', sectionPosition: 0.5 }],
  ['cases', { section: '#cases', sectionPosition: 0.5 }],
  ['testimonials', { section: '#testimonials', sectionPosition: 0.5 }],
  ['contacts', { section: '#contacts', sectionPosition: 0.5 }],
  ['finish', { fraction: 1 }],
].filter(([name]) => !process.env.QA_STAGE || process.env.QA_STAGE.split(',').includes(name))

const scrollToStage = (target) => {
  const maximum = document.documentElement.scrollHeight - innerHeight
  const element = target.section ? document.querySelector(target.section) : null
  const top = element
    ? element.offsetTop + element.offsetHeight * target.sectionPosition - innerHeight * 0.5
    : maximum * target.fraction
  scrollTo({ top, behavior: 'instant' })
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: process.env.QA_GPU === 'metal' ? ['--use-angle=metal'] : [] })
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
    const response = await page.goto(`${base}/c7/${process.env.QA_PERF ? '?c7-debug' : ''}`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 45_000 })
    await page.evaluate(() => document.fonts.ready)
    if (process.env.QA_CLEAN) {
      await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; }' })
    }
    for (const [name, target] of positions) {
      await page.evaluate(scrollToStage, target)
      await page.waitForTimeout(900)
      await page.screenshot({ path: path.join(output, `${size.name}-${name}${process.env.QA_CLEAN ? '-clean' : ''}.png`) })
    }
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      ready: document.querySelector('.c7-landscape')?.classList.contains('is-ready'),
    }))
    if (!response || response.status() >= 400 || !state.ready || state.scrollWidth > state.viewportWidth || errors.length) failures++
    console.log(`${size.name}: HTTP ${response?.status() ?? 'none'}, overflow ${state.scrollWidth - state.viewportWidth}px, errors ${errors.length}`)
    if (process.env.QA_PERF) {
      const perfTarget = process.env.QA_PERF_PROGRESS
        ? { fraction: Number(process.env.QA_PERF_PROGRESS) }
        : { section: '.c7-process', sectionPosition: 0.5 }
      await page.evaluate(scrollToStage, perfTarget)
      await page.waitForTimeout(1400)
      const perf = await page.evaluate(async () => {
        const frames = await new Promise((resolve) => {
          const samples = []
          let previous = 0
          const sample = (now) => {
            if (previous) samples.push(now - previous)
            previous = now
            if (samples.length >= 90) resolve(samples)
            else requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })
        frames.sort((a, b) => a - b)
        const debug = JSON.parse(document.querySelector('.c7-landscape')?.dataset.c7Debug ?? '{}')
        return { median: frames[Math.floor(frames.length / 2)], p95: frames[Math.floor(frames.length * 0.95)], calls: debug.calls, triangles: debug.triangles }
      })
      console.log(`  ${perfTarget.section ?? `p${Math.round(perfTarget.fraction * 100)}`} frame ${perf.median.toFixed(1)} / ${perf.p95.toFixed(1)} ms median/p95, ${perf.calls} calls, ${perf.triangles} triangles (headless Chromium)`)
    }
    for (const error of errors) console.log(`  ${error}`)
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(`screenshots: ${output}`)
if (failures) process.exitCode = 1
