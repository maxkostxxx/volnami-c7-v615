// Finite cropped/full reflection control; leaves product files unchanged.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const out=process.env.QA_OUTPUT,url=process.env.QA_URL;
if(!out||!url)throw Error('QA_OUTPUT and QA_URL required');
const widths=(process.env.QA_WIDTHS||'390,1440,2560').split(',').map(Number);
const phases=(process.env.QA_PHASES||'0,.15,.5,.83,1').split(',').map(Number),times=(process.env.QA_TIMES||'0,3,10,30').split(',').map(Number),rows=[],errors=[];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const html=`<html><head><link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas></canvas><script type="module">import{createC7Scene}from'/3d/c7/runtime-v395/world.js';window.sceneLab=await createC7Scene({canvas:document.querySelector('canvas'),width:innerWidth,height:innerHeight,low:innerWidth===390});sceneLab.render(.5,10);window.ready=true;</script></body></html>`;
try{for(const width of widths){const full=new Map();for(const mode of ['full','cropped']){
 const page=await browser.newPage({viewport:{width,height:width===390?844:width===1440?900:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 if(mode==='full')await page.route('**/runtime-v395/lake.js',async route=>{const response=await route.fetch(),source=await response.text(),needle='cropReflection(camera);';if(source.split(needle).length!==2)throw Error('Crop hook changed');await route.fulfill({response,body:source.replace(needle,'/* diagnostic: full reflection */')});});
 await page.route('**/reflection-control.html',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url+'/reflection-control.html');await page.waitForFunction(()=>window.ready,undefined,{timeout:90000});
 for(const direction of ['forward','reverse'])for(const phase of direction==='forward'?phases:phases.slice().reverse())for(const time of times){
  const c=await page.evaluate(async({phase,time})=>{sceneLab.render(phase,time);sceneLab.render(phase,time);const gl=sceneLab.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);const z=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let b='';for(let i=0;i<z.length;i+=32768)b+=String.fromCharCode(...z.subarray(i,i+32768));return {data:btoa(b),width:gl.drawingBufferWidth,glError:gl.getError()};},{phase,time});
  if(process.env.QA_CAPTURE&&direction==='forward')await page.screenshot({path:`${out}/${mode}-${width}-${phase}-${time}.png`});
  const data=gunzipSync(Buffer.from(c.data,'base64')),key=direction+':'+phase+':'+time;
  if(mode==='full')full.set(key,data);else{const a=full.get(key);let max=0,sum=0,above2=0,above10=0,peak=null;for(let i=0;i<a.length;i+=4){let d=0;for(let k=0;k<3;k++){const v=Math.abs(a[i+k]-data[i+k]);sum+=v;d=Math.max(d,v);}if(d>max){max=d;peak=[i/4%c.width,Math.floor(i/4/c.width),d];}if(d>2)above2++;if(d>10)above10++;}rows.push({width,direction,phase,time,max,meanRGB:sum/(a.length*.75),above2,above10,peakBottomOrigin:peak,glError:c.glError});}
 }
 await page.close();console.log({width,mode,errors:errors.length});await fs.writeFile(out+'/results.json',JSON.stringify({kind:'Finite full versus cropped reflection, both directions, four wave times; numerical differences require review, not automatic visual acceptance.',url,rows,errors},null,2));
}}}finally{await browser.close();}
if(errors.length||rows.some(r=>r.glError))process.exitCode=1;
