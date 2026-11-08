import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/c7-v562-specialize';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:90000});
await page.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null);window.mats=new Map();for(const g of [sceneLab.ground,sceneLab.grass,sceneLab.farGrass])g?.traverse(o=>{for(const m of(o.material?[o.material].flat():[]))if(!mats.has(m))mats.set(m,{compile:m.onBeforeCompile,key:m.customProgramCacheKey()})})});
for(const mode of ['base','constants','base','constants','constants','base']){
 const data=await page.evaluate(async mode=>{
 const w=sceneLab;
 for(const[m,old]of mats){m.onBeforeCompile=function(s,r){old.compile.call(this,s,r);if(mode==='constants'){
  const props=['metalness','roughness','specularIntensity','ior','sheenRoughness'];
  for(const name of props)if(typeof m[name]==='number')s.fragmentShader=s.fragmentShader.replace(new RegExp('uniform float '+name+'\\s*;'),`const float ${name} = ${Number(m[name]).toFixed(9)};`);
  for(const name of ['uTurfWrapStrength','uWrapStrength','uCanopyWrapStrength','uCanopyTransmissionMix','uTurfCanopyStrength','uCanopyStrength','uTurfScatterStrength','uScatterStrength','uScatter','uTurfTipWeight','uTipWeight','uCanopyTipWeight','uTurfWrap','uWrap','uCanopyWrap']){
   const v=s.uniforms[name]?.value;if(typeof v==='number')s.fragmentShader=s.fragmentShader.replace(new RegExp('uniform float '+name+'\\s*;'),`const float ${name} = ${Number(v).toFixed(9)};`);
  }
 }};m.customProgramCacheKey=()=>old.key+'|specialize-'+mode;m.needsUpdate=true;}
 await w.renderer.compileAsync(w.scene,w.camera);w.set({sun:.3,move:.3,time:0});
 const gl=w.renderer.getContext();w.renderer.render(w.scene,w.camera);const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 window.pixelBase??=pixels;let max=0,changed=0,sum=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-pixelBase[i]);max=Math.max(max,d);changed+=d>0;sum+=d;}
 const runs=[];for(let run=0;run<2;run++){
 let start,last,n=0,cpu=[];await new Promise(resolve=>requestAnimationFrame(function tick(t){start??=t;last=t;const p=.5-.5*Math.cos((t-start)/7000*2*Math.PI),b=performance.now();w.render(p,t/1000);cpu.push(performance.now()-b);n++;if(t-start<7000)requestAnimationFrame(tick);else resolve()}));cpu.sort((a,b)=>a-b);runs.push({fps:(n-1)*1000/(last-start),cpuMedian:cpu[Math.floor(cpu.length*.5)],cpuP95:cpu[Math.floor(cpu.length*.95)]});}
 return{mode,runs,pixels:{max,changed,mean:sum/pixels.length},glError:gl.getError()};
 },mode);rows.push(data);console.log(JSON.stringify(data));await writeFile(out+'/results.json',JSON.stringify({rows,errors},null,2));
}
}finally{await browser.close()}
