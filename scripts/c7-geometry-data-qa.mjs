import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/cooperative-geometry-v437-data';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal','--disable-gpu-shader-disk-cache','--disk-cache-size=1','--media-cache-size=1']}),runs=[],errors=[];
try{for(const source of ['lab/c7-scene','lab/c7-snapshots/cooperative-geometry-v437']){
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3027/'+source+'/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:90000});
 const meshes=await page.evaluate(async()=>{
  const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const objects=[sceneLab.ground];sceneLab.trees.traverse(o=>{if(o.isMesh)objects.push(o);});
  const rows=[];
  for(const o of objects){const g=o.geometry,attributes={};for(const [name,a]of Object.entries(g.attributes))attributes[name]=await digest(a.array);
   rows.push({name:o.name,attributes,index:await digest(g.index.array),transform:o.matrixWorld.toArray(),sphere:g.boundingSphere?.toArray?.()??(g.boundingSphere?{center:g.boundingSphere.center.toArray(),radius:g.boundingSphere.radius}:null)});
  }return rows;
 });runs.push({source,meshes});await page.close();
}}finally{await browser.close();}
const pass=!errors.length&&runs.length===2&&JSON.stringify(runs[0].meshes)===JSON.stringify(runs[1].meshes);
await writeFile(out+'/results.json',JSON.stringify({pass,errors,runs},null,2));console.log({pass,errors,meshes:runs[0]?.meshes.length});if(!pass)process.exitCode=1;
