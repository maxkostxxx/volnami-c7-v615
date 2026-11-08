// Diagnostic regrouping only. Original per-root ranks/materials remain, larger
// conservative bounds may submit more invisible geometry. No product files edited.
import {chromium} from 'playwright';import fs from 'node:fs/promises';
const out='evidence/c7-performance-audit-2026-10-29/batching-1440';await fs.mkdir(out,{recursive:true});
const original=await fs.readFile('lab/c7-scene/grass.js','utf8');
function grouped(divisions){const size=20/divisions;let s=original;
 const edits=[
 ['const bins = Array.from({length:16},()=>[]);',`const bins = Array.from({length:${divisions*divisions}},()=>[]);`],
 ['bins[Math.max(0,Math.min(3,Math.floor((roots[i*3]-x0)/5))) + 4*Math.max(0,Math.min(3,Math.floor((roots[i*3+2]-z0)/5)))].push(i);',`bins[Math.max(0,Math.min(${divisions-1},Math.floor((roots[i*3]-x0)/${size}))) + ${divisions}*Math.max(0,Math.min(${divisions-1},Math.floor((roots[i*3+2]-z0)/${size})))].push(i);`],
 ['const patchX = x0 + (bin % 4) * 5, patchZ = z0 + Math.floor(bin/4) * 5;',`const patchX = x0 + (bin % ${divisions}) * ${size}, patchZ = z0 + Math.floor(bin/${divisions}) * ${size};`],
 ['patchX + 5.8, ymax, patchZ + 5 + zPadding',`patchX + ${size+.8}, ymax, patchZ + ${size} + zPadding`],
 ['authoredBounds.max.x=patchX+5.7;',`authoredBounds.max.x=patchX+${size+.7};`],
 ['authoredBounds.max.z = patchZ + 5.7;',`authoredBounds.max.z = patchZ + ${size+.7};`]
 ];for(const[a,b]of edits){if(!s.includes(a))throw Error('Missing replacement '+a);s=s.replace(a,b);}return s;
}
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const rows=[],errors=[];
try{for(const divisions of [4,1,1,4]){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 if(divisions!==4)await page.route('**/lab/c7-scene/grass.js',r=>r.fulfill({contentType:'application/javascript',body:grouped(divisions)}));
 await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:90000});
 await page.evaluate(()=>{const w=sceneLab;w.renderer.setAnimationLoop(null);window.batchFlight=duration=>new Promise(resolve=>{let first,last,count=0,initial=w.state.frames;const intervals=[],cpu=[],calls=[],triangles=[];requestAnimationFrame(function tick(t){first??=t;if(last!==undefined)intervals.push(t-last);last=t;const start=performance.now();w.render(.5-.5*Math.cos((t-first)/duration*2*Math.PI),t/1000);cpu.push(performance.now()-start);calls.push(w.state.calls);triangles.push(w.state.triangles);count++;if(t-first<duration)requestAnimationFrame(tick);else{const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return{mean:s.reduce((x,y)=>x+y,0)/s.length,p95:s[Math.floor(s.length*.95)]}};resolve({callbacks:count,renderedFrames:w.state.frames-initial,actualRenderedFPS:(w.state.frames-initial-1)*1000/(t-first),elapsedMs:t-first,cpuMs:stats(cpu),frameMs:stats(intervals),calls:stats(calls),triangles:stats(triangles),grass:w.state.grass,glError:w.renderer.getContext().getError()});}});});});
 await page.evaluate(()=>batchFlight(2500));const result=await page.evaluate(()=>batchFlight(10000));rows.push({divisions,patchSize:20/divisions,...result});console.log(rows.at(-1));
 if(rows.length<=2)for(const phase of [0,.5,.8]){await page.evaluate(phase=>{sceneLab.render(phase,10);sceneLab.set({sun:sceneLab.solarForTravel(phase),move:phase,time:10});},phase);await page.locator('canvas').first().screenshot({path:`${out}/d${divisions}-phase${phase}.png`});}
 await page.close();await fs.writeFile(out+'/results.json',JSON.stringify({rows,errors,note:'Diagnostic larger bins, unchanged roots/ranks/shading; image and full regression acceptance not implied.'},null,2));
}}finally{await browser.close();}if(errors.length||rows.some(r=>r.glError||r.callbacks!==r.renderedFrames))process.exitCode=1;
