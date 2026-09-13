#!/usr/bin/env node
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const targets = [
  ['Volnami-3-finalista.html', 3],
  ['Volnami-6-konceptov.html', 6],
]

const failures = []
const browser = await chromium.launch({ headless: true })
try {
  for (const [file, expected] of targets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load' })
    const state = await page.evaluate(() => ({
      concepts: document.querySelectorAll('.concept').length,
      images: [...document.images].map((image) => ({ complete: image.complete, width: image.naturalWidth })),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))
    if (state.concepts !== expected) failures.push(`${file}: concepts=${state.concepts}, expected=${expected}`)
    if (state.images.length !== expected || state.images.some((image) => !image.complete || !image.width)) {
      failures.push(`${file}: embedded images are incomplete`)
    }
    if (state.horizontalOverflow) failures.push(`${file}: document has horizontal overflow`)
    failures.push(...errors.map((error) => `${file}: ${error}`))
    await page.close()
  }
} finally {
  await browser.close()
}

for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(`showcase: ${failures.length} failures`)
process.exitCode = failures.length ? 1 : 0
