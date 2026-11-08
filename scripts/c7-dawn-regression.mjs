import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.QA_OUTPUT, prior=process.env.QA_PRIOR_WORLD;
assert.ok(out&&prior,'QA_OUTPUT and QA_PRIOR_WORLD required');
await fs.mkdir(out,{recursive:true});
const baseline=await fs.readFile(prior,'utf8'), current=await fs.readFile('lab/c7-scene/world.js','utf8');
const result={kind:'Headless Chromium/Metal, emulated sizes and two geometry qualities; raw RGBA forward/reverse and prior-world comparison.',hashes:{prior:createHash('sha256').update(baseline).digest('hex'),current:createHash('sha256').update(current).digest('hex')},rows:[],errors:[],pass:false};
const b=await chromium.launch({headless:true,args:['--use-angle=metal']});
const capture=(page,t)=>page.evaluate(async t=>{sceneLab.render(t,0);const gl=sceneLab.renderer.getContext(),px=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,px);return {hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',px))).join(','),linked:sceneLab.renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS))};},t);
try{
 for(const quality of ['normal','low'])for(const variant of ['prior','current']){
  const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),p=await c.newPage();
  p.on('pageerror',e=>result.errors.push(e.message));
  p.on('console',e=>{if(e.type()==='error')result.errors.push(e.text())});
  if(variant==='prior')await p.route('**/lab/c7-scene/world.js',r=>r.fulfill({contentType:'application/javascript',body:baseline}));
  await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze&quality='+quality);
  await p.waitForSelector('body.ready',{timeout:90000});
  for(const [width,height]of [[390,844],[1440,900],[2560,1080]]){
   await p.setViewportSize({width,height});await p.waitForFunction(a=>Math.abs(sceneLab.camera.aspect-a)<1e-8,width/height);
   const rows=[];
   for(const travel of [0,.03,.07,.5,.88,1]){
    const row={quality,variant,width,height,travel,...await capture(p,travel)};rows.push(row);result.rows.push(row);
    if(variant==='current'&&quality==='normal'&&[0,.03].includes(travel))await p.screenshot({path:`${out}/${width}-${travel}.jpg`,type:'jpeg',quality:90});
   }
   for(const row of rows.toReversed())row.reverseExact=(await capture(p,row.travel)).hash===row.hash;
  }await c.close();console.log(quality,variant,'captured');
 }
 for(const r of result.rows.filter(r=>r.variant==='current')){
  const before=result.rows.find(x=>x.variant==='prior'&&x.quality===r.quality&&x.width===r.width&&x.travel===r.travel);
  r.priorExact=before.hash===r.hash;
  assert.equal(r.priorExact,r.travel>=.07,`unexpected changed domain ${r.width}/${r.quality}/${r.travel}`);
 }
 assert.ok(result.rows.every(r=>r.reverseExact&&r.linked));assert.equal(result.errors.length,0);result.pass=true;
}finally{await b.close();await fs.writeFile(out+'/results.json',JSON.stringify(result,null,2));}
