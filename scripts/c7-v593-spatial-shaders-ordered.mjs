import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/c7-v593-spatial-shaders-ordered';await mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,args:['--use-angle=metal']}),p=await b.newPage({viewport:{width:1440,height:900}}),rows=[],pixels=[],errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await p.waitForSelector('body.ready',{timeout:90000});
const stats=await p.evaluate(async()=>{
 const w=sceneLab,T=await import('three');w.renderer.setAnimationLoop(null);w.scene.updateMatrixWorld(true);
 const objects=[...w.ground.userData.terrainChunks.tiles];for(const group of[w.grass,w.farGrass])group?.traverse(o=>{if(o.isMesh)objects.push(o)});
 const copies=new Map(),selected=[];
 for(const mesh of objects){const box=mesh.geometry.boundingBox?.clone();if(!box)continue;box.applyMatrix4(mesh.matrixWorld);box.min.z=85+(box.min.z-85)/2.1;box.max.z=85+(box.max.z-85)/2.1;
  const overlaps=(xmin,xmax,zmin,zmax)=>box.max.x>=xmin&&box.min.x<=xmax&&box.max.z>=zmin&&box.min.z<=zmax;
  if(overlaps(-331,331,-406,-124)||overlaps(-601,-259,-801,-439))continue;
  const source=mesh.material;let next=copies.get(source);
  if(!next){const data=source.userData;source.userData={};next=source.clone();source.userData=data;next.userData=data;const old=source.onBeforeCompile,key=source.customProgramCacheKey();next.onBeforeCompile=function(s,r){old.call(this,s,r);const needle='vec2 c7SkyHorizon(vec3 world,int lightIndex,float canopy){';if(!s.fragmentShader.includes(needle))throw Error('Missing horizon function');s.fragmentShader=s.fragmentShader.replace(needle,needle+'\n return vec2(1.,0.);');};next.customProgramCacheKey=()=>key+'|outside-horizon-domain';copies.set(source,next);}
  selected.push({mesh,source,next});
 }
 const sourceIDs=new Map([...copies].map(([source,next])=>[next,source.id]));w.renderer.setOpaqueSort((a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||(sourceIDs.get(a.material)??a.material.id)-(sourceIDs.get(b.material)??b.material.id)||a.z-b.z||a.id-b.id);window.spatial={selected,copies};window.mode=async enabled=>{for(const o of selected)o.mesh.material=enabled?o.next:o.source;await w.renderer.compileAsync(w.scene,w.camera)};
 return{selected:selected.length,total:objects.length,materials:copies.size,byName:selected.map(o=>o.mesh.name)};
});
for(const enabled of[false,true,true,false]){rows.push(await p.evaluate(async enabled=>{await mode(enabled);const w=sceneLab;const run=async ms=>{let first,last,n=0;await new Promise(resolve=>requestAnimationFrame(function tick(t){first??=t;last=t;w.render(.5-.5*Math.cos((t-first)/ms*2*Math.PI),t/1000);n++;if(t-first<ms)requestAnimationFrame(tick);else resolve()}));return(n-1)*1000/(last-first)};await run(1200);return{enabled,fps:await run(6500),glError:w.renderer.getContext().getError()};},enabled));console.log(rows.at(-1));}
for(const phase of[0,.07,.15,.3,.5,.7,.88,1]){pixels.push(await p.evaluate(async phase=>{const w=sceneLab,gl=w.renderer.getContext(),grab=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};await mode(false);w.set({sun:phase,move:phase,time:0});const a=grab();await mode(true);w.set({sun:phase,move:phase,time:0});const c=grab();let diff=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-c[i]);diff+=d>0;max=Math.max(max,d)}return{phase,diff,max,glError:gl.getError()};},phase));}
await writeFile(out+'/results.json',JSON.stringify({stats,rows,pixels,errors},null,2));console.log({pixels,errors});
}finally{await b.close();}
if(errors.length||rows.some(r=>r.glError))process.exitCode=1;
