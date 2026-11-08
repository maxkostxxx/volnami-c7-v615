import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import ts from 'typescript'
import * as THREE from 'three'
import {hillHeight} from '../app/c7/scene/geography.ts'
const source=await readFile('app/c7/scene/world.ts','utf8')
// Execute the actual pure key sampler; exclude renderer/DOM construction.
const pure=source.slice(source.indexOf('const clamp01'),source.indexOf('function buildTerrain'))
const js=ts.transpile(pure,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})
const {sampleKeys,desktopKeys,mobileKeys,keyProgress}=new Function('THREE',js+';return {sampleKeys,desktopKeys,mobileKeys,keyProgress};')(THREE)
const runs=[]
for(const [name,keys]of[['desktop',desktopKeys],['portrait',mobileKeys]]){
 let minClearance=Infinity,minDistance=Infinity,minForwardStep=Infinity,previousZ=-Infinity
 for(let i=0;i<=1000;i++){const p=new THREE.Vector3(),t=new THREE.Vector3();sampleKeys(keys,i/1000,p,t);minClearance=Math.min(minClearance,p.y-hillHeight(p.x,p.z));minDistance=Math.min(minDistance,p.distanceTo(t));if(i)minForwardStep=Math.min(minForwardStep,p.z-previousZ);previousZ=p.z}
 const seams=[];for(const phase of keyProgress.slice(1,-1)){const points=[phase-1e-6,phase,phase+1e-6].map(v=>{const p=new THREE.Vector3(),t=new THREE.Vector3();sampleKeys(keys,v,p,t);return p});const a=points[1].clone().sub(points[0]).multiplyScalar(1e6),b=points[2].clone().sub(points[1]).multiplyScalar(1e6);seams.push({phase,velocityDifference:a.distanceTo(b)})}
 runs.push({name,samples:1001,minClearance,minDistance,minForwardStep,seams})
 if(minClearance<2||minForwardStep<0||seams.some(s=>s.velocityDifference>.1))throw new Error('Invalid camera route')
}
const result={sourceSHA256:createHash('sha256').update(source).digest('hex'),note:'Actual pure camera sampler against actual terrain height; no render/performance claim',runs}
await writeFile(process.env.QA_OUTPUT,JSON.stringify(result,null,2));console.log(JSON.stringify(runs))
