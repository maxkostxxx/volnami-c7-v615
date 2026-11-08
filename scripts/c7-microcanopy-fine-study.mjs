import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source='lab/c7-snapshots/integrated-v37',output='evidence/microcanopy-fine-v41';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],runs=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
try {
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);await page.waitForSelector('body.ready',{timeout:60000});
 await page.evaluate(()=>{
  const material=sceneLab.ground.material,previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  const strength={value:0};sceneLab.microCanopy=strength;
  material.onBeforeCompile=function(shader,r){
   previous.call(this,shader,r);shader.uniforms.uMicroCanopy=strength;
   shader.fragmentShader='uniform float uMicroCanopy;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 microP=vTurfWorld.xz*2.8;
    float microFootprint=max(length(dFdx(microP)),length(dFdy(microP)));
    float microWeight=1.-smoothstep(.6,1.8,microFootprint);
    float microFineWeight=1.-smoothstep(.6,1.8,microFootprint*2.07);
    float microCoarse=turfNoise(microP)-.5;
    float microFine=turfNoise(mat2(.8,-.6,.6,.8)*microP*2.07+31.7)-.5;
    float microField=microCoarse*microWeight+microFine*microFineWeight*.35;
    diffuseColor.rgb*=1.+uMicroCanopy*1.5*microField;
    float microHeight=uMicroCanopy*.018*microField;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    #ifdef USE_BUMPMAP
    normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(microHeight),dFdy(microHeight)),faceDirection);
    #endif
   `);
  };
  material.customProgramCacheKey=()=>key+'-microcanopy-v1';material.needsUpdate=true;
 });
 for(const[name,strength] of [['baseline',0],['microcanopy',1]]) {
  const state=await page.evaluate(v=>{sceneLab.microCanopy.value=v;return sceneLab.set({});},strength);
  await page.screenshot({path:`${output}/${name}.png`});runs.push({name,strength,state});
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,scope:'World-space filtered microcanopy field, .36m coarse/.17m fine cells, .018m height scale, bounded diffuse-reflectance variation. No screen texture or light gain.',errors,runs},null,2));}
console.log({errors,runs:runs.length});
