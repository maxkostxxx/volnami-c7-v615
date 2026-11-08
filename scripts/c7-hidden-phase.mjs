import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const output=process.env.QA_OUTPUT;if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'));for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[]
try{for(const[width,height]of[[390,844],[1440,900]]){const c=await browser.newContext({viewport:{width,height}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3007/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor();await p.locator('#process').evaluate(e=>scrollTo({top:e.offsetTop,behavior:'instant'}));await p.waitForTimeout(1500)
 const read=()=>p.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug))
 await p.evaluate(()=>{window.__qaHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__qaHidden});document.dispatchEvent(new Event('visibilitychange'))})
 const before=await read();await p.evaluate(()=>{const a=document.getElementById('cases').offsetTop,b=document.getElementById('testimonials').offsetTop;scrollTo({top:a+(b-a)*(.81-.66)/.17,behavior:'instant'})});await p.waitForTimeout(250);const hidden=await read()
 await p.evaluate(async()=>{window.__qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
 const resumed=await read();const pass=before.performance.renderCount===hidden.performance.renderCount&&Math.abs(resumed.exactProgress-.81)<.002&&Math.abs(resumed.smoothProgress-.81)<.002&&Math.abs(resumed.photo.progress-.81)<.002&&errors.length===0
 runs.push({width,height,before:hidden.photo.progress,hiddenFrames:hidden.performance.renderCount-before.performance.renderCount,resumed:{exact:resumed.exactProgress,smooth:resumed.smoothProgress,rendered:resumed.photo.progress},pass,errors});console.log(JSON.stringify(runs.at(-1)));await c.close()
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,kind:'document.hidden mocked; verifies handler/first resumed pose only. Not native browser visibility evidence.',runs},null,2))}
if(runs.some(r=>!r.pass))process.exitCode=1
