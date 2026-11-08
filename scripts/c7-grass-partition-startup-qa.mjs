import {verifiedBuild} from './c7-qa-build.mjs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT??'evidence/grass-local-frustum-v486-startup';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3097';
const candidate='lab/c7-snapshots/grass-local-frustum-v486';
const build=await verifiedBuild(base);
const candidateHash=createHash('sha256').update(await readFile(candidate+'/grass.js')).digest('hex');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const runs=[];
try {
 for(const mode of ['baseline','candidate','candidate','baseline']) {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  if(mode==='candidate')for(const file of ['grass.js']) {
   const body=(await readFile(candidate+'/'+file,'utf8')).replace(/(['"])three\1/g,"'./vendor/three/three.module.js'");
   await context.route('**/runtime-v395/'+file,r=>r.fulfill({contentType:'application/javascript',body}));
  }
  await context.addInitScript(()=>{
   window.startupTasks=[];
   new PerformanceObserver(list=>{for(const e of list.getEntries())startupTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
   document.addEventListener('DOMContentLoaded',()=>{
    new MutationObserver((_,observer)=>{if(document.querySelector('.c7-landscape.is-ready')){window.readyAt=performance.now();observer.disconnect();}}).observe(document.documentElement,{subtree:true,attributes:true});
   });
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto(base+'/c7/?c7-debug#cases',{waitUntil:'domcontentloaded'});
  await page.locator('.c7-landscape.is-ready').waitFor({timeout:45000});
  const result=await page.evaluate(()=>({readyAt,tasks:startupTasks.filter(e=>e.start<readyAt),maxTask:Math.max(0,...startupTasks.filter(e=>e.start<readyAt).map(e=>e.duration)),state:JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug)}));
  runs.push({mode,errors,...result});console.log({mode,readyAt:result.readyAt,maxTask:result.maxTask,errors});
  await context.close();
 }
}finally{
 await browser.close();
 await writeFile(output+'/results.json',JSON.stringify({build,candidateHash,kind:'B/C/C/B, new contexts, production DOM with explicit candidate module overrides, Mac Chromium; not phone or frame-rate acceptance',runs},null,2));
}
if(runs.length!==4||runs.some(r=>r.errors.length))process.exitCode=1;
