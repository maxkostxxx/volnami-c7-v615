import {chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/shared-world-v395-caster-profile';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));const runs=[];
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:120000});
 for(const mode of ['baseline','no-terrain','no-trees','baseline']){
  runs.push(await page.evaluate(async mode=>{
   const s=sceneLab,size=4096;
   for(const light of [s.sunlight,...s.skyLight.lights]){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(size,size);}
   s.ground.castShadow=mode!=='no-terrain';s.trees.traverse(o=>{if(o.isMesh)o.castShadow=mode!=='no-trees';});const beforeRender=s.scene.onBeforeRender;
   if(mode==='frozen')s.scene.onBeforeRender=function(...args){beforeRender.apply(this,args);s.renderer.shadowMap.needsUpdate=false;};
   s.set({sun:0,move:0,time:0});
   const intervals=[],cpu=[],treeCpu=[],calls=[];let start,last,count=0;
   await new Promise(resolve=>requestAnimationFrame(function frame(ms){start??=ms;if(last!==undefined)intervals.push(ms-last);last=ms;const p=Math.min(1,(ms-start)/4000),a=performance.now();s.render(p,p*4);cpu.push(performance.now()-a);treeCpu.push(s.trees.userData.canopyLighting);calls.push(s.state.calls);count++;if(p<1)requestAnimationFrame(frame);else resolve();}));
   s.scene.onBeforeRender=beforeRender;
   const sorted=intervals.slice().sort((a,b)=>a-b),c=cpu.slice().sort((a,b)=>a-b);
   return{mode,fps:intervals.length*1000/(last-start),duration:last-start,frames:count,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],cpuMedian:c[Math.floor(c.length*.5)],cpuP95:c[Math.floor(c.length*.95)],treeCpu,calls};
  },mode));
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Diagnostic only: frozen shadows intentionally WRONG, not a candidate. Same Mac, headless Chromium, no device claims.',errors,runs},null,2));console.log({errors,runs:runs.map(({treeCpu,calls,...r})=>r)});}
