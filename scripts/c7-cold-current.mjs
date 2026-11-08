import {chromium} from 'playwright'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base='http://127.0.0.1:3007';await mkdir(output,{recursive:true})
const build=await(await fetch(base+'/c7-build.json')).json()
for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const workerURL=JSON.parse(await readFile('screenshots/c7/2026-10-23-implementation-exec056/al23-worker-lifecycle/results.json','utf8')).workerURL
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[]
try{for(const[width,height]of[[390,844],[1440,900]])for(const hash of['hero','testimonials']){
 const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message))
 // Deliberately hold the observed worker to inspect the actual loading UI.
 await c.route(workerURL,async r=>{await new Promise(resolve=>setTimeout(resolve,1600));await r.continue()})
 await p.goto(base+'/c7/?c7-debug#'+hash,{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150)
 const read=()=>p.evaluate(()=>{const h=document.querySelector('.c7-landscape'),im=h.querySelector('img');return{mode:h.className,scrollY,posterOpacity:getComputedStyle(im).opacity,backdrop:getComputedStyle(im.parentElement).backgroundColor,debug:h.dataset.c7Debug?JSON.parse(h.dataset.c7Debug):null}})
 const loading=await read();await p.screenshot({path:`${output}/${width}-${hash}-loading.jpg`,type:'jpeg',quality:76})
 await p.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await p.waitForTimeout(750);const ready=await read();await p.screenshot({path:`${output}/${width}-${hash}-ready.jpg`,type:'jpeg',quality:76})
 assert.ok(loading.mode.includes('is-loading'),'delayed worker did not hold loading state');assert.ok(Math.abs(loading.scrollY-ready.scrollY)<2);assert.equal(errors.length,0)
 runs.push({width,height,hash,loading,ready,errors});await c.close();console.log(width+' '+hash+' PASS technical; visual review required')
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,forcedDelayMs:1600,note:'Forced worker delay exposes loading state; not a startup benchmark or physical-device result.',runs},null,2))}
