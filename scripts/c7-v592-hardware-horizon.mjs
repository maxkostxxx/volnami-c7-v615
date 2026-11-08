import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/c7-v592-hardware-horizon';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(async()=>{
  const w=sceneLab,T=await import('three');w.renderer.setAnimationLoop(null);
  const convert=source=>{const i=source.image,t=new T.Data3DTexture(i.data,i.width,i.height,i.depth);t.format=source.format;t.type=source.type;t.minFilter=t.magFilter=T.LinearFilter;t.needsUpdate=true;return t;};
  window.horizon3d={main:convert(w.skyHorizon.uniforms.uSkyHorizon.value),local:convert(w.skyHorizon.uniforms.uLocalHorizon.value)};
  const mats=new Set([w.ground.material]);for(const g of[w.grass,w.farGrass])g?.traverse(o=>{if(o.isMesh)for(const m of[o.material].flat())mats.add(m)});
  window.originals=[...mats].map(m=>({m,compile:m.onBeforeCompile,key:m.customProgramCacheKey()}));
  window.mode=async enabled=>{
   for(const o of originals){o.m.onBeforeCompile=function(s,r){o.compile.call(this,s,r);if(enabled){
    s.uniforms.uSkyHorizon={value:horizon3d.main};s.uniforms.uLocalHorizon={value:horizon3d.local};
    s.fragmentShader=s.fragmentShader.replace('uniform highp sampler2DArray uSkyHorizon,uLocalHorizon;','uniform highp sampler3D uSkyHorizon,uLocalHorizon;');
    s.fragmentShader=s.fragmentShader.replace(/vec4 localA=texture\(uLocalHorizon,[^;]+;/,'vec4 localField=texture(uLocalHorizon,vec3(localSample,(localLayer+.5)/17.));').replace('mix(localA.rg,localB.rg,fract(localLayer))','localField.rg').replace('mix(localA.ba,localB.ba,fract(localLayer))','localField.ba');
    s.fragmentShader=s.fragmentShader.replace(/vec4 a=texture\(uSkyHorizon,vec3\(uv,low\)\),b=texture\(uSkyHorizon,vec3\(uv,high\)\);/,'vec4 mainField=texture(uSkyHorizon,vec3(uv,(layer+.5)/17.));').replace('mix(a.rg,b.rg,fract(layer))','mainField.rg').replace('mix(a.ba,b.ba,fract(layer))','mainField.ba');
   }};o.m.customProgramCacheKey=()=>o.key+'|hardware-horizon-'+enabled;o.m.needsUpdate=true;}
   await w.renderer.compileAsync(w.scene,w.camera);
  };
 });
 for(const enabled of[false,true,true,false]){
  const row=await page.evaluate(async enabled=>{
   await mode(enabled);const w=sceneLab;
   async function run(ms){let first,last,n=0;const cpu=[];await new Promise(resolve=>requestAnimationFrame(function tick(t){first??=t;last=t;const s=performance.now();w.render(.5-.5*Math.cos((t-first)/ms*2*Math.PI),t/1000);cpu.push(performance.now()-s);n++;if(t-first<ms)requestAnimationFrame(tick);else resolve()}));cpu.sort((a,b)=>a-b);return{fps:(n-1)*1000/(last-first),cpuMedian:cpu[Math.floor(cpu.length/2)]};}
   await run(1200);return{enabled,...await run(6500),glError:w.renderer.getContext().getError()};
  },enabled);rows.push(row);console.log(row);
 }
 const pixels=[];
 for(const phase of[0,.07,.15,.3,.5,.7,.88,1]){
  pixels.push(await page.evaluate(async phase=>{
   const w=sceneLab,gl=w.renderer.getContext(),grab=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
   await mode(false);w.set({sun:phase,move:phase,time:0});const base=grab();await mode(true);w.set({sun:phase,move:phase,time:0});const next=grab();let changed=0,max=0,sum=0,over2=0;for(let i=0;i<base.length;i++){const d=Math.abs(base[i]-next[i]);changed+=d>0;over2+=d>2;sum+=d;max=Math.max(max,d);}return{phase,changed,max,mean:sum/base.length,over2,total:base.length,glError:gl.getError()};
  },phase));await page.screenshot({path:out+'/phase-'+phase+'.jpg',quality:90});
 }
 await writeFile(out+'/results.json',JSON.stringify({rows,pixels,errors},null,2));console.log({pixels,errors});
}finally{await browser.close();}
if(errors.length||rows.some(r=>r.glError))process.exitCode=1;
