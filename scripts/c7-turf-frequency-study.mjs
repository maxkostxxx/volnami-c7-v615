import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source='lab/c7-snapshots/integrated-v37',output='evidence/turf-frequency-v38';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try {
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);
 await page.waitForSelector('body.ready',{timeout:60000});
 for(const [name,tile,bumpScale] of [['baseline',4,.012],['resolved-fibres',12,.045]]) {
  const state=await page.evaluate(({tile,bumpScale})=>{
   const g=sceneLab.ground.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv');
   for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/tile,p.getZ(i)/tile);
   uv.needsUpdate=true;sceneLab.ground.material.bumpScale=bumpScale;return sceneLab.set({});
  },{tile,bumpScale});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,tile,bumpScale,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,scope:'Physical fibre microstructure: 12m texture tile makes a typical leaf .35m rather than .12m. True mesh, palette and lighting unchanged.',errors,runs},null,2));}
console.log({errors,runs:runs.length});
