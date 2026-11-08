#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import{createHash}from'node:crypto'
import path from 'node:path'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const output = path.resolve(process.env.QA_OUTPUT ?? 'screenshots/c7/sunset-dom')
const label = process.env.QA_LABEL ?? 'candidate'
const sizes = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 2560, height: 1080 },
].filter(size => !process.env.QA_SIZE || process.env.QA_SIZE.split(',').includes(size.name))
const phases = process.env.QA_PHASE ? process.env.QA_PHASE.split(',').map(Number) : [.78,.79,.8,.81,.82,.83,.84,.86,.89,.92,.95]

await mkdir(output, { recursive: true })
const overrideSources=Object.fromEntries(await Promise.all((process.env.QA_OVERRIDE_FILES??'world.js,atmosphere.js').split(',').map(async n=>[n,await readFile((process.env.QA_RUNTIME_CANDIDATE??'lab/c7-snapshots/portrait-sunset-v413')+'/'+n,'utf8')])));
await writeFile(output+'/sources.json',JSON.stringify({base,kind:'Production DOM with explicitly recorded candidate module overrides; not published/current live runtime',hashes:Object.fromEntries(Object.entries(overrideSources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')]))},null,2));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
let failures = 0
const rows = []
try {
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    for(const[name,source]of Object.entries(overrideSources))await page.route('**/3d/c7/runtime-v395/'+name,r=>r.fulfill({status:200,contentType:'application/javascript',body:source.replace(/(['"])three\1/g,"'./vendor/three/three.module.js'")}));
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    try { await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 30_000 }) } catch(error) { await writeFile(output+'/failure-'+size.name+'.json',JSON.stringify({errors,mode:await page.locator('.c7-landscape').getAttribute('class')},null,2));throw error; }
    if(process.env.QA_EXTRA_CSS)await page.addStyleTag({content:await readFile(process.env.QA_EXTRA_CSS,'utf8')});
    await page.evaluate(() => document.fonts.ready)
    if (process.env.QA_RAW) {
      await page.addStyleTag({ content: '.c7 > :not(.c7-landscape) { visibility: hidden !important; } .c7-landscape-fallback { display: none !important; } .c7-landscape::after { display: none !important; }' })
    }
    for (const phase of phases) {
      await page.evaluate(p => {
        const anchors = [
          [0, document.getElementById('hero')?.offsetTop ?? 0],
          [.16, document.getElementById('about')?.offsetTop ?? 0],
          [.3, document.getElementById('process')?.offsetTop ?? 0],
          [.47, document.getElementById('services')?.offsetTop ?? 0],
          [0.66, document.getElementById('cases')?.offsetTop ?? 0],
          [0.83, document.getElementById('testimonials')?.offsetTop ?? 0],
          [0.93, document.getElementById('contacts')?.offsetTop ?? 0],
          [1, document.documentElement.scrollHeight - innerHeight],
        ]
        let index = 0
        while (index < anchors.length - 2 && p > anchors[index + 1][0]) index++
        const [p0, y0] = anchors[index]
        const [p1, y1] = anchors[index + 1]
        scrollTo({ top: y0 + (y1 - y0) * (p - p0) / (p1 - p0), behavior: 'instant' })
      }, phase)
      await page.waitForTimeout(400)
      const data = await page.evaluate(() => ({
        debug: JSON.parse(document.querySelector('.c7-landscape')?.dataset.c7Debug ?? '{}'),
        cardsTop: Math.round(document.querySelector('.c7-quotes li')?.getBoundingClientRect().top ?? 0),
        controlsTop: Math.round(document.querySelector('.c7-quotes-controls')?.getBoundingClientRect().top ?? 0),
      }))
      const file = path.join(output, `t05-${label}-${size.name}-p${Math.round(phase * 100)}${process.env.QA_RAW ? '-raw' : ''}.jpg`)
      await page.screenshot({ path: file, type: 'jpeg', quality: 78 })
      console.log(`${size.name} p${Math.round(phase * 100)} exact=${data.debug.exactProgress?.toFixed(3)} smooth=${data.debug.smoothProgress?.toFixed(3)} cardsTop=${data.cardsTop} controlsTop=${data.controlsTop} errors=${errors.length}; ${file}`)
      rows.push({size,phase,file,...data,errors:[...errors]})
      if (Math.abs(data.debug.exactProgress - phase) > 0.005 || errors.length) failures++
    }
    if (!response || response.status() >= 400) failures++
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(output+'/results.json',JSON.stringify({failures,rows},null,2))
if (failures) process.exitCode = 1
