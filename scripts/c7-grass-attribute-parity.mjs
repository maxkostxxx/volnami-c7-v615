// Hash every prepared instance attribute, after preparation and before disposal.
import {chromium,firefox,webkit} from 'playwright';import fs from 'node:fs/promises';
const output=process.env.QA_OUTPUT,base=process.env.QA_BASELINE_URL,candidate=process.env.QA_CANDIDATE_URL;
if(!output||!base||!candidate)throw Error('Explicit output and URLs required');await fs.mkdir(output,{recursive:true});
const engine=process.env.QA_ENGINE||'chromium',b=await({chromium,firefox,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{args:['--use-angle=metal']}:{})}),rows=[],errors=[];
try{for(const width of [390,1440])for(const [mode,url]of [['baseline',base],['candidate',candidate]]){
 const p=await b.newPage({viewport:{width,height:width===390?844:900}});p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/attributes.html',r=>r.fulfill({contentType:'text/html',body:'<html><link rel="icon" href="data:,"><canvas></canvas><script type="module">import{createC7Scene}from"/3d/c7/runtime-v395/world.js";window.w=await createC7Scene({canvas:document.querySelector("canvas"),width:innerWidth,height:innerHeight,low:innerWidth===390});window.ready=true;</script></html>'}));await p.goto(url+'/attributes.html');await p.waitForFunction(()=>window.ready,undefined,{timeout:120000});
 const data=await p.evaluate(async()=>{
  const result={},geometries=[];w.grass.traverse(o=>{if(o.geometry&&!geometries.includes(o.geometry))geometries.push(o.geometry)});
  for(const name of ['aRoot','aShape','aTerrainNormal','aOrder']){
   const attributes=[...new Set(geometries.map(g=>g.attributes[name]))],size=attributes.reduce((sum,a)=>sum+a.array.byteLength,0),data=new Uint8Array(size);let offset=0;
   for(const a of attributes){const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);data.set(bytes,offset);offset+=bytes.length;}
   result[name]={bytes:size,attributes:attributes.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('')};
  }
  return{attributes:result,blades:w.grass.userData.totalBlades,preparation:w.grass.userData.staticPreparation};
 });rows.push({mode,width,...data});await p.close();console.log({mode,width,blades:data.blades});
}}finally{await b.close();}
const exact=[390,1440].every(width=>JSON.stringify(rows.find(r=>r.width===width&&r.mode==='baseline').attributes)===JSON.stringify(rows.find(r=>r.width===width&&r.mode==='candidate').attributes));
await fs.writeFile(output+'/results.json',JSON.stringify({rows,errors,allPreparedAttributesExact:exact},null,2));if(!exact||errors.length)process.exitCode=1;
