import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source=process.env.QA_SOURCE,output=process.env.QA_OUTPUT;
if(!source||!output)throw new Error('QA_SOURCE and QA_OUTPUT required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null)});
 for(const variant of['baseline','sky-last','vegetation-first','baseline-repeat']){
  const result=await page.evaluate(async variant=>{
   const s=sceneLab;s.atmosphere.mesh.renderOrder=variant==='baseline'||variant==='baseline-repeat'?-100:100;
   for(const group of[s.grass,s.farGrass,s.trees])group.traverse(o=>{if(o.isMesh)o.renderOrder=variant==='vegetation-first'?-10:0});
   s.lake.mesh.renderOrder=variant==='vegetation-first'?-20:0;
   s.set({});const intervals=[],cpu=[];let last=performance.now(),start=last;
   await new Promise(resolve=>{function frame(now){intervals.push(now-last);last=now;const t=performance.now();s.renderer.render(s.scene,s.camera);cpu.push(performance.now()-t);if(intervals.length<24||now-start<1300)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});
   const stat=a=>{const v=a.slice(3).sort((a,b)=>a-b);return{n:v.length,median:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]}};
   return{variant,intervalMs:stat(intervals),cpuMs:stat(cpu)};
  },variant);await page.screenshot({path:`${output}/${variant}.png`});results.push(result);
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,results,kind:'Opaque depth-order diagnostic on this Mac. Static frames, no device claim.'},null,2))}
console.log({errors,results});
