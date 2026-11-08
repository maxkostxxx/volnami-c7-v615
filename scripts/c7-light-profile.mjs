import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/runtime-profile-v396';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),errors=[],runs=[];
try{
 for(const mode of ['baseline','canopy','atlas','environment','baseline']){
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('http://127.0.0.1:3027/lab/c7-snapshots/runtime-profile-v396/shared.html?clean&freeze&profile='+mode);await page.waitForSelector('body.ready',{timeout:120000});
  runs.push(await page.evaluate(async mode=>{
   const s=sceneLab,intervals=[],cpu=[];let start,last,count=0;
   await new Promise(resolve=>requestAnimationFrame(function frame(ms){start??=ms;if(last!==undefined)intervals.push(ms-last);last=ms;const p=Math.min(1,(ms-start)/4000),a=performance.now();s.render(p,p*4);cpu.push(performance.now()-a);count++;if(p<1)requestAnimationFrame(frame);else resolve();}));
   const sorted=intervals.slice().sort((a,b)=>a-b),c=cpu.slice().sort((a,b)=>a-b),gl=s.renderer.getContext();
   return{mode,fps:intervals.length*1000/(last-start),frames:count,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],cpuMedian:c[Math.floor(c.length*.5)],programsLinked:s.renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS))};
  },mode));await page.close();
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Frozen light subsystems are intentionally wrong, diagnostic only; Mac Chromium, not device acceptance',errors,runs},null,2));console.log({errors,runs});}
