import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/cooperative-geometry-v437-abort';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3027/lab/c7-snapshots/cooperative-geometry-v437/shared.html?clean&freeze&quality=low');
 await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null);sceneLab.dispose();});
 for(const stage of ['terrain','trees'])runs.push(await page.evaluate(async stage=>{
  const T=await import('three'),{createC7Scene}=await import('./world.js');
  const controller=new AbortController(),canvas=document.createElement('canvas');
  const setAttribute=T.BufferGeometry.prototype.setAttribute,add=T.Object3D.prototype.add;
  const tracked=new Set(),released=new Set();let triggered=false,treeCount=0;
  function track(geometry){if(!tracked.has(geometry)){tracked.add(geometry);geometry.addEventListener('dispose',()=>released.add(geometry));}}
  T.BufferGeometry.prototype.setAttribute=function(name,value){
   if(stage==='terrain'&&name==='aShore'){
    track(this);
    if(!triggered){triggered=true;setTimeout(()=>controller.abort(),0);}
   }
   return setAttribute.call(this,name,value);
  };
  T.Object3D.prototype.add=function(...objects){
   if(stage==='trees')for(const object of objects)if(/^(column|round)-tree-/.test(object.name)){
    treeCount++;object.traverse(child=>{if(child.geometry)track(child.geometry);});
    if(!triggered){triggered=true;setTimeout(()=>controller.abort(),0);}
   }
   return add.apply(this,objects);
  };
  let error,returned=false;
  try{await createC7Scene({canvas,width:390,height:844,low:true,signal:controller.signal});returned=true;}
  catch(e){error={name:e.name,message:e.message};}
  finally{T.BufferGeometry.prototype.setAttribute=setAttribute;T.Object3D.prototype.add=add;}
  const atReject={allocated:tracked.size,disposed:released.size,treeCount};
  await new Promise(r=>setTimeout(r,150));
  return{stage,triggered,returned,error,atReject,after:{allocated:tracked.size,disposed:released.size,treeCount},contextLost:canvas.getContext('webgl2').isContextLost()};
 },stage));
}finally{await browser.close();}
const pass=!errors.length&&runs.length===2&&runs.every(r=>r.triggered&&!r.returned&&r.error?.name==='AbortError'&&r.contextLost&&r.atReject.allocated>0&&r.atReject.allocated===r.atReject.disposed&&JSON.stringify(r.atReject)===JSON.stringify(r.after));
await writeFile(out+'/results.json',JSON.stringify({pass,kind:'Targeted resources in two newly yielded preparation phases; not a whole-process memory proof',errors,runs},null,2));
console.log({pass,errors,runs});if(!pass)process.exitCode=1;
