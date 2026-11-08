import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/shared-world-v398-gpu';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),errors=[],runs=[];
try{for(const [width,height]of [[390,844],[1440,900],[2560,1080]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze'+(width<720?'&quality=low':''));await page.waitForSelector('body.ready',{timeout:120000});
 runs.push(await page.evaluate(async({width,height})=>{
  const s=sceneLab,gl=s.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  const pending=[],gpu=[],cpu=[],intervals=[],checkpoints=[];let start,last,disjoint=0;
  function collect(){if(ext&&gl.getParameter(ext.GPU_DISJOINT_EXT)){disjoint++;for(const q of pending)gl.deleteQuery(q);pending.length=0;return;}while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift();gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
  for(let i=0;i<6;i++){s.render(i/5,i);await new Promise(requestAnimationFrame)}
  await new Promise(resolve=>requestAnimationFrame(function frame(t){start??=t;if(last!==undefined)intervals.push(t-last);last=t;collect();const q=ext&&pending.length<4?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const a=performance.now(),p=Math.min(1,(t-start)/6000);s.render(p,p*6);cpu.push(performance.now()-a);if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(q);}if(checkpoints.length<=Math.floor(p*10))checkpoints.push({p,calls:s.state.calls,triangles:s.state.triangles,reflection:s.state.reflectionRendered});if(p<1)requestAnimationFrame(frame);else resolve();}));
  for(let i=0;i<30&&pending.length;i++){await new Promise(requestAnimationFrame);collect()}for(const q of pending)gl.deleteQuery(q);
  const stats=a=>{const b=a.slice().sort((x,y)=>x-y);return{n:b.length,median:b[Math.floor(b.length*.5)],p95:b[Math.floor(b.length*.95)]}};
  return{width,height,gpuSupported:!!ext,device:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unknown',disjoint,fps:intervals.length*1000/(last-start),cpu:stats(cpu),gpu:stats(gpu),raf:stats(intervals),checkpoints};
 },{width,height}));await page.close();console.log(runs.at(-1));
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Isolated lab world, full solar/travel cycle6s, no dev server or parallel GPU jobs; emulated sizes on Mac, not phone.',errors,runs},null,2));}
