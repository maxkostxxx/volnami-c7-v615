#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
if (!process.env.QA_OUTPUT) throw new Error('QA_OUTPUT must name a new evidence directory')
const output = path.resolve(process.env.QA_OUTPUT)
const label = process.env.QA_LABEL ?? 'cloud-loop'
const duration = Number(process.env.QA_DURATION_MS ?? 180_000)
const width = Number(process.env.QA_WIDTH ?? 390)
const height = Number(process.env.QA_HEIGHT ?? 844)
await mkdir(output, { recursive: false })
const build = await (await fetch(base+'/c7-build.json')).json()
for (const [file,hash] of Object.entries(build.sources)) {
  if (createHash('sha256').update(await readFile(file)).digest('hex')!==hash) throw new Error('Stale export '+file)
}
const results={build,width,height,duration,kind:'Metal-backed desktop Chromium; viewport emulation, not a physical phone',samples:[],errors:[]}
const browser = await chromium.launch({ headless: true,args:['--use-angle=metal'] })
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = results.errors
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded' })
  await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => scrollTo({ top: document.getElementById('process').offsetTop, behavior: 'instant' }))
  await page.waitForTimeout(1000)
  const sample = async (labelSuffix) => {
    const debug = await page.locator('.c7-landscape').evaluate((element) => JSON.parse(element.dataset.c7Debug ?? '{}'))
    const near = debug.cloudX.filter((x) => Math.abs(x - debug.camera[0]) < (width < 720 ? 100 : 260)).length
    const file = path.join(output, `t11-${label}-${width}-${labelSuffix}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 75 })
    const rawStyle = await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; } .c7-landscape-fallback, .c7-landscape::after { display: none !important; }' })
    await page.evaluate(()=>dispatchEvent(new Event('scroll')))
    await page.waitForTimeout(100)
    const rawFile = path.join(output, `t11-${label}-${width}-${labelSuffix}-raw.jpg`)
    await page.screenshot({ path: rawFile, type: 'jpeg', quality: 75 })
    await rawStyle.evaluate((element) => element.remove())
    const sample={ at: labelSuffix, cameraX: debug.camera[0], cloudX: debug.cloudX, near, errors: [...errors], file, rawFile,state:debug }
    results.samples.push(sample)
    await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))
    console.log(JSON.stringify({at:labelSuffix,near,errors:errors.length}))
    if (near < 2 || errors.length) process.exitCode = 1
  }
  await sample('t0')
  const checkpoints = [...new Set([60_000, 120_000, 180_000, duration])]
    .filter((value) => value <= duration).sort((a, b) => a - b)
  let previous = 0
  for (const elapsed of checkpoints) {
    await page.waitForTimeout(elapsed - previous)
    await sample(`t${Math.round(elapsed / 1000)}`)
    previous = elapsed
  }
  await page.evaluate(() => scrollTo({ top: document.getElementById('cases').offsetTop, behavior: 'instant' }))
  await page.waitForTimeout(900)
  await sample('after-scroll')
  await page.close()
} finally {
  await browser.close()
  await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))
}
