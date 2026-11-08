import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.QA_OUTPUT;
if(!output)throw new Error('QA_OUTPUT required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try{
 await page.goto('http://127.0.0.1:3027/lab/c7-snapshots/horizon-v17/?clean&freeze');
 await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,params]of[
  ['baseline',{mistNearZ:-230,mistFarZ:-370,mistExtinction:.035}],
  ['rear-layer-a',{mistNearZ:-270,mistFarZ:-350,mistExtinction:.025}],
  ['rear-layer-b',{mistNearZ:-285,mistFarZ:-355,mistExtinction:.03}],
 ]){
  const state=await page.evaluate(params=>{sceneLab.aerial.setParams(params);return sceneLab.set({});},params);
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,params,state,errors:[...errors]});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({kind:'Diagnostic viewport emulation, not a physical phone',runs,errors},null,2));}
console.log({runs:runs.length,errors});
