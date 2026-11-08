import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT,source=process.env.QA_SOURCE;
if(!output||!source)throw new Error('QA_OUTPUT / QA_SOURCE required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],failed=[],times=[],sunSweep=[];let animation;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()])});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:90000});
 for(const t of[0,15,60,180]){const state=await page.evaluate(time=>sceneLab.set({time}),t);await page.screenshot({path:`${output}/timeline${t}.png`});times.push({time:t,state})}
 for(let i=0;i<=20;i++){
  const phase=i/20;const state=await page.evaluate(sun=>{const start=performance.now(),s=sceneLab.set({sun,time:0});return{...s,updateMs:performance.now()-start,contextLost:sceneLab.renderer.getContext().isContextLost()}},phase);sunSweep.push({phase,state});
  if([0,5,10,15,20].includes(i))await page.screenshot({path:`${output}/sun${phase}.png`});
 }
 await page.goto(`http://127.0.0.1:3027/${source}/?clean`);await page.waitForSelector('body.ready',{timeout:90000});
 animation=await page.evaluate(()=>new Promise(resolve=>{
  const start=performance.now(),startScene=sceneLab.state.time,intervals=[];let previous=start;
  function tick(now){intervals.push(now-previous);previous=now;if(now-start<5000)return requestAnimationFrame(tick);const endScene=sceneLab.state.time,sorted=intervals.slice(2).sort((a,b)=>a-b);resolve({wallSeconds:(now-start)/1000,sceneSeconds:endScene-startScene,driftSeconds:endScene-startScene-(now-start)/1000,frames:intervals.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]});}requestAnimationFrame(tick);
 }));
 await page.screenshot({path:`${output}/actual-5sec.png`});
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,kind:'Headless Chromium on this Mac, viewport emulation. Timeline is deterministic time sampling, not a 180s wall-clock test. Solar21step samples are continuity diagnostics, not proof of smooth interactive FPS. actual5s is an un-frozen wall-clock test.',errors,failed,times,sunSweep,animation},null,2))}
console.log({errors,failed,timeline:times.length,sunSamples:sunSweep.length,animation});
