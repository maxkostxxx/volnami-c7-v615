import {chromium} from 'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/cooperative-grass-v405-abort';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto((process.env.QA_URL??'http://127.0.0.1:3027/lab/c7-snapshots/cooperative-grass-v405/shared.html')+'?clean&freeze&quality=low');await p.waitForSelector('body.ready',{timeout:120000});
 const result=await p.evaluate(async()=>{
  sceneLab.renderer.setAnimationLoop(null);sceneLab.dispose();
  const T=await import('three'),{createC7Scene}=await import('./world.js');
  const original=T.BufferGeometry.prototype.setAttribute,controller=new AbortController(),canvas=document.createElement('canvas');document.body.append(canvas);
  let allocated=0,disposed=0,triggered=false;const seen=new Set();
  T.BufferGeometry.prototype.setAttribute=function(name,value){if(name==='aRoot'&&!seen.has(this)){seen.add(this);allocated++;this.addEventListener('dispose',()=>disposed++);if(!triggered){triggered=true;setTimeout(()=>controller.abort(),0);}}return original.call(this,name,value);};
  let error,returned=false;
  try{await createC7Scene({canvas,width:390,height:844,low:true,signal:controller.signal});returned=true;}catch(e){error=e.name;}finally{T.BufferGeometry.prototype.setAttribute=original;}
  const atReject={allocated,disposed};await new Promise(r=>setTimeout(r,150));
  return{triggered,returned,error,atReject,after:{allocated,disposed},contextLost:canvas.getContext('webgl2').isContextLost()};
 });const pass=!errors.length&&result.triggered&&!result.returned&&result.error==='AbortError'&&result.contextLost&&result.atReject.allocated===result.atReject.disposed&&JSON.stringify(result.atReject)===JSON.stringify(result.after);
 await writeFile(out+'/results.json',JSON.stringify({pass,errors,...result},null,2));console.log({pass,...result});if(!pass)process.exitCode=1;
}finally{await browser.close();}
