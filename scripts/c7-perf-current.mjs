import {chromium} from 'playwright'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import os from 'node:os'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT;await mkdir(output,{recursive:true})
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3007',seconds=Number(process.env.QA_SECONDS??60),repeats=Number(process.env.QA_RUNS??3)
const build=await(await fetch(base+'/c7-build.json')).json()
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error('Stale export '+file)
const nativeWindow=process.env.QA_NATIVE==='1'
const browser=await chromium.launch({headless:!nativeWindow,args:['--use-angle=metal',...(nativeWindow?['--window-size=1480,1000']:[])]}),runs=[]
const stats=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return{n:a.length,min:a[0],median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}}
try {
for(const [width,height]of [[390,844],[1440,900],[2560,1080]].filter(([w])=>!process.env.QA_WIDTHS||process.env.QA_WIDTHS.split(',').includes(String(w))))for(const cover of (process.env.QA_COVERS??'on').split(','))for(let repeat=0;repeat<repeats;repeat++){
 const context=await browser.newContext(nativeWindow?{viewport:null}:{viewport:{width,height},deviceScaleFactor:1}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})})
 await page.goto(base+'/c7/?c7-debug'+(cover==='off'?'&c7-cover-off':''),{waitUntil:'domcontentloaded'})
 await page.locator('.c7-landscape.is-ready').waitFor({timeout:30000})
 const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),dpr:devicePixelRatio,cores:navigator.hardwareConcurrency,viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],visibility:document.visibilityState}})
 await page.evaluate(()=>scrollTo({top:document.getElementById('process').offsetTop,behavior:'instant'}))
 await page.waitForTimeout(3000)
 const samples=await page.evaluate(async({seconds,motion})=>{
  const host=document.querySelector('.c7-landscape'),end=motion==='full'?document.documentElement.scrollHeight-innerHeight:document.getElementById('process').offsetTop
  const frames=[],cpu=[],gpu=[],buffers=[],checkpoints=[];let previous=0,lastGPU=-1,lastRender=-1,start
  return new Promise(resolve=>{function tick(t){start??=t;const elapsed=(t-start)/1000;if(previous)frames.push(t-previous);previous=t
   const s=JSON.parse(host.dataset.c7Debug),p=s.performance
   if(p.renderCount!==lastRender){cpu.push(p.cpuMs);buffers.push(p.buffer[0]*p.buffer[1]);lastRender=p.renderCount}
   if(p.gpu.samples!==lastGPU&&p.gpu.ms!==null){gpu.push(p.gpu.ms);lastGPU=p.gpu.samples}
   if(checkpoints.length<=Math.floor(elapsed/5))checkpoints.push({elapsed,exact:s.exactProgress,smooth:s.smoothProgress,...p})
   if(motion)scrollTo({top:end*(.5+.5*Math.cos(elapsed*Math.PI/10)),behavior:'instant'})
   if(elapsed<seconds)requestAnimationFrame(tick);else resolve({frames,cpu,gpu,buffers,checkpoints,final:s,longTasks:window.__longTasks})
  }requestAnimationFrame(tick)})
 },{seconds,motion:process.env.QA_MOTION==='1'?(process.env.QA_FULL==='1'?'full':true):false})
 const result={width:gpu.viewport[0],height:gpu.viewport[1],cover,repeat,seconds,warmupSeconds:3,mode:process.env.QA_MOTION==='1'?(process.env.QA_FULL==='1'?'native document scroll0→finish→0':'native document scroll0→process→0'):'idle process',gpu,errors,rafMs:stats(samples.frames),cpuSubmitMs:stats(samples.cpu),gpuElapsedMs:stats(samples.gpu),bufferPixels:stats(samples.buffers),checkpoints:samples.checkpoints,final:samples.final,longTasks:samples.longTasks,series:{rafMs:samples.frames,cpuMs:samples.cpu,gpuMs:samples.gpu,bufferPixels:samples.buffers}}
 runs.push(result);console.log(JSON.stringify({width,cover,repeat,raf:result.rafMs,gpu:result.gpuElapsedMs,cpu:result.cpuSubmitMs,buffer:result.bufferPixels,errors}))
 await context.close();await writeFile(output+'/results.json',JSON.stringify({build,environment:{cpu:os.cpus()[0].model,platform:os.platform(),release:os.release(),browser:browser.version(),mode:nativeWindow?'Visible native Chromium window on this Mac; no viewport/DPR emulation; not iOS/Android':'Metal hardware-backed headless desktop; viewport390 is not a physical phone',displayRefresh:'not independently measured; rAF cadence reported separately',thermal:'not measured',diagnostics:'c7-debug enabled; CPU figures include diagnostic work'},runs},null,2))
}
}finally{await browser.close()}
if(runs.some(r=>r.errors.length||!r.gpuElapsedMs.n))process.exitCode=1
