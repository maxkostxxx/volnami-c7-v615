import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/staged-texture-upload-v452-abort';await mkdir(out);
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3027/lab/c7-snapshots/staged-texture-upload-v452/shared.html?clean&freeze&quality=low');
 await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(()=>sceneLab.dispose());
 for(const stopAt of (process.env.QA_DIAGNOSTIC?[1]:[1,5]))runs.push(await page.evaluate(async stopAt=>{
  const T=await import('three'),{createC7Scene}=await import('./world.js');
  const canvas=document.createElement('canvas'),controller=new AbortController();
  const originalAttribute=T.BufferGeometry.prototype.setAttribute;
  const proto=WebGL2RenderingContext.prototype,originalUpload=proto.texSubImage2D;
  const tracked=new Set(),released=new Set(),origins=new Map();let uploads=0,triggered=false,returned=false,error;
  T.BufferGeometry.prototype.setAttribute=function(...args){
   if(!tracked.has(this)){tracked.add(this);origins.set(this,new Error().stack);this.addEventListener('dispose',()=>released.add(this));}
   return originalAttribute.apply(this,args);
  };
  proto.texSubImage2D=function(...args){
   const result=originalUpload.apply(this,args);
   if(this.canvas===canvas&&++uploads===stopAt){triggered=true;setTimeout(()=>controller.abort(),0);}
   return result;
  };
  try{await createC7Scene({canvas,width:390,height:844,low:true,signal:controller.signal});returned=true;}
  catch(e){error={name:e.name,message:e.message};}
  finally{T.BufferGeometry.prototype.setAttribute=originalAttribute;proto.texSubImage2D=originalUpload;}
  // Three allocates an unused VSM blur triangle in the renderer constructor,
  // even with our PCF shadows. It never belongs to the C7 scene. Keep that
  // object explicit; authored ownership is a different assertion.
  const internal=[...tracked].filter(g=>g.type==='BufferGeometry'&&g.attributes.position?.count===3&&origins.get(g).includes('new WebGLShadowMap'));
  const authored=[...tracked].filter(g=>!internal.includes(g));
  const atReject={allocated:tracked.size,disposed:released.size,authoredAllocated:authored.length,authoredDisposed:authored.filter(g=>released.has(g)).length,internalShadowTriangles:internal.length,uploads};
  await new Promise(r=>setTimeout(r,150));
  const unreleased=[...tracked].filter(g=>!released.has(g)).map(g=>({type:g.type,vertices:g.attributes.position?.count,attributes:Object.keys(g.attributes),stack:origins.get(g)}));
  return{unreleased,stopAt,triggered,returned,error,atReject,after:{allocated:tracked.size,disposed:released.size,authoredAllocated:authored.length,authoredDisposed:authored.filter(g=>released.has(g)).length,internalShadowTriangles:internal.length,uploads},contextLost:canvas.getContext('webgl2').isContextLost()};
 },stopAt));
}finally{await browser.close();}
const pass=!errors.length&&runs.length===2&&runs.every(r=>r.triggered&&!r.returned&&r.error?.name==='AbortError'&&r.contextLost&&r.atReject.uploads===r.stopAt&&r.atReject.allocated>0&&r.atReject.authoredAllocated===r.atReject.authoredDisposed&&r.atReject.internalShadowTriangles===1&&r.unreleased.length===1&&r.unreleased[0].stack.includes('new WebGLShadowMap')&&JSON.stringify(r.atReject)===JSON.stringify(r.after));
await writeFile(out+'/results.json',JSON.stringify({pass,kind:'Headless Chromium. Abort timer scheduled by first/fifth actual 2D upload; all authored geometry and released context; one unrendered Three-internal VSM triangle reported separately, not a process-memory measurement.',errors,runs},null,2));
console.log({pass,errors,runs});if(!pass)process.exitCode=1;
