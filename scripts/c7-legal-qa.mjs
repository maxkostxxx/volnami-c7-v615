import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { chromium } from 'playwright'

const packageDirectory = process.argv[2] || 'artifacts/c7-preview-2026-11-07-v635-legal'
const evidenceDirectory = 'evidence/c7-v635-legal-2026-11-07'
await mkdir(evidenceDirectory, { recursive: true })

const portProbe = net.createServer()
await new Promise((resolve, reject) => portProbe.once('error', reject).listen(0, '127.0.0.1', resolve))
const address = portProbe.address()
assert(address && typeof address === 'object')
const port = address.port
await new Promise(resolve => portProbe.close(resolve))

const server = spawn(process.execPath, ['scripts/c7-preview-server.mjs', packageDirectory, String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Preview server did not start: ${serverLog}`)), 10000)
  server.stdout.on('data', chunk => {
    if (String(chunk).includes('listening')) {
      clearTimeout(timeout)
      resolve()
    }
  })
  server.once('error', error => { clearTimeout(timeout); reject(error) })
  server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited ${code}: ${serverLog}`)) })
})

const base = `http://127.0.0.1:${port}`
const report = {
  packageDirectory,
  viewport: { width: 390, height: 844 },
  documents: [],
  form: {},
  consoleErrors: [],
  pageErrors: [],
  httpErrors: [],
  requestFailures: [],
  dialogs: [],
}
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: report.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })

  const watch = (page, label) => {
    page.on('console', message => {
      if (message.type() === 'error') report.consoleErrors.push({ page: label, text: message.text() })
    })
    page.on('pageerror', error => report.pageErrors.push({ page: label, text: error.message }))
    page.on('response', response => {
      if (response.status() >= 400) report.httpErrors.push({ page: label, status: response.status(), url: response.url() })
    })
    page.on('requestfailed', request => report.requestFailures.push({ page: label, url: request.url(), error: request.failure()?.errorText }))
    page.on('dialog', dialog => {
      report.dialogs.push({ page: label, type: dialog.type(), message: dialog.message() })
      dialog.dismiss()
    })
  }

  const documents = [
    { route: 'policy', source: 'policy.txt' },
    { route: 'agreement', source: 'form.txt' },
    { route: 'cookie', source: 'cookie.txt' },
  ]
  for (const document of documents) {
    const page = await context.newPage()
    watch(page, document.route)
    const response = await page.goto(`${base}/${document.route}`, { waitUntil: 'networkidle' })
    assert.equal(response?.status(), 200, `${document.route} did not return 200`)
    assert.equal(new URL(page.url()).pathname, `/${document.route}/`)

    const expectedLines = (await readFile(`evidence/c7-v634-repair-2026-11-06/${document.source}`, 'utf8')).trimEnd().split(/\r?\n/)
    const actualLines = await page.locator('[data-legal-line]').evaluateAll(nodes => nodes.map(node => node.textContent || ''))
    assert.deepEqual(actualLines, expectedLines, `${document.route} text differs from its source`)

    const navigation = await page.locator('.legal-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))
    assert.deepEqual(navigation, ['/policy/', '/agreement/', '/cookie/'])
    assert.equal(await page.locator('.legal-nav a[aria-current="page"]').getAttribute('href'), `/${document.route}/`)

    const readability = await page.evaluate(() => {
      const paragraphs = [...document.querySelectorAll('p[data-legal-line]')].map(element => {
        const style = getComputedStyle(element)
        const fontSize = Number.parseFloat(style.fontSize)
        return { fontSize, lineHeight: Number.parseFloat(style.lineHeight) / fontSize }
      })
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        minimumFontSize: Math.min(...paragraphs.map(item => item.fontSize)),
        minimumLineHeight: Math.min(...paragraphs.map(item => item.lineHeight)),
      }
    })
    assert.ok(readability.documentWidth <= readability.viewportWidth, `${document.route} overflows horizontally`)
    assert.ok(readability.minimumFontSize >= 16, `${document.route} body text is too small`)
    assert.ok(readability.minimumLineHeight >= 1.55, `${document.route} line height is too small`)
    await page.screenshot({ path: `${evidenceDirectory}/${document.route}-mobile.png`, fullPage: true })
    report.documents.push({ route: `/${document.route}`, status: response.status(), lines: actualLines.length, ...readability })
    await page.close()
  }

  const page = await context.newPage()
  watch(page, 'c7-form')
  const response = await page.goto(`${base}/c7/#brief`, { waitUntil: 'networkidle', timeout: 60000 })
  assert.equal(response?.status(), 200)
  const form = page.locator('.c7-brief-form form')
  await form.waitFor()
  const consent = form.locator('input[name="consent"]')
  assert.equal(await consent.isChecked(), false)
  assert.equal(await consent.getAttribute('required'), '')
  assert.equal(await form.locator('a[href="/agreement/"]').count(), 1)
  assert.equal(await form.locator('a[href="/policy/"]').count(), 1)

  await form.locator('input[name="name"]').fill('Тестовое имя')
  await form.locator('input[name="contact"]').fill('test@example.com')
  await form.locator('textarea[name="project"]').fill('Проверка обязательного согласия')
  await form.locator('button[type="submit"]').click()
  await page.locator('#c7-brief-consent-error').waitFor({ state: 'visible' })
  assert.equal(await consent.getAttribute('aria-invalid'), 'true')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'consent')
  assert.match(await form.locator('.c7-brief-notice').innerText(), /подтверди согласие/i)
  assert.equal(await form.locator('.c7-brief-draft').count(), 0)
  assert.equal(await form.locator('a[href^="mailto:"]').count(), 0)

  await consent.check()
  await form.locator('button[type="submit"]').click()
  const mailto = form.locator('a[href^="mailto:"]')
  await mailto.waitFor({ state: 'visible' })
  const href = await mailto.getAttribute('href')
  assert(href?.startsWith('mailto:v.volnami@yandex.ru?subject='))
  assert(decodeURIComponent(href).includes('Как обращаться: Тестовое имя'))
  assert(decodeURIComponent(href).includes('Контакт для ответа: test@example.com'))

  const consentLayout = await form.locator('.c7-brief-consent').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    fontSize: Number.parseFloat(getComputedStyle(element.querySelector('label')).fontSize),
  }))
  assert.ok(consentLayout.scrollWidth <= consentLayout.clientWidth)
  assert.equal(await page.locator('[class*="cookie" i], [id*="cookie" i]').count(), 0)
  await form.screenshot({ path: `${evidenceDirectory}/form-mobile.png` })
  report.form = {
    uncheckedByDefault: true,
    required: true,
    blockedWithoutConsent: true,
    focusedOnError: true,
    mailto: href,
    cookieBanners: 0,
    consentLayout,
  }

  assert.deepEqual(report.consoleErrors, [], 'Browser console errors were recorded')
  assert.deepEqual(report.pageErrors, [], 'Uncaught browser errors were recorded')
  assert.deepEqual(report.httpErrors, [], 'HTTP errors were recorded')
  assert.deepEqual(report.requestFailures, [], 'Failed requests were recorded')
  assert.deepEqual(report.dialogs, [], 'Browser dialogs were recorded')
  report.status = 'passed'
  await writeFile(`${evidenceDirectory}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (browser) await browser.close()
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGTERM')
    await stopped
  }
}
