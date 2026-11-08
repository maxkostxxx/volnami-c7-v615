#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

if (!process.env.QA_OUTPUT) throw new Error('QA_OUTPUT must name a new evidence directory')
const output=path.resolve(process.env.QA_OUTPUT)
await mkdir(output,{recursive:true})
const base=(process.env.QA_BASE_URL??'http://127.0.0.1:3007').replace(/\/+$/,'')
const sizes=[['phone',390,844],['desktop',1440,900],['wide',2560,1080]]
  .filter(([name])=>!process.env.QA_SIZES||process.env.QA_SIZES.split(',').includes(name))
const variants=(process.env.QA_VARIANTS??'normal-final,low-final,normal-neutral,low-neutral').split(',')
const stages=(process.env.QA_STAGES??'hero,process').split(',')
const manifest={base,requestedGPU:process.env.QA_GPU??'default',kind:'Chromium viewport emulation; not physical mobile performance',sources:{},runs:[]}
const build=await (await fetch(`${base}/c7-build.json`)).json()
for(const [file,hash] of Object.entries(build.sources)) {
  const current=createHash('sha256').update(await readFile(file)).digest('hex')
  if(current!==hash)throw new Error(`Stale export: ${file}`)
  manifest.sources[file]=hash
}
manifest.build=build.completedAt
const browser=await chromium.launch({headless:true,args:process.env.QA_GPU==='metal'?['--use-angle=metal']:[]})
let failed=false
try {
  for(const [name,width,height] of sizes) for(const variant of variants) {
    const [quality,light,reflection]=variant.split('-')
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'})
    const page=await context.newPage(), errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    const url=`${base}/c7/?c7-debug&c7-poster&c7-quality=${quality}&c7-light=${light}&c7-reflection=${reflection??'on'}`
    await page.goto(url,{waitUntil:'domcontentloaded'})
    await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
    await page.evaluate(()=>document.documentElement.classList.remove('c7-poster-capture'))
    const rawStyle=await page.addStyleTag({content:'.c7 > :not(.c7-landscape){visibility:hidden!important}.c7-landscape-fallback,.c7-landscape::after{display:none!important}'})
    for(const stage of stages) {
      await page.evaluate(id=>scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'}),stage)
      await page.waitForTimeout(350)
      const state=await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug??'{}'))
      if(!Number.isFinite(state.smoothProgress)||Math.abs(state.exactProgress-state.smoothProgress)>.002||state.photo?.status!=='ready')throw new Error(`Invalid ready state ${name}/${variant}/${stage}`)
      const file=`${name}-${variant}-${stage}.jpg`
      await page.screenshot({path:path.join(output,file),type:'jpeg',quality:85})
      manifest.runs.push({name,width,height,variant,stage,file,state,errors:[...errors]})
      console.log(`${file}: ${state.calls} calls, ${state.triangles} triangles, errors=${errors.length}`)
    }
    await rawStyle.evaluate(e=>e.remove())
    await page.screenshot({path:path.join(output,`${name}-${variant}-dom.jpg`),type:'jpeg',quality:85})
    if(errors.length)failed=true
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2))
}
if(failed)process.exitCode=1
