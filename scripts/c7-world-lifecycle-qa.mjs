import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/shared-world-v395-lifecycle';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.QA_URL??'http://127.0.0.1:3027/lab/c7-scene/shared.html')+'?clean&freeze');
 await page.waitForSelector('body.ready',{timeout:120000});
 const result=await page.evaluate(async travel=>{
  const s=sceneLab,gl=s.renderer.getContext();
  const hash=async()=>{if(travel===null)s.set({sun:.07,move:0,time:0});else s.render(travel,0);const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',p))).join(',');};
  const before=await hash(),ext=gl.getExtension('WEBGL_lose_context');
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('restore timeout')),10000);
   s.renderer.domElement.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve();},{once:true});
   s.renderer.domElement.addEventListener('webglcontextlost',()=>setTimeout(()=>ext.restoreContext(),100),{once:true});
   ext.loseContext();
  });
  const after=await hash();
  s.renderer.setAnimationLoop(null);
  const memoryBefore={...s.renderer.info.memory};s.dispose();s.dispose();
  const memoryAfter={...s.renderer.info.memory},contextReleased=gl.isContextLost();
  const {createC7Scene}=await import('./world.js');
  const controller=new AbortController();controller.abort();let abortName;
  try{await createC7Scene({canvas:document.createElement('canvas'),signal:controller.signal});}catch(e){abortName=e.name;}
  return{restorePixelsExact:before===after,memoryBefore,memoryAfter,contextReleased,abortName,status:s.status()};
 },process.env.QA_TRAVEL?Number(process.env.QA_TRAVEL):null);
 await writeFile(out+'/results.json',JSON.stringify({kind:'Headless Chromium GPU lifecycle test, not physical mobile',errors,...result},null,2));console.log({errors,...result});
 if(errors.length||!result.restorePixelsExact||!result.contextReleased||result.abortName!=='AbortError'||result.memoryAfter.geometries!==0)process.exitCode=1;
}finally{await browser.close();}
