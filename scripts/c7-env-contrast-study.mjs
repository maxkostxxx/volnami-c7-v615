import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT,source=process.env.QA_SOURCE??'lab/c7-snapshots/crest-shadow-v20';
if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,power,colour,environment]of[['warm-12-env06',12,'#ffe4b4',.06],['warm-12-env10',12,'#ffe4b4',.10]]){
  const state=await page.evaluate(({power,colour,environment})=>{sceneLab.scene.environmentIntensity=environment;sceneLab.skyLight.params.strength=power;sceneLab.skyLight.update(0);for(const light of sceneLab.skyLight.lights)light.color.set(colour);return sceneLab.set({});},{power,colour,environment});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,power,colour,environment,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
