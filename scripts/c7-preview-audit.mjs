import {verifiedBuild} from './c7-qa-build.mjs';
// Review the portable/hosted C7 package without relying on its private build manifest.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3017'
const output = process.env.QA_OUTPUT
if (!output) throw new Error('QA_OUTPUT required')
await mkdir(output, { recursive: true })
const build = process.env.QA_LOCAL_MANIFEST ? await verifiedBuild(base) : null
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const runs = []
try {
  for (const [width, height] of [[390, 844], [1440, 900], [2560, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    const page = await context.newPage(), errors = [], badResponses = [], failedRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }) })
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ url: request.url(), error: request.failure() }) })
    const response = await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 120000 })
    assert.equal(response.status(), 200)
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.title(), 'Volnami — стратегия, дизайн и digital')
    assert.equal(await page.locator('a[href="mailto:v.volnami@yandex.ru"]').count(), 1)
    assert.equal(await page.locator('script[src*="email-decode"]').count(), 0, 'Edge must not rewrite reviewed HTML')
    for (const id of ['hero', 'process', 'cases', 'testimonials', 'contacts']) {
      await page.evaluate(id => { const el = document.getElementById(id); scrollTo({ top: id === 'hero' ? 0 : el.offsetTop - 90, behavior: 'instant' }) }, id)
      await page.waitForTimeout(250)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: `${output}/${width}-${id}.jpg`, type: 'jpeg', quality: 85 })
    }
    const sunset = []
    for (const phase of [.86, .87, .88]) {
      await page.evaluate(phase => {
        const start = document.getElementById('testimonials').offsetTop
        const end = document.getElementById('contacts').offsetTop
        scrollTo({ top: start + (end - start) * (phase - .83) / .1, behavior: 'instant' })
      }, phase)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${output}/${width}-sunset-${Math.round(phase * 100)}.jpg`, type: 'jpeg', quality: 85 })
      sunset.push({ phase, scrollY: await page.evaluate(() => scrollY) })
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: `${output}/${width}-main-silhouette.jpg`, type: 'jpeg', quality: 70, fullPage: true })
    const links = await page.locator('a[href="/c7/case/miratorg-extra-meat/"]').count()
    assert.equal(links, 1, 'Exactly one detailed project is linked from the main page')
    await page.goto(base + '/c7/case/miratorg-extra-meat/', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    for (const image of await page.locator('.c7-project-cover img,.c7-project-gallery img').all()) {
      await image.scrollIntoViewIfNeeded()
      await image.evaluate(image => image.decode())
    }
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
    const images = await page.locator('.c7-project-cover img,.c7-project-gallery img').evaluateAll(images => images.map(image => ({ src: image.getAttribute('src'), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })))
    assert.equal(images.length, 5)
    assert.ok(images.every(image => image.complete && image.naturalWidth > 0))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${output}/${width}-extra.jpg`, type: 'jpeg', quality: 85 })
    await page.screenshot({ path: `${output}/${width}-extra-silhouette.jpg`, type: 'jpeg', quality: 75, fullPage: true })
    await page.locator('.c7-project-back').click()
    await page.waitForURL('**/c7/#cases')
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'cases')
    runs.push({ width, height, links, images, sunset, errors, badResponses, failedRequests })
    assert.equal(errors.length + badResponses.length + failedRequests.length, 0, JSON.stringify(runs.at(-1)))
    console.log(`${width}: main, 5 scenes, Extra Meat and return PASS`)
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(output + '/results.json', JSON.stringify({ base, build, time: new Date().toISOString(), kind: 'Browser viewport emulation, not physical phone acceptance', runs }, null, 2))
}
