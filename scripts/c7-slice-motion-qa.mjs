#!/usr/bin/env node
import {chromium} from 'playwright'
import {mkdir,writeFile,readFile,rename} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=path.resolve(process.env.QA_OUTPUT),base=process.env.QA_BASE_URL??'http://127.0.0.1:3007'
await mkdir(output,{recursive:true})
const build=await(await fetch(`${base}/c7-build.json`)).json()
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error(`Stale export ${file}`)
const browser=await chromium.launch({headless:true,args:process.env.QA_GPU==='metal'?['--use-angle=metal']:[]}),runs=[]
let failed=false
try {
 for(const [name,width,height]of [['phone',390,844],['desktop',1440,900],['wide',2560,1080]].filter(([name])=>!process.env.QA_SIZES||process.env.QA_SIZES.split(',').includes(name)))for(const quality of (process.env.QA_VARIANTS??'normal,low').split(',')) {
  const videoScale=Math.min(1,Number(process.env.QA_VIDEO_WIDTH??1280)/width)
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,recordVideo:{dir:output,size:{width:Math.round(width*videoScale),height:Math.round(height*videoScale)}}})
  const page=await context.newPage(),errors=[],samples=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.goto(`${base}/c7/?c7-debug&c7-quality=${quality}`,{waitUntil:'domcontentloaded'})
  await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
  if(process.env.QA_CLEAN==='1')await page.addStyleTag({content:'.c7 > :not(.c7-landscape){visibility:hidden!important}.c7-landscape-fallback,.c7-landscape::after{display:none!important}'})
  const end=process.env.QA_FULL==='1'?await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight):await page.locator('#process').evaluate(e=>e.offsetTop)
  const targetProgress=process.env.QA_FULL==='1'?1:.3,steps=Number(process.env.QA_STEPS??20)
  if(end<height)throw new Error('Collapsed document invalidates motion test')
  const sample=async label=>{samples.push({label,at:Date.now(),...await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug))})}
  await sample('start')
  for(const direction of [1,-1]) {
   for(let step=0;step<steps;step++) {await page.mouse.wheel(0,direction*end/steps);await page.waitForTimeout(180);await sample(`${direction}:${step}`)}
   await page.waitForTimeout(1500);await sample(direction===1?'turn':'return')
   await page.screenshot({path:path.join(output,`${name}-${quality}-${direction===1?'turn':'return'}.jpg`),type:'jpeg',quality:85})
  }
  const maxSettledError=Math.max(...samples.filter(s=>['turn','return'].includes(s.label)).map(s=>Math.abs(s.exactProgress-s.smoothProgress)))
  const turn=samples.find(s=>s.label==='turn'),back=samples.find(s=>s.label==='return')
  if(Math.abs(turn.exactProgress-targetProgress)>.005||Math.abs(back.exactProgress)>.005)throw new Error('Did not reach the intended motion anchors')
  if(maxSettledError>.002||errors.length)failed=true
  const video=page.video();await context.close();await rename(await video.path(),path.join(output,`${name}-${quality}.webm`))
  runs.push({name,width,height,quality,targetProgress,steps,videoScale,errors,maxSettledError,samples})
  console.log(`${name}/${quality}: settled=${maxSettledError.toFixed(6)}, errors=${errors.length}`)
 }
} finally {await browser.close();await writeFile(path.join(output,'manifest.json'),JSON.stringify({kind:'Viewport emulation; not physical-device performance',requestedGPU:process.env.QA_GPU??'default',raw:process.env.QA_CLEAN==='1',build,runs},null,2))}
if(failed)process.exitCode=1
