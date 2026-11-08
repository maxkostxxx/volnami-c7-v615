#!/usr/bin/env node
import {verifiedBuild} from './c7-qa-build.mjs'
import { chromium } from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const base = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3007').replace(/\/+$/, '')
const disableWebgl = process.env.QA_DISABLE_WEBGL === '1'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT;await mkdir(output,{recursive:false})
const build=await verifiedBuild(base)
for(const[f,h]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(f)).digest('hex')!==h)throw new Error('Stale export '+f)
const runs=[]
const sizes = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const browser = await chromium.launch({ headless: true,args:['--use-angle=metal'] })
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 })
    if (process.env.QA_TERRAIN_CANDIDATE) {
      const dir=process.env.QA_TERRAIN_CANDIDATE;
      const terrain=(await readFile(dir+'/terrain.js','utf8')).replace(/(['"])three\1/g,"'./vendor/three/three.module.js'");
      const manifest=JSON.parse(await readFile(dir+'/terrain-cache/manifest.json','utf8'));
      manifest.sourceSha256=createHash('sha256').update(terrain).digest('hex');
      await context.route('**/3d/c7/runtime-v395/terrain.js',r=>r.fulfill({contentType:'application/javascript',body:terrain}));
      await context.route('**/3d/c7/runtime-v395/terrain-cache/manifest.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(manifest)}));
      await writeFile(output+'/candidate.json',JSON.stringify({dir,packagedTerrainSha:manifest.sourceSha256,kind:'Explicit terrain module and cache header overrides in current production DOM'},null,2));
    }
    if (disableWebgl) await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === 'webgl2' || type === 'webgl') return null
        return original.call(this, type, ...args)
      }
    })
    await context.addInitScript(() => {
      window.__c7Startup = { start: performance.now(), longTasks: [], marks: [] }
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__c7Startup.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
        }
      }).observe({ type: 'longtask', buffered: true })
      addEventListener('DOMContentLoaded', () => {
        window.__c7Startup.marks.push({ name: 'dom-ready', t: Math.round(performance.now()) })
        const observer = new MutationObserver(() => {
          if (document.querySelector('.c7-landscape.is-ready, .c7-landscape.is-fallback')) {
            window.__c7Startup.marks.push({ name: 'world-ready', t: Math.round(performance.now()) })
            observer.disconnect()
          }
        })
        observer.observe(document.documentElement, { attributes: true, subtree: true })
      }, { once: true })
    })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
    await page.goto(`${base}/c7/?c7-debug#${process.env.QA_HASH??'cases'}`, { waitUntil: 'domcontentloaded' })
    await page.locator(disableWebgl ? '.c7-landscape.is-fallback' : '.c7-landscape.is-ready').waitFor({ timeout: 45_000 })
    await page.waitForTimeout(1900)
    const { profile } = await cdp.send('Profiler.stop')
    const state = await page.evaluate(() => ({
      ...window.__c7Startup,
      scrollY,
      debug:document.querySelector('.c7-landscape')?.dataset.c7Debug,
      navigation: performance.getEntriesByType('navigation').map((entry) => ({
        domContentLoadedEventEnd: Math.round(entry.domContentLoadedEventEnd),
        loadEventEnd: Math.round(entry.loadEventEnd),
      })),
    }))
    const selfByNode = new Map()
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
    const samples = profile.samples ?? []
    const deltas = profile.timeDeltas ?? []
    for (let i = 0; i < samples.length; i++) {
      const node = nodes.get(samples[i])
      if (!node) continue
      const name = `${node.callFrame.functionName || '(anonymous)'} @ ${node.callFrame.url.split('/').at(-1) || '(native)'}`
      selfByNode.set(name, (selfByNode.get(name) ?? 0) + (deltas[i] ?? 0) / 1000)
    }
    const result={
      name:size.name,
      ...state,
      topSelfMs: [...selfByNode].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => [name, Math.round(ms)]),
    }
    runs.push(result)
    await writeFile(output+'/'+size.name+'-profile.json',JSON.stringify(profile))
    console.log(size.name, JSON.stringify({longTasks:state.longTasks,topSelfMs:result.topSelfMs}))
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(output+'/results.json',JSON.stringify({build,method:'Metal-backed desktop Chromium, instrumented CPU profile; viewport is not physical phone',runs},null,2))
}
