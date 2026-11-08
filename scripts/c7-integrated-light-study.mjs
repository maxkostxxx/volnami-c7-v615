import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/integrated-light-v23',source='lab/c7-snapshots/hermite-s-v23';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
const cases=[
 ['hermite-baseline',false,false,false],
 ['hermite-gold',false,true,false],
 ['hermite-high-gold',true,true,false],
 ['hermite-high-gold-air',true,true,true]
];
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,higher,gold,air]of cases){
  const state=await page.evaluate(({name,higher,gold,air})=>{
   const s=sceneLab;s.scene.environmentIntensity=.14;s.skyLight.params.strength=higher?12:8;s.skyLight.update(0);
   s.aerial.setParams(air?{mistExtinction:.06,hazeMaxLuminance:.95,hazeSaturation:1}:{mistExtinction:.03,hazeMaxLuminance:.6,hazeSaturation:.5});
   s.grass.userData.uniforms.uTipColor.value.set(gold?'#9ca052':'#6e8f53');s.ground.material.userData.turfUniforms.uTurfTipColor.value.set(gold?'#9ca052':'#6e8f53');
   const samples=[[9,.45],[12,.25],[19,.15],[26,.10],[33,.05]];
   s.skyLight.lights.forEach((light,i)=>{
    light.color.set(higher?'#ffe4b4':'#fff0ca');
    if(higher){const[el,w]=samples[i],a=(-15+(i%2?5:-5))*Math.PI/180,e=el*Math.PI/180;light.position.set(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).multiplyScalar(5000).add(light.target.position);light.intensity=12*w;}
    light.shadow.radius=1.5;Object.assign(light.shadow.camera,{left:-600,right:600,top:1100,bottom:-1100});light.shadow.camera.updateProjectionMatrix();
    if(light.shadow.mapSize.x!==4096){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(4096,4096);}
   });
   s.trees.userData.updateLighting([s.sunlight,...s.skyLight.lights]);s.renderer.shadowMap.needsUpdate=true;return s.set({});
  },{name,higher,gold,air});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,higher,gold,air,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
