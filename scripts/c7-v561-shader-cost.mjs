import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/c7-v561-shader-cost';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');
 await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(()=>{
  const w=sceneLab;w.renderer.setAnimationLoop(null);
  const mats=new Map();
  for(const [kind,group]of Object.entries({ground:w.ground,near:w.grass,far:w.farGrass,water:w.lake.mesh,trees:w.trees}))group?.traverse(o=>{
   for(const m of(o.material?[o.material].flat():[]))if(!mats.has(m))mats.set(m,{kind,compile:m.onBeforeCompile,key:m.customProgramCacheKey,keyValue:m.customProgramCacheKey(),fragment:m.fragmentShader});
  });
  window.costMaterials=mats;
 });
 const modes=['baseline','no-aerial','baseline','flat-ground','baseline','flat-near','baseline','flat-far','baseline','flat-water','baseline','flat-all','baseline'];
 for(const mode of modes){
  const result=await page.evaluate(async mode=>{
   const w=sceneLab,r=w.renderer;
   for(const[m,old]of costMaterials){
    const flat=mode==='flat-all'||mode==='flat-'+old.kind;
    m.onBeforeCompile=function(shader,renderer){old.compile.call(this,shader,renderer);
     if(flat)shader.fragmentShader='void main(){gl_FragColor=vec4(.2,.4,.2,1.);}';
     if(mode==='no-aerial')shader.fragmentShader=shader.fragmentShader.replace('vec3 c7ApplyAerial(vec3 outgoingRadiance, vec3 actualWorldPosition) {','vec3 c7ApplyAerial(vec3 outgoingRadiance, vec3 actualWorldPosition) { return outgoingRadiance;');
    };
    m.customProgramCacheKey=()=>old.keyValue+'|cost-'+(flat?'flat':mode==='no-aerial'?'no-aerial':'base');m.needsUpdate=true;
   }
   w.set({sun:.3,move:.3,time:0});await r.compileAsync(w.scene,w.camera);
   const results=[];
   for(const moving of [false,true]){
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
    await run(1200,false);results.push(await run(5000,true));
   }
   return{mode,results,glError:r.getContext().getError()};
  },mode);
  rows.push(result);console.log(JSON.stringify(result));
  await writeFile(out+'/results.json',JSON.stringify({kind:'Diagnostic omissions only; native geometry/coverage retained, deliberately invalid flat lighting. Headless Mac, not product acceptance.',errors,rows},null,2));
 }
}finally{await browser.close()}
