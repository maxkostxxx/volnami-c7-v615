import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/c7-v576-half-light';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');
 await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(async()=>{
  const w=sceneLab;w.renderer.setAnimationLoop(null);window.costT=await import('three');
  const mats=new Map();
  for(const [kind,group]of Object.entries({ground:w.ground,near:w.grass,far:w.farGrass,water:w.lake.mesh,trees:w.trees}))group?.traverse(o=>{
   for(const m of(o.material?[o.material].flat():[]))if(!mats.has(m))mats.set(m,{kind,compile:m.onBeforeCompile,key:m.customProgramCacheKey,keyValue:m.customProgramCacheKey(),fragment:m.fragmentShader});
  });
  window.costMaterials=mats;
 });
 const modes=['baseline','half-core','half-core','baseline'];
 for(const mode of modes){
  const result=await page.evaluate(async mode=>{
   const w=sceneLab,r=w.renderer;
   for(const[m,old]of costMaterials){
    const flat=mode==='flat-all'||mode==='flat-'+old.kind;
    m.onBeforeCompile=function(shader,renderer){old.compile.call(this,shader,renderer);
     if(['ground','near','far'].includes(old.kind)){
      if(mode==='half-core'){
       shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>','precision mediump float;\n#include <lights_physical_pars_fragment>\nprecision highp float;');
      }
      if(mode==='horizon-off'||mode==='shadow-off')shader.fragmentShader=shader.fragmentShader.replace('vec2 c7SkyHorizon(vec3 world,int lightIndex,float canopy){','vec2 c7SkyHorizon(vec3 world,int lightIndex,float canopy){return vec2(1.,1.);');
      if(mode==='shadow-off'){
       let chunk=costT.ShaderChunk.shadowmap_pars_fragment;
       chunk=chunk.replace(/float getShadow\([\s\S]*?\) \{/,'$& return 1.;');
       shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',chunk);
      }
      if(mode==='direct-spec-off'){
       let chunk=costT.ShaderChunk.lights_physical_pars_fragment;
       chunk=chunk.replace(/void RE_Direct_Physical\([\s\S]*?\) \{/,'$& reflectedLight.directDiffuse+=saturate(dot(geometryNormal,directLight.direction))*directLight.color*BRDF_Lambert(material.diffuseColor); return;');
       shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',chunk);
      }
      if(mode==='indirect-spec-off'){
       let chunk=costT.ShaderChunk.envmap_physical_pars_fragment;
       chunk=chunk.replace(/vec3 getIBLRadiance\([\s\S]*?\) \{/,'$& return vec3(0.);');
       shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',chunk);
      }
     }
    };
    m.customProgramCacheKey=()=>old.keyValue+'|v572-'+mode;m.needsUpdate=true;
   }
   w.set({sun:.3,move:.3,time:0});await r.compileAsync(w.scene,w.camera);
   const results=[];
   for(const moving of [true]){
    const run=async(ms,measure)=>{
     let start,last,count=0;const intervals=[],cpu=[];
     await new Promise(resolve=>requestAnimationFrame(function tick(t){
      start??=t;if(last!==undefined)intervals.push(t-last);last=t;
      const phase=moving?(.5-.5*Math.cos((t-start)/ms*2*Math.PI)):.3;
      const before=performance.now();w.render(phase,t/1000);cpu.push(performance.now()-before);count++;
      if(t-start<ms)requestAnimationFrame(tick);else resolve();
     }));
     const stats=a=>{a.sort((a,b)=>a-b);return{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]}};
     return{moving,fps:(count-1)*1000/(last-start),cpu:stats(cpu),frame:stats(intervals),calls:w.state.calls,triangles:w.state.triangles};
    };
    await run(800,false);results.push(await run(7000,true));
   }
   return{mode,results,glError:r.getContext().getError()};
  },mode);
  rows.push(result);console.log(JSON.stringify(result));
  await writeFile(out+'/results.json',JSON.stringify({kind:'Diagnostic omissions only; native geometry/coverage retained, deliberately invalid flat lighting. Headless Mac, not product acceptance.',errors,rows},null,2));
 }
}finally{await browser.close()}
