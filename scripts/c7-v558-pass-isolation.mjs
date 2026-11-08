import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='evidence/c7-v558-pass-isolation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const p=await browser.newPage({viewport:{width:2560,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
try {
await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await p.waitForSelector('body.ready',{timeout:90000});
await p.evaluate(()=>sceneLab.renderer.setAnimationLoop(null));
const records=[];
for(const mode of ['full','main','no-near','no-far','no-grass','no-ground','no-water','no-trees','sky-only','main-repeat']){
 const result=await p.evaluate(async mode=>{
 const w=sceneLab,r=w.renderer,gl=r.getContext();const groups=[w.grass,w.farGrass,w.ground,w.lake.mesh,w.trees];for(const g of groups)if(g)g.visible=true;
 if(mode==='no-near'||mode==='no-grass')w.grass.visible=false;
 if(mode==='no-far'||mode==='no-grass')w.farGrass.visible=false;
 if(mode==='no-ground')w.ground.visible=false;
 if(mode==='no-water')w.lake.mesh.visible=false;
 if(mode==='no-trees')w.trees.visible=false;
 if(mode==='sky-only')for(const g of groups)if(g)g.visible=false;
 const draw=()=>mode==='full'?w.render(0,performance.now()/1000):r.render(w.scene,w.camera);
 // Drain previously submitted work before warming each variant.
 gl.finish();draw();gl.finish();await new Promise(resolve=>setTimeout(resolve,1000));
 let first,last,count=0;const dt=[],cpu=[];
 await new Promise(resolve=>requestAnimationFrame(function tick(t){first??=t;if(last!==undefined)dt.push(t-last);last=t;const start=performance.now();r.info.reset();draw();cpu.push(performance.now()-start);count++;if(t-first<4000||count<8)requestAnimationFrame(tick);else resolve()}));
 const stat=a=>{a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]}};
 return {mode,fps:(count-1)*1000/(last-first),frames:count,interval:stat(dt),cpu:stat(cpu),calls:r.info.render.calls,triangles:r.info.render.triangles,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
 },mode);records.push(result);console.log(JSON.stringify(result));await writeFile(out+'/results.json',JSON.stringify({kind:'Headless Mac Chromium/Metal, diagnostic omissions, not product changes or physical phones',errors,records},null,2));
}
}finally{await browser.close()}
