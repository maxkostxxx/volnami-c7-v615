import{chromium,firefox,webkit}from'playwright';import fs from'node:fs/promises';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
const engine=process.env.QA_ENGINE||'chromium',out=process.env.QA_OUTPUT||'evidence/c7-v598-runtime-pixels',widths=(process.env.QA_WIDTHS||'390,1440,2560').split(',').map(Number),phases=(process.env.QA_PHASES||'0,.07,.15,.3,.5,.65,.75,.83,.88,.93,1').split(',').map(Number);await fs.mkdir(out,{recursive:true});
const browser=await({chromium,firefox,webkit}[engine]).launch({headless:true,...engine==='chromium'?{args:['--use-angle=metal']}:{}}),rows=[],errors=[];
const html=`<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas></canvas><script type="module">import{createC7Scene}from'/3d/c7/runtime-v395/world.js';window.sceneLab=await createC7Scene({canvas:document.querySelector('canvas'),width:innerWidth,height:innerHeight,low:innerWidth===390});window.ready=true;</script></body></html>`;
try{for(const width of widths){const height=width===390?844:width===1440?900:1080,reference=new Map();for(const mode of['baseline','candidate']){
 const p=await browser.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.route('**/pixel-harness.html',r=>r.fulfill({contentType:'text/html',body:html}));await p.goto((mode==='baseline'?'http://127.0.0.1:3047':'http://127.0.0.1:3007')+'/pixel-harness.html');await p.waitForFunction(()=>window.ready,{timeout:90000});
 for(const phase of phases){
  const result=await p.evaluate(async phase=>{sceneLab.render(phase,10);const gl=sceneLab.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);const zip=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let binary='';for(let i=0;i<zip.length;i+=32768)binary+=String.fromCharCode(...zip.subarray(i,i+32768));return{data:btoa(binary),glError:gl.getError(),frames:sceneLab.state.frames};},phase);
  const data=gunzipSync(Buffer.from(result.data,'base64'));let diff=null;if(mode==='baseline')reference.set(phase,data);else{const a=reference.get(phase);let max=0,total=0,changed=0,above2=0,above10=0;for(let i=0;i<data.length;i+=4){let pm=0;for(let j=0;j<3;j++){const d=Math.abs(data[i+j]-a[i+j]);total+=d;max=Math.max(max,d);pm=Math.max(pm,d);}if(pm)changed++;if(pm>2)above2++;if(pm>10)above10++;}diff={max,meanRGB:total/(data.length*.75),changedPixels:changed,above2,above10,pixels:data.length/4};}
  rows.push({engine,width,height,mode,phase,hash:createHash('sha256').update(data).digest('hex'),diff,glError:result.glError});
  if([0,.5,1].includes(phase))await p.screenshot({path:`${out}/${mode}-${width}-${phase}.png`});
 }
 if(mode==='candidate'){
  // Approach the same states in reverse, without changing elapsed scene time.
  for(const phase of phases.slice().reverse()){
   const hash=await p.evaluate(async phase=>{sceneLab.render(phase,10);const gl=sceneLab.renderer.getContext(),a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');},phase);
   rows.push({engine,width,mode:'reverse',phase,exact:rows.find(r=>r.width===width&&r.mode==='candidate'&&r.phase===phase).hash===hash});
  }
 }
 await p.close();await fs.writeFile(out+'/results.json',JSON.stringify({engine,rows,errors},null,2));console.log({width,mode,errors:errors.length,max:Math.max(0,...rows.filter(r=>r.width===width&&r.diff).map(r=>r.diff.max))});
}}}finally{await browser.close();}if(errors.length||rows.some(r=>r.glError||r.diff?.meanRGB>.02||r.diff?.above10>100||r.mode==='reverse'&&r.exact===false&&engine!=='firefox'))process.exitCode=1;
