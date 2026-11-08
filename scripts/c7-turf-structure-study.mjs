import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source='lab/c7-snapshots/integrated-v37',output='evidence/turf-structure-v37';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try {
  await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);
  await page.waitForSelector('body.ready',{timeout:60000});
  for(const [name,bumpScale] of [['baseline',.012],['canopy045',.045],['canopy09',.09]]) {
    const state=await page.evaluate(v=>{sceneLab.ground.material.bumpScale=v;return sceneLab.set({});},bumpScale);
    await page.screenshot({path:`${output}/${name}.png`});runs.push({name,bumpScale,state});
  }
} finally {
  await browser.close();await writeFile(`${output}/results.json`,JSON.stringify({source,scope:'Only physical microcanopy bump height; identical camera, lighting, albedo and true geometry.',errors,runs},null,2));
}
console.log({errors,runs:runs.length});
