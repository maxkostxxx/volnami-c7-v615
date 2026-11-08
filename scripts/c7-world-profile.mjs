import {chromium} from 'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/shared-world-v395-profile';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:120000});
 const runs=[];
 for(const dpr of [1.5,1,1.25,1.25,1,1.5]){
  const result=await page.evaluate(async dpr=>{
   const s=sceneLab;s.renderer.setPixelRatio(dpr);s.renderer.setSize(1440,900,false);s.set({sun:0,move:0,time:0});
   const cpu=[],intervals=[],draws=[];let start,last,count=0;
   await new Promise(resolve=>requestAnimationFrame(function frame(ms){
    start??=ms;if(last!==undefined)intervals.push(ms-last);last=ms;
    const p=Math.min(1,(ms-start)/4000),before=performance.now();s.render(p,p*4);cpu.push(performance.now()-before);draws.push(s.state.calls);count++;
    if(p<1)requestAnimationFrame(frame);else resolve();
   }));
   const sorted=intervals.slice().sort((a,b)=>a-b),c=cpu.slice().sort((a,b)=>a-b);
   return{dpr,frames:count,duration:last-start,fps:intervals.length*1000/(last-start),medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],cpuMedian:c[Math.floor(c.length*.5)],cpuP95:c[Math.floor(c.length*.95)],draws};
  },dpr);runs.push(result);
 }
 await writeFile(out+'/results.json',JSON.stringify({kind:'Paired DPR diagnostic; headless Chromium ANGLE Metal on this Mac; not mobile/device acceptance',errors,runs},null,2));console.log({errors,runs:runs.map(({draws,...r})=>r)});
}finally{await browser.close();}
