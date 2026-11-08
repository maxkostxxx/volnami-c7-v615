import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/elevation-sky-v22',source='lab/c7-snapshots/water-canopy-v22';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
const cases=[
 ['baseline',null,.18,8],
 ['higher-soft',[[9,.45],[12,.25],[19,.15],[26,.10],[33,.05]],.10,12],
 ['higher-medium',[[6,.10],[12,.2],[19,.3],[26,.25],[33,.15]],.10,12],
 ['higher-gold',[[6,.10],[12,.2],[19,.3],[26,.25],[33,.15]],.10,12,'#9ca052'],
 ['higher-mist',[[6,.10],[12,.2],[19,.3],[26,.25],[33,.15]],.10,12,null,{mistExtinction:.08,hazeMaxLuminance:1.1}],
 ['baseline-mist',null,.18,8,null,{mistExtinction:.08,hazeMaxLuminance:1.1}]
];
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,samples,environment,power,tip,air]of cases){
  const state=await page.evaluate(({name,samples,environment,power,tip,air})=>{
   const s=sceneLab;s.scene.environmentIntensity=environment;s.skyLight.params.strength=power;s.skyLight.update(0);
   s.aerial.setParams(air??{mistExtinction:.03,hazeMaxLuminance:.6});
   s.grass.userData.uniforms.uTipColor.value.set(tip??'#6e8f53');s.ground.material.userData.turfUniforms.uTurfTipColor.value.set(tip??'#6e8f53');
   s.skyLight.lights.forEach((light,i)=>{light.color.set(samples?'#ffe4b4':'#fff0ca');if(samples){const[el,w]=samples[i],a=(-15+(i%2?5:-5))*Math.PI/180,e=el*Math.PI/180;light.position.set(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).multiplyScalar(5000).add(light.target.position);light.intensity=power*w;}light.shadow.radius=2;Object.assign(light.shadow.camera,{left:-600,right:600,top:750,bottom:-750});light.shadow.camera.updateProjectionMatrix();});
   s.trees.userData.updateLighting([s.sunlight,...s.skyLight.lights]);s.renderer.shadowMap.needsUpdate=true;return s.set({});
  },{name,samples,environment,power,tip,air});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,samples,environment,power,tip,air,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
