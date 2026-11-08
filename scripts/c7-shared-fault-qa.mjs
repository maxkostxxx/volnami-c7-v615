import {verifiedBuild} from './c7-qa-build.mjs';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.QA_OUTPUT??'evidence/shared-world-v395-faults',base=process.env.QA_BASE_URL??'http://127.0.0.1:3037';await mkdir(out,{recursive:true});
const build=await verifiedBuild(base);
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[];
const modes=process.env.QA_MODES?.split(',')??['no-webgl','save-data','abort-sky','reduced','context','resize','timeout'];
try{for(const mode of modes){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],consoleErrors=[],details={};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,1000))});
 if(mode==='no-webgl')await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:old.call(this,type,...args)}});
 if(mode==='save-data')await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
 if(mode==='abort-sky')await page.route('**/runtime-v395/assets/**',route=>route.abort());
 if(mode==='timeout')await page.route('**/runtime-v395/assets/**',()=>{});
 const start=Date.now();
 try{
  await page.goto(base+'/c7/?c7-scene=shared&c7-debug',{waitUntil:'domcontentloaded'});
  const fallback=['no-webgl','save-data','abort-sky','timeout'].includes(mode);
  await page.locator('.c7-landscape.is-'+(fallback?'fallback':'ready')).waitFor({timeout:65000});details.modeAtMs=Date.now()-start;
  const state=()=>page.locator('.c7-landscape').evaluate(e=>e.dataset.c7Debug?JSON.parse(e.dataset.c7Debug):null);
  if(fallback){assert(await page.locator('h1').isVisible());assert.equal(await page.locator('body').innerText().then(t=>t.includes('Application error')),false);if(mode==='timeout')assert(details.modeAtMs>=44000&&details.modeAtMs<60000);}
  if(mode==='context'){
   await page.evaluate(()=>{window.__loss=document.querySelector('.c7-landscape canvas').getContext('webgl2').getExtension('WEBGL_lose_context');window.__loss.loseContext()});
   await page.locator('.c7-landscape.is-fallback').waitFor();await page.waitForTimeout(200);await page.evaluate(()=>window.__loss.restoreContext());await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000});details.restored=await state();assert(details.restored.calls>0);
  }
  if(mode==='reduced'){
   await page.waitForTimeout(300);const a=await state();await page.waitForTimeout(700);const b=await state();assert.equal(a.frames,b.frames);assert.equal(a.time,b.time);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(700);const c=await state();assert(c.frames>b.frames);assert(c.time>b.time);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);const d=await state();await page.waitForTimeout(600);const e=await state();assert.equal(d.frames,e.frames);details.staticFrames=e.frames-d.frames;
  }
  if(mode==='resize'){
   details.samples=[];await page.locator('#process').evaluate(e=>scrollTo({top:e.offsetTop,behavior:'instant'}));await page.waitForTimeout(300);
   for(const [width,height]of [[1440,900],[2560,1080],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(500);const s=await state();assert(Math.abs(s.exactProgress-.3)<.002);assert.equal(s.exactProgress,s.smoothProgress);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);details.samples.push({width,height,phase:s.exactProgress,quality:s.quality,grass:s.grass});}
  }
  assert.equal(errors.length,0,errors.join('\n'));runs.push({mode,pass:true,details,errors,consoleErrors});
 }catch(e){runs.push({mode,pass:false,failure:e.stack,details,errors,consoleErrors});}
 await context.close();console.log(mode,runs.at(-1).pass?'PASS':'FAIL '+runs.at(-1).failure);await writeFile(out+'/results.json',JSON.stringify({build,kind:'Local site at '+base+', headless Metal Chromium on Mac; emulated viewport, not a physical phone.',runs},null,2));
}}finally{await browser.close()}
if(runs.some(r=>!r.pass))process.exitCode=1;
