import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/broad-sky-v21',source='lab/c7-snapshots/bank-canopy-v21';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
const cases=[
 ['baseline',null,.18,8],
 ['narrow-warm',null,.06,12],
 ['wide-low',[[-75,10,.25],[-45,10,.3],[-15,10,.3],[15,10,.1],[45,10,.05]],.06,12],
 ['left-low',[[-95,16,.2],[-65,12,.3],[-35,10,.3],[-5,8,.15],[25,6,.05]],.06,12],
 ['left-high',[[-95,20,.2],[-65,24,.3],[-35,18,.3],[-5,10,.15],[25,6,.05]],.06,12]
];
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,samples,environment,power]of cases){
  const state=await page.evaluate(({name,samples,environment,power})=>{
   const s=sceneLab;s.scene.environmentIntensity=environment;s.skyLight.params.strength=power;s.skyLight.update(0);
   s.skyLight.lights.forEach((light,i)=>{light.color.set(name==='baseline'?'#fff0ca':'#ffe4b4');if(samples){const[az,el,w]=samples[i],a=az*Math.PI/180,e=el*Math.PI/180;light.position.set(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).multiplyScalar(5000).add(light.target.position);light.intensity=power*w;}});
   s.trees.userData.updateLighting([s.sunlight,...s.skyLight.lights]);s.renderer.shadowMap.needsUpdate=true;return s.set({});
  },{name,samples,environment,power});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,samples,environment,power,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
