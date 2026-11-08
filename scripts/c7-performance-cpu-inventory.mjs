import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='evidence/c7-performance-audit-2026-10-29';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const inventory=[];
try {
 for(const width of [390,1440,2560]){
  const height=width===390?844:width===1440?900:1080;
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(`http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze${width===390?'&quality=low':''}`);
  await page.waitForSelector('body.ready',{timeout:90000});
  await page.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null);window.auditFlight=duration=>new Promise(resolve=>{let first,last,count=0,initial=sceneLab.state.frames;const intervals=[];requestAnimationFrame(function tick(t){first??=t;if(last!==undefined)intervals.push(t-last);last=t;sceneLab.render(.5-.5*Math.cos((t-first)/duration*2*Math.PI),t/1000);count++;if(t-first<duration)requestAnimationFrame(tick);else resolve({callbacks:count,renderedFrames:sceneLab.state.frames-initial,elapsedMs:t-first,intervals});});});});
  const samples=[];
  for(const phase of [0,.25,.5,.75,.83,.9,1]){
   samples.push(await page.evaluate(async phase=>{
    const w=sceneLab;w.render(phase,10);await new Promise(r=>requestAnimationFrame(r));w.set({sun:w.solarForTravel(phase),move:phase,time:10});
    const gl=w.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return{phase,...w.diagnostics(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],reflectionSize:[w.lake.target.width,w.lake.target.height],multiDraw:!!gl.getExtension('WEBGL_multi_draw'),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
   },phase));
  }
  inventory.push({width,height,samples});
  await fs.writeFile(out+'/inventory-phases.json',JSON.stringify(inventory,null,2));
  if(width===1440){
   await page.evaluate(()=>auditFlight(2500));
   const client=await page.context().newCDPSession(page);
   await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:1000});await client.send('Profiler.start');
   const frames=await page.evaluate(()=>auditFlight(10000));const{profile}=await client.send('Profiler.stop');
   await fs.writeFile(out+'/cpu-profile.json',JSON.stringify(profile));await fs.writeFile(out+'/cpu-profile-frames.json',JSON.stringify(frames,null,2));
  }
  await page.close();
  console.log({width,phases:samples.length});
 }
}finally{await browser.close();}
