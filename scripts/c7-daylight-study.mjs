import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source='lab/c7-snapshots/integrated-v43',output='evidence/daylight-v44';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze&sun=.5`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const name of ['baseline','lower-irradiance']){
  const state=await page.evaluate(name=>{
   const s=sceneLab;
   if(name==='lower-irradiance'){
    s.sunlight.intensity=4;for(const light of s.skyLight.lights)light.intensity*=.2/.35;
    s.scene.environmentIntensity=.30;s.trees.userData.updateLighting([s.sunlight,...s.skyLight.lights]);
   }
   return s.set({sun:.5});
  },name);
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,scope:'Only noon direct and environment irradiance, camera/displayed sky/ACES exposure/geometry/material unchanged. Dawn/dusk endpoints stay unchanged in proposed phase curve.',errors,runs},null,2));}
console.log({errors,runs:runs.length});
