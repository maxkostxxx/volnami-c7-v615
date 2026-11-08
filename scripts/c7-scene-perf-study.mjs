import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT,source=process.env.QA_SOURCE;
if(!output||!source)throw new Error('QA_OUTPUT / QA_SOURCE required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
let result;
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);
 await page.waitForSelector('body.ready',{timeout:90000});
 result=await page.evaluate(async()=>{
  const T=await import('three'),s=sceneLab,r=s.renderer,gl=r.getContext();r.setAnimationLoop(null);
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pivot=new T.Vector3(...s.state.target),receivers=[];
  s.scene.traverse(o=>{if(o.receiveShadow)receivers.push(o)});
  const records=[];
  for(const variant of['main','main+reflection','no-near','no-far','no-grass','no-aerial','no-received-shadows','main-repeat']){
   s.grass.visible=!['no-near','no-grass'].includes(variant);s.farGrass.visible=!['no-far','no-grass'].includes(variant);
   s.aerial.setParams({enabled:variant==='no-aerial'?0:1});
   for(const o of receivers)o.receiveShadow=variant!=='no-received-shadows';
   await r.compileAsync(s.scene,s.camera);for(let i=0;i<3;i++)r.render(s.scene,s.camera);
   const cpu=[],intervals=[],queries=[];let last=performance.now(),start=last;
   await new Promise(resolve=>{
    function frame(now){intervals.push(now-last);last=now;r.info.reset();const q=ext?gl.createQuery():null;
     if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
     const before=performance.now();if(variant==='main+reflection')s.lake.reflect(r,s.scene,s.camera,pivot);r.render(s.scene,s.camera);cpu.push(performance.now()-before);
     if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(q)}
     if(cpu.length<24||now-start<1300)requestAnimationFrame(frame);else resolve();
    }requestAnimationFrame(frame);
   });
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const gpu=[];for(const q of queries){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q)}
   const stats=a=>{const b=a.slice(3).sort((a,b)=>a-b);return{n:b.length,median:b[Math.floor(b.length*.5)],p95:b[Math.floor(b.length*.95)]}};
   records.push({variant,cpuMs:stats(cpu),intervalMs:stats(intervals),gpuMs:stats(gpu),calls:r.info.render.calls,triangles:r.info.render.triangles});
  }
  return{gpuTimer:!!ext,renderer:gl.getParameter(gl.VERSION),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],records};
 });
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,kind:'Diagnostic omission A/B, not accepted visuals; headless Chromium on this Mac, viewport only',errors,result},null,2));}
console.log(JSON.stringify({errors,result},null,2));
