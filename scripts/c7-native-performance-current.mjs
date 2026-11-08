if (process.env.QA_ALLOW_VISIBLE_BROWSER !== '1') throw new Error('Visible browser QA is disabled: the user is working. Run headless checks; obtain explicit permission before a foreground test.');
import {verifiedBuild} from './c7-qa-build.mjs'
// Native visible desktop measurements. No viewport, DPR or CSS-scale emulation.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
const output=process.env.QA_OUTPUT;
assert.ok(output,'QA_OUTPUT required');
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3037';
const seconds=Number(process.env.QA_SECONDS??60),repeats=Number(process.env.QA_RUNS??3);
await mkdir(output,{recursive:true});
const build=await verifiedBuild(base);
for(const[file,hash]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash,'stale '+file);
const result={build,method:'Visible Chromium on this Mac, viewport:null, no DPR/viewport/CSS zoom overrides. Normal C7 page and debug state. 3s warmup, separate rAF cadence and actual world frames. No GPU time claim. Other user applications not controlled; IAB C7 paused and no other QA browser running.',environment:{cpu:os.cpus()[0].model,platform:os.platform(),release:os.release(),thermal:'not measured',displayRefresh:'not independently measured'},seconds,repeats,runs:[],errors:[]};
const browser=await chromium.launch({headless:false,args:['--use-angle=metal','--window-size=1480,1000']});
result.environment.browser=browser.version();
try{
 const page=await browser.newPage({viewport:null});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text())});
 await page.goto(base+'/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:30000});
 result.environment.window=await page.evaluate(()=>{
  const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],dpr:devicePixelRatio,screen:[screen.width,screen.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
 });
 for(const mode of ['process-idle','whole-page-scroll'])for(let repeat=0;repeat<repeats;repeat++){
  await page.locator(mode==='process-idle'?'#process':'#hero').evaluate(e=>scrollTo({top:e.offsetTop,behavior:'instant'}));
  await page.waitForTimeout(3000);
  const run=await page.evaluate(async({mode,seconds})=>{
   const host=document.querySelector('.c7-landscape'),read=()=>JSON.parse(host.dataset.c7Debug),max=document.documentElement.scrollHeight-innerHeight;
   const initial=read(),intervals=[],activeIntervals=[],checkpoints=[];let start,last,previous=initial,suspended=0,hiddenSamples=0;
   await new Promise(resolve=>requestAnimationFrame(function tick(t){
    start??=t;const elapsed=t-start,state=read();
    if(last!==undefined){intervals.push(t-last);if(!state.renderSuspended&&!previous.renderSuspended)activeIntervals.push(t-last)}
    last=t;previous=state;if(state.renderSuspended)suspended++;if(document.visibilityState!=='visible')hiddenSamples++;
    if(checkpoints.length<=Math.floor(elapsed/5000))checkpoints.push({elapsed,frames:state.frames,phase:state.exactProgress,smooth:state.smoothProgress,travel:state.travel,suspended:state.renderSuspended});
    // Six smooth full-page round trips in a60s run. Native document scroll.
    if(mode==='whole-page-scroll')scrollTo({top:max*(.5-.5*Math.cos(elapsed/10000*2*Math.PI)),behavior:'instant'});
    if(elapsed<seconds*1000)requestAnimationFrame(tick);else resolve();
   }));
   const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return{n:s.length,median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};
   const final=read();return{duration:last-start,rafFPS:intervals.length*1000/(last-start),actualRenderedFPS:(final.frames-initial.frames)*1000/(last-start),activeRafMs:stats(activeIntervals),allRafMs:stats(intervals),suspendedSamples:suspended,hiddenSamples,quality:final.quality,geometryQuality:final.geometryQuality,checkpoints};
  },{mode,seconds});
  result.runs.push({mode,repeat,...run});
  console.log(JSON.stringify({mode,repeat,fps:run.actualRenderedFPS,active:run.activeRafMs,hidden:run.hiddenSamples}));
  await writeFile(output+'/results.json',JSON.stringify(result,null,2));
 }
 assert.equal(result.errors.length,0);assert.ok(result.runs.every(r=>r.hiddenSamples===0));
 result.measurementComplete=true;
 result.performanceBudgetPass=result.runs.every(r=>r.activeRafMs.median<=16.75&&r.activeRafMs.p95<=25);
}catch(error){result.failure=String(error);process.exitCode=1;console.error(error)}finally{
 await browser.close();await writeFile(output+'/results.json',JSON.stringify(result,null,2));
}
