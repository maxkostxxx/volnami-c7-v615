import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out='evidence/dusk-aureole-v421',baseline='lab/c7-scene',candidate='lab/c7-snapshots/dusk-aureole-v421';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const runs=[],errors=[];let restore;
try{
 for(const [i,source] of[baseline,candidate,candidate,baseline].entries()){
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});page.on('pageerror',e=>errors.push({i,message:e.message}));page.on('console',e=>{if(e.type()==='error')errors.push({i,message:e.text()})});
  await page.goto(`http://127.0.0.1:3027/${source}/shared.html?clean&freeze`);await page.waitForSelector('body.ready',{timeout:90000});
  const run=await page.evaluate(()=>new Promise(resolve=>{
   const s=sceneLab;s.renderer.setAnimationLoop(null);s.set({sun:.5});s.set({sun:0});
   const gl=s.renderer.getContext(),originalCompile=gl.compileShader;let shaderCompiles=0;gl.compileShader=function(...args){shaderCompiles++;return originalCompile.apply(this,args)};const start=performance.now(),intervals=[],calls=[],triangles=[];let previous=start;
   function tick(now){const elapsed=now-start,p=Math.min(1,elapsed/4000);intervals.push(now-previous);previous=now;const state=s.set({sun:p,move:p,time:elapsed/1000});calls.push(state.calls);triangles.push(state.triangles);if(elapsed<4000)return requestAnimationFrame(tick);const sorted=intervals.slice(2).sort((a,b)=>a-b);gl.compileShader=originalCompile;resolve({shaderCompiles,durationMs:elapsed,frames:intervals.length,fps:1000*intervals.length/elapsed,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],calls,triangles});}requestAnimationFrame(tick);
  }));runs.push({i,source,...run});await page.close();
 }
}finally{await browser.close();await fs.writeFile(out+'/bench.json',JSON.stringify({kind:'One paired B/C/C/B sequence of actual4s rAF-driven solar+flight+wind+water on this Mac. Not a GPU timer query or device acceptance.',errors,runs,restore},null,2));}
console.log({errors,runs:runs.map(({calls,triangles,...r})=>r),restore});
