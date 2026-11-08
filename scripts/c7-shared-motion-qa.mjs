import {chromium} from 'playwright';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3037';if(!output)throw Error('QA_OUTPUT required');await mkdir(output,{recursive:true});
const build=process.env.QA_LOCAL_MANIFEST?JSON.parse(await readFile(process.env.QA_LOCAL_MANIFEST,'utf8')):await(await fetch(base+'/c7-build.json')).json();for(const[f,h]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(f)).digest('hex')!==h)throw Error('Stale '+f);
if(process.env.QA_PACKAGE_MANIFEST){const manifest=JSON.parse(await readFile(process.env.QA_PACKAGE_MANIFEST,'utf8'));for(const row of manifest.files){const response=await fetch(base+'/'+row.file);if(!response.ok||createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==row.sha256)throw Error('Served package mismatch '+row.file);}}
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[];
try{for(const[width,height]of[[390,844],[1440,900],[2560,1080]]){
 const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,recordVideo:{dir:output,size:{width:Math.min(960,width),height:Math.round(height*Math.min(960,width)/width)}}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor({timeout:30000});await p.evaluate(()=>document.fonts.ready);
 const samples=await p.evaluate(async()=>{
  const max=document.documentElement.scrollHeight-innerHeight,a=[['hero',0],['about',.16],['process',.3],['services',.47],['cases',.66],['testimonials',.83],['contacts',.93]].map(([id,v])=>[Math.min(max,document.getElementById(id).offsetTop),v]);a.push([max,1]);
  const yFor=v=>{for(let i=0;i<a.length-1;i++){const l=a[i],r=a[i+1];if(v<=r[1])return l[0]+(r[0]-l[0])*(v-l[1])/(r[1]-l[1]);}return max;};const result=[];
  for(const reverse of[false,true]){await new Promise(resolve=>{const start=performance.now();let last=0;function tick(now){const t=Math.min(1,(now-start)/14000),phase=reverse?1-t:t;scrollTo({top:yFor(phase),behavior:'instant'});if(now-last>180){last=now;const d=JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug);result.push({t:now-start,reverse,phase,exact:d.exactProgress,smooth:d.smoothProgress,camera:d.camera,solar:d.solar,frames:d.frames,suspended:d.renderSuspended});}if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});await new Promise(r=>setTimeout(r,700));}
  return result;
 });
 await p.screenshot({path:output+'/'+width+'-returned.jpg',type:'jpeg',quality:80});const final=await p.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug));const pass=!errors.length&&final.exactProgress===0&&final.smoothProgress<.002&&samples.every(s=>s.camera.every(Number.isFinite));
 const video=await p.video().path();await c.close();await rename(video,output+'/'+width+'-down-up.webm');runs.push({width,height,pass,errors,samples,final:{exact:final.exactProgress,smooth:final.smoothProgress}});console.log(width,pass?'PASS technical; visual review separate':'FAIL');
 await writeFile(output+'/results.json',JSON.stringify({build,kind:'Mac Chromium viewport video; desktop video downscaled to960px. Instrumented recording, not FPS or physical-device acceptance.',runs},null,2));
}}finally{await browser.close();}if(runs.some(r=>!r.pass))process.exitCode=1;
