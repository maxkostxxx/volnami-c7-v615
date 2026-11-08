import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/shared-world-v395-grass-profile';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:120000});
 for(const mode of ['baseline','no-near','no-far','no-grass','no-shadow','baseline']){
  runs.push(await page.evaluate(async mode=>{
   const s=sceneLab;s.grass.visible=!['no-near','no-grass'].includes(mode);s.farGrass.visible=!['no-far','no-grass'].includes(mode);s.renderer.shadowMap.enabled=mode!=='no-shadow';s.set({sun:0,move:0,time:0});await s.renderer.compileAsync(s.scene,s.camera);
   const intervals=[],cpu=[];let start,last,count=0;
   await new Promise(resolve=>requestAnimationFrame(function frame(ms){start??=ms;if(last!==undefined)intervals.push(ms-last);last=ms;const p=Math.min(1,(ms-start)/4000),a=performance.now();s.render(p,p*4);cpu.push(performance.now()-a);count++;if(p<1)requestAnimationFrame(frame);else resolve();}));
   const sorted=intervals.slice().sort((a,b)=>a-b),c=cpu.slice().sort((a,b)=>a-b),gl=s.renderer.getContext();
   return{mode,fps:intervals.length*1000/(last-start),frames:count,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],cpuMedian:c[Math.floor(c.length*.5)],programsLinked:s.renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS))};
  },mode));
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Diagnostic omissions, NOT release candidates; same Mac, emulated viewport',errors,runs},null,2));console.log({errors,runs});}
