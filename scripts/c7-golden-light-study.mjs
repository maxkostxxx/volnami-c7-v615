import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT,source=process.env.QA_SOURCE??'lab/c7-snapshots/crest-shadow-v20';
if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,power,colour]of[['baseline',8,'#fff0ca'],['warm-12',12,'#ffe4b4'],['warm-16',16,'#ffe4b4']]){
  const state=await page.evaluate(({power,colour})=>{sceneLab.skyLight.params.strength=power;sceneLab.skyLight.update(0);for(const light of sceneLab.skyLight.lights)light.color.set(colour);return sceneLab.set({});},{power,colour});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,power,colour,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
