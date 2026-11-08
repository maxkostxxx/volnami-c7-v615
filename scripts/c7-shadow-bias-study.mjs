import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/shadow-bias-v23',source='lab/c7-snapshots/hermite-s-v23';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,normalBias,bias]of[['baseline',.18,-.000002],['normal0',0,-.000002],['small-normal',.03,-.000005],['depth-only',0,-.00001]]){
  const state=await page.evaluate(({normalBias,bias})=>{const s=sceneLab;for(const light of s.skyLight.lights){Object.assign(light.shadow,{radius:1,normalBias,bias});}s.renderer.shadowMap.needsUpdate=true;return s.set({});},{normalBias,bias});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,normalBias,bias,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
