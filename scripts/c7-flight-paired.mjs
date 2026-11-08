// Explicit paired full-site benchmark. Counts submitted scene renders, not GPU/presented frames.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=process.env.QA_OUTPUT,baseline=process.env.QA_BASELINE_URL,candidate=process.env.QA_CANDIDATE_URL;
if(!out||!baseline||!candidate)throw Error('QA_OUTPUT, QA_BASELINE_URL, QA_CANDIDATE_URL required');
const widths=(process.env.QA_WIDTHS||'390,1440,2560').split(',').map(Number),order=(process.env.QA_ORDER||'baseline,candidate,candidate,baseline').split(','),warmup=Number(process.env.QA_WARMUP_MS||5000),duration=Number(process.env.QA_SAMPLE_MS||15000);
await fs.mkdir(out,{recursive:true});
const manifests={};for(const url of new Set([baseline,candidate])){const response=await fetch(url+'/c7-build.json');if(!response.ok)throw Error('Build provenance unavailable: '+url);const body=await response.text(),build=JSON.parse(body);manifests[url]={sha256:createHash('sha256').update(body).digest('hex'),sources:build.sources,runtimeRelease:build.runtimeRelease??null};}
const b=await chromium.launch({headless:true,args:['--use-angle=metal']}),rows=[],errors=[];
try{for(const width of widths)for(const mode of order){
 const page=await b.newPage({viewport:{width,height:width===390?844:width===1440?900:1080},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.addInitScript(()=>{window.__c7ShaderCompiles=0;const compile=WebGL2RenderingContext.prototype.compileShader;WebGL2RenderingContext.prototype.compileShader=function(...args){window.__c7ShaderCompiles++;return compile.apply(this,args)};});
 const url=mode==='baseline'?baseline:candidate;await page.goto(url+'/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:90000});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.c7-landscape canvas')).opacity==='1');
 const result=await page.evaluate(async({warmup,duration})=>{
  const host=document.querySelector('.c7-landscape'),max=document.documentElement.scrollHeight-innerHeight,read=()=>JSON.parse(host.dataset.c7Debug);
  const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return {count:s.length,mean:s.reduce((a,b)=>a+b,0)/Math.max(1,s.length),p50:s[Math.min(s.length-1,Math.floor(s.length*.5))],p95:s[Math.min(s.length-1,Math.floor(s.length*.95))],p99:s[Math.min(s.length-1,Math.floor(s.length*.99))]}};
  const run=ms=>new Promise(resolve=>{let start,last,previous=read(),initial=previous,activeMs=0,activeFrames=0,raf=0,excludedMs=0,multiSubmissionIntervals=0;const intervals=[],samples=[];
   requestAnimationFrame(function tick(t){start??=t;const s=read(),delta=Math.max(0,s.frames-previous.frames);if(last!==undefined){const dt=t-last,active=!s.renderSuspended&&!previous.renderSuspended;if(active){activeMs+=dt;activeFrames+=delta;intervals.push(dt);if(delta>1)multiSubmissionIntervals++;}else excludedMs+=dt;samples.push({dt,delta,active,phase:s.smoothProgress,solar:s.solar,suspended:s.renderSuspended});}last=t;previous=s;raf++;
    const v=Math.min(1,(t-start)/ms);scrollTo({top:max*(.5-.5*Math.cos(v*2*Math.PI)),behavior:'instant'});if(v<1)requestAnimationFrame(tick);else resolve({activeSubmittedFPS:activeFrames*1000/activeMs,allSubmittedFPS:(s.frames-initial.frames)*1000/(last-start),rafFPS:(raf-1)*1000/(last-start),activeFrames,activeMs,excludedMs,elapsedMs:last-start,multiSubmissionIntervals,activeRafIntervalMs:stats(intervals),quality:s.quality,samples});
   });
  });await run(warmup);await new Promise(r=>setTimeout(r,500));const compilesBefore=window.__c7ShaderCompiles,result=await run(duration);
  const canvas=host.querySelector('canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{...result,steadyStateShaderCompiles:window.__c7ShaderCompiles-compilesBefore,output:{cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,bufferWidth:gl.drawingBufferWidth,bufferHeight:gl.drawingBufferHeight,pixelRatio:gl.drawingBufferWidth/canvas.clientWidth},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,counterScopes:read().counterScopes??'Legacy v599: environment includes atlas; reflection/main can include shadow updates'};
 },{warmup,duration});rows.push({mode,width,url,...result});await page.close();console.log({mode,width,fps:result.activeSubmittedFPS,p95:result.activeRafIntervalMs.p95,steadyStateShaderCompiles:result.steadyStateShaderCompiles});await fs.writeFile(out+'/results.json',JSON.stringify({baseline,candidate,warmup,duration,order,browserVersion:b.version(),manifests,kind:'Headless Mac Chromium/Metal; emulated viewport; submitted scene renders and rAF intervals, not completed GPU/presented frames. All suspension boundary intervals retained in samples. Shader compile counter does not alter shader code.',rows,errors},null,2));
}}finally{await b.close();}if(errors.length)process.exitCode=1;
