import {chromium,firefox,webkit} from 'playwright';import fs from 'node:fs/promises';
const output=process.env.QA_OUTPUT,url=process.env.QA_URL,engine=process.env.QA_ENGINE||'chromium';if(!output||!url)throw Error('QA_OUTPUT/QA_URL required');await fs.mkdir(output,{recursive:true});
const b=await({chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{args:['--use-angle=metal']}:{})}),p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.route('**/grass-preparation-check.html',r=>r.fulfill({contentType:'text/html',body:'<html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><canvas></canvas></html>'}));await p.goto(url+'/grass-preparation-check.html');
 const rows=await p.evaluate(async()=>{
  const T=await import('three'),candidate=await import('/lab/c7-scene/grass-static.js'),baseline=await import('/backups/c7-v600-start-2026-10-29/files/lab/c7-scene/grass-static.js');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')}),gl=renderer.getContext(),rows=[];
  function fixture(){return[11,7,13].map((count,k)=>{const g=new T.InstancedBufferGeometry(),g2=new T.InstancedBufferGeometry(),root=new Float32Array(count*3),shape=new Float32Array(count*4),normal=new Float32Array(count*3),order=new Float32Array(count);for(let i=0;i<count;i++){root.set([i*.31-k,1,(i-3)*.57+k],i*3);shape.set([.4,.03,(i+k)*.73,.8],i*4);normal.set([.2,1,-.15],i*3);order[i]=i/count;}for(const [name,array,size]of [['aRoot',root,3],['aShape',shape,4],['aTerrainNormal',normal,3],['aOrder',order,1]]){const a=new T.InstancedBufferAttribute(array,size);g.setAttribute(name,a);g2.setAttribute(name,a);}return{count,geometries:[g,g2]};});}
  const snapshot=patches=>patches.map(p=>Object.fromEntries(Object.entries(p.geometries[0].attributes).map(([n,a])=>[n,{size:a.itemSize,data:Array.from(a.array)}])));
  const assert=(x,m)=>{if(!x)throw Error(m);};
  const dispose=p=>p.forEach(p=>p.geometries.forEach(g=>g.dispose()));
  const names=['Buffer','VertexArray','TransformFeedback','Program','Shader'],methods=new Map(),live=new Set();
  for(const name of names){const create='create'+name,del='delete'+name,a=gl[create],d=gl[del];methods.set(create,a);methods.set(del,d);gl[create]=function(...args){const o=a.apply(this,args);if(o)live.add(o);return o;};gl[del]=function(o){live.delete(o);return d.call(this,o);};}
  try{
   const a=fixture(),c=fixture();baseline.prepareGrassStatic(renderer,a,2.1);const stats=await candidate.prepareGrassStatic(renderer,c,2.1,{maxBatchBlades:13});assert(JSON.stringify(snapshot(a))===JSON.stringify(snapshot(c)),'Prepared attributes differ');assert(live.size===0,'GL objects survived success');assert(c.every(p=>p.geometries[0].attributes.aTerrainNormal===p.geometries[1].attributes.aTerrainNormal),'LOD attributes not shared');rows.push({name:'legacy/three-batch attributes exact',pass:true,stats});dispose(a);dispose(c);
   for(const fault of ['compile','link','readback','abort']){
    const patches=fixture(),before=JSON.stringify(snapshot(patches)),controller=new AbortController(),saved=[];let reads=0,caught;
    const replace=(name,fn)=>{const old=gl[name];saved.push([name,old]);gl[name]=fn(old);};
    if(fault==='compile')replace('getShaderParameter',old=>function(s,key){return key===gl.COMPILE_STATUS?false:old.call(this,s,key)});
    if(fault==='link')replace('getProgramParameter',old=>function(p,key){return key===gl.LINK_STATUS?false:old.call(this,p,key)});
    if(fault==='readback'||fault==='abort')replace('getBufferSubData',old=>function(...args){if(fault==='readback'&&++reads===2)throw Error('Injected readback failure');const r=old.apply(this,args);if(fault==='abort')queueMicrotask(()=>controller.abort());return r;});
    try{await candidate.prepareGrassStatic(renderer,patches,2.1,{signal:controller.signal,maxBatchBlades:13});}catch(e){caught={name:e.name,message:e.message};}finally{for(const[name,fn]of saved)gl[name]=fn;}
    assert(caught,'Fault did not reject: '+fault);if(fault==='abort')assert(caught.name==='AbortError','Wrong abort');assert(JSON.stringify(snapshot(patches))===before,'Partial attribute mutation: '+fault);assert(live.size===0,'Leaked GL objects: '+fault);assert(gl.getError()===0,'GL error: '+fault);
    await candidate.prepareGrassStatic(renderer,patches,2.1,{maxBatchBlades:13});assert(live.size===0,'Retry leak');dispose(patches);rows.push({name:fault+' rollback and retry',pass:true,error:caught});
   }
   const preController=new AbortController(),prePatches=fixture();preController.abort();let error;try{await candidate.prepareGrassStatic(renderer,prePatches,2.1,{signal:preController.signal});}catch(e){error=e.name;}assert(error==='AbortError','pre-abort');assert(live.size===0,'pre-abort allocated GL');dispose(prePatches);rows.push({name:'pre-abort',pass:true});
   const {createGrass}=await import('/lab/c7-scene/grass.js'),make=()=>createGrass({heightAt:()=>1,shoreDistance:(x,z)=>Math.abs(x)<2&&Math.abs(z-25)<2?10:-10,quality:'low',depthStretch:2.1});
   const grass=make();assert(grass.children.length>0,'Standalone fixture empty');assert(!grass.children[0].material.userData.staticPrepared,'Standalone original path missing');await grass.userData.prepareStatic(renderer,{maxBatchBlades:16});assert(grass.children[0].material.userData.staticPrepared,'Standalone preparation flag');let repeated=false;try{await grass.userData.prepareStatic(renderer);}catch{repeated=true;}assert(repeated,'Repeat preparation accepted');grass.userData.dispose();rows.push({name:'standalone createGrass and one-shot preparation',pass:true});
   const dying=make(),preparing=dying.userData.prepareStatic(renderer,{maxBatchBlades:16});dying.userData.dispose();let aborted;try{await preparing;}catch(e){aborted=e.name;}assert(aborted==='AbortError','Dispose did not cancel preparation');assert(!dying.userData.staticPreparation&&!dying.userData.preparingStatic,'Disposed preparation committed');assert(live.size===0,'Dispose leaked GL');rows.push({name:'standalone disposal cancels preparation',pass:true});
  }finally{for(const[name,fn]of methods)gl[name]=fn;renderer.dispose();renderer.forceContextLoss();}
  return rows;
 });await fs.writeFile(output+'/results.json',JSON.stringify({engine,rows,errors},null,2));console.log({engine,tests:rows.length,errors});
}finally{await b.close();}
