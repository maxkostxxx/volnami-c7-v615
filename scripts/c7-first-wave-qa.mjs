import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3235/volnami-c7-v615'
const output = 'evidence/c7-first-wave-2026-11-09'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const results = []
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const start = Date.now()
    await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded' })
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 60000 })
    const readyMs = Date.now() - start
    await page.waitForTimeout(1500)
    const pseudo = await page.locator('.c7-header .c7-brief').evaluate(e => ({ button: e.getBoundingClientRect().width, pseudo: parseFloat(getComputedStyle(e, '::before').width), position: getComputedStyle(e).position }))
    const about = page.locator('#about h2')
    await about.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(120)
    const wave = await about.evaluate(e => ({ letters: e.querySelectorAll('.c7-letter').length, delays: [...e.querySelectorAll('.c7-letter')].slice(0, 4).map(s => s.getAnimations()[0]?.effect.getTiming().delay) }))
    await page.waitForTimeout(1500)
    const first = await about.getAttribute('data-motion-entries')
    for (const id of ['services', 'cases', 'testimonials', 'contacts', 'cases', 'services', 'about', 'hero']) {
      await page.locator('#' + id).evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await page.waitForTimeout(1400)
    }
    const after = await about.getAttribute('data-motion-entries')
    const settled = await page.evaluate(() => ({
      letters: document.querySelectorAll('.c7-letter').length,
      hidden: [...document.querySelectorAll('[data-motion-entries]')].filter(e => getComputedStyle(e).opacity !== '1').length,
      ribbons: document.querySelectorAll('.c7-wave-reveal__front').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }))
    let hover = null
    if (!mobile) {
      const card = page.locator('#services article').first()
      await card.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await card.hover()
      await page.waitForTimeout(350)
      hover = await card.evaluate(e => getComputedStyle(e).transform)
    }
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}.png`, timeout: 30000 })
    results.push({ mobileEmulation: mobile, readyMs, pseudo, wave, first, after, settled, hover, errors })
    await context.close()
  }
} finally { await browser.close() }
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
if (results.some(r => r.errors.length || r.first !== '1' || r.after !== '1' || r.settled.hidden || r.settled.letters || r.settled.ribbons || r.settled.overflow || r.pseudo.position !== (r.mobileEmulation ? 'relative' : 'absolute') || r.pseudo.pseudo > r.pseudo.button * 1.4 || !r.wave.letters || (!r.mobileEmulation && r.hover === 'none'))) process.exitCode = 1
