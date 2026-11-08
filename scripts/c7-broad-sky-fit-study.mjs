import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/broad-sky-fit-v22',source='lab/c7-snapshots/water-canopy-v22';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
const cases=[
 ['baseline',null,.18,8],
 ['narrow-fit',null,.06,12],
 ['left-mix12',[[-65,12,.12],[-40,9,.18],[-15,9,.4],[-5,6,.15],[-5,12,.15]],.06,12],
 ['left-mix20',[[-65,12,.2],[-40,9,.2],[-15,9,.3],[-5,6,.15],[-5,12,.15]],.06,12],
 ['left-mix-low',[[-65,8,.2],[-40,6,.2],[-15,9,.3],[-5,6,.15],[-5,12,.15]],.06,12]
];
try{
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 for(const[name,samples,environment,power]of cases){
  const state=await page.evaluate(async({name,samples,environment,power})=>{
   const T=await import('three'),s=sceneLab;s.scene.environmentIntensity=environment;s.skyLight.params.strength=power;s.skyLight.update(0);
   s.ground.geometry.computeBoundingBox();s.ground.updateWorldMatrix(true,false);
   const box=s.ground.geometry.boundingBox.clone().applyMatrix4(s.ground.matrixWorld);box.max.y+=40;box.expandByScalar(5);
   s.skyLight.lights.forEach((light,i)=>{
    light.color.set(name==='baseline'?'#fff0ca':'#ffe4b4');
    if(samples){const[az,el,w]=samples[i],a=az*Math.PI/180,e=el*Math.PI/180;light.position.set(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).multiplyScalar(5000).add(light.target.position);light.intensity=power*w;}
    if(name!=='baseline'){
     light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);light.shadow.updateMatrices(light);
     const camera=light.shadow.camera,b=new T.Box3();for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])b.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
     Object.assign(camera,{left:b.min.x,right:b.max.x,bottom:b.min.y,top:b.max.y,near:Math.max(.1,-b.max.z),far:-b.min.z});camera.updateProjectionMatrix();
     if(light.shadow.mapSize.x!==4096){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(4096,4096);}light.shadow.radius=1;
    }
   });
   s.trees.userData.updateLighting([s.sunlight,...s.skyLight.lights]);s.renderer.shadowMap.needsUpdate=true;return s.set({});
  },{name,samples,environment,power});
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,samples,environment,power,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,errors,runs},null,2));}
console.log({errors,runs:runs.length});
