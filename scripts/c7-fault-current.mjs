import {chromium} from 'playwright'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const out=process.env.QA_OUTPUT;await mkdir(out,{recursive:true})
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3007',build=await(await fetch(base+'/c7-build.json')).json()
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error('Stale export '+file)
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[]
const allModes=['malformed','abort-photo','abort-control','timeout','no-webgl','save-data','context','reduced','resize']
try{
for(const width of [390,1440])for(const mode of (process.env.QA_MODES?.split(',')??allModes)){
 const height=width===390?844:900,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,reducedMotion:mode==='reduced'?'reduce':'no-preference'}),page=await context.newPage(),errors=[],consoleErrors=[],external=[],details={}
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url())})
 if(mode==='no-webgl')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:original.call(this,type,...args)}})
 if(mode==='save-data')await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}))
 if(mode==='abort-photo')await page.route('**/correction-world-*-v4.webp',route=>route.abort())
 if(mode==='abort-control')await page.route('**/correction-control-1280-v4.webp',route=>route.abort())
 if(mode==='timeout')await page.route('**/correction-control-1280-v4.webp',()=>{})
 const start=Date.now()
 try{
  await page.goto(base+'/c7/?c7-debug'+(mode==='malformed'?'#%':''),{waitUntil:'domcontentloaded'})
  const host=page.locator('.c7-landscape')
  const fallback=['abort-photo','abort-control','timeout','no-webgl','save-data'].includes(mode)
  await page.locator('.c7-landscape.is-'+(fallback?'fallback':'ready')).waitFor({timeout:15000})
  details.modeAtMs=Date.now()-start
  const state=()=>host.evaluate(e=>e.dataset.c7Debug?JSON.parse(e.dataset.c7Debug):null)
  if(fallback){
   const a=await state();await page.waitForTimeout(500);const b=await state();details.framesAfterFailure=a?.performance?.renderCount===undefined?null:b.performance.renderCount-a.performance.renderCount
   if(details.framesAfterFailure!==null)assert.equal(details.framesAfterFailure,0,'failed assets must stop expensive rendering')
   if(mode==='timeout')assert(details.modeAtMs>=4900&&details.modeAtMs<10000)
   const text=await page.locator('h1').evaluate(e=>({color:getComputedStyle(e).color,rect:e.getBoundingClientRect().toJSON()}));details.hero=text
   assert(text.rect.bottom>90&&text.rect.top<height)
   if(mode==='abort-photo'||mode==='no-webgl')await page.screenshot({path:`${out}/${width}-${mode}.jpg`,type:'jpeg',quality:80})
  }
  if(mode==='malformed')for(const hash of ['#%E0%A4%A','#unknown','#cases']){await page.goto(base+'/c7/?c7-debug'+hash);await page.locator('.c7-landscape.is-ready').waitFor();assert(!(await page.locator('body').innerText()).includes('Application error'))}
  if(mode==='context'){
   await page.evaluate(()=>{window.__c7loss=document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');window.__c7loss.loseContext()})
   await page.locator('.c7-landscape.is-fallback').waitFor();await page.waitForTimeout(150)
   await page.evaluate(()=>window.__c7loss.restoreContext());await page.locator('.c7-landscape.is-ready').waitFor({timeout:15000});await page.waitForTimeout(600);details.restored=await state();assert(details.restored.calls>0)
  }
  if(mode==='reduced'){
   await page.waitForTimeout(500);const a=await state();await page.waitForTimeout(700);const b=await state();assert.deepEqual(a.cloudX,b.cloudX);assert.equal(a.performance.renderCount,b.performance.renderCount)
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(600);const live=await state();assert.notDeepEqual(b.cloudX,live.cloudX)
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);const c=await state();await page.waitForTimeout(600);const d=await state();assert.deepEqual(c.cloudX,d.cloudX);details.staticFrames=d.performance.renderCount-c.performance.renderCount
  }
  if(mode==='resize'){
   details.samples=[]
   for(const [w,h]of [[width,height],[800,1000],[700,900],[650,900],[900,650],[width,height]]){
    await page.setViewportSize({width:w,height:h});await page.locator('#process').evaluate(e=>scrollTo({top:e.offsetTop,behavior:'instant'}));await page.waitForTimeout(1550)
    const s=await state();details.samples.push({width:w,height:h,exact:s.exactProgress,smooth:s.smoothProgress,buffer:s.performance.buffer})
    assert(Math.abs(s.exactProgress-s.smoothProgress)<.002);assert(s.performance.buffer[0]*s.performance.buffer[1]<=1500000)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   }
  }
  assert.equal(errors.length,0);assert.equal(external.length,0)
  const unexpected=consoleErrors.filter(s=>!(/Failed to load resource|CONTEXT_LOST|context lost/i.test(s)&&['abort-photo','abort-control','context'].includes(mode)))
  assert.equal(unexpected.length,0,unexpected.join('\n'))
  runs.push({width,height,mode,pass:true,details,errors,consoleErrors,external})
 }catch(error){runs.push({width,height,mode,pass:false,failure:String(error),details,errors,consoleErrors,external})}
 await context.close();console.log(width,mode,runs.at(-1).pass?'PASS':'FAIL '+runs.at(-1).failure)
 await writeFile(out+'/results.json',JSON.stringify({build,kind:'Metal Chromium fault injection and viewport emulation, not physical-phone testing',runs},null,2))
}
}finally{await browser.close()}
if(runs.some(r=>!r.pass))process.exitCode=1
