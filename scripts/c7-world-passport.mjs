import * as T from 'three';
import{referenceLookAt,referenceCamera,bank,WATER_LEVEL}from'../lab/c7-scene/terrain.js';
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';
const source=await readFile('lab/c7-scene/world.js','utf8'),start=source.indexOf('function setCamera()'),end=source.indexOf('\nfunction resize(',start);if(start<0||end<start)throw Error('Camera extraction changed');
// Execute only the current repository's standalone camera function with explicit
// dependencies; this records authored samples, not a collision/visual verdict.
const apply=new Function('T','camera','lookAt','width','height','travel','worldZ','lensFov','referenceLookAt','solar','depthStretch',source.slice(start,end)+';setCamera();');
const solarForTravel=new Function(source.slice(source.indexOf('function solarForTravel('),source.indexOf('const world={'))+';return solarForTravel;')();
const worldZ=z=>85+(z-85)*2.1,lensFov=fov=>T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(fov)/2)/2.1)),rows=[];
for(const [width,height]of[[390,844],[1440,900],[2560,1080]])for(const travel of[0,.16,.3,.83,1]){const camera=referenceCamera.clone(),target=new T.Vector3();camera.near=2;apply(T,camera,target,width,height,travel,worldZ,lensFov,referenceLookAt,solarForTravel(travel),2.1);rows.push({width,height,travel,solar:solarForTravel(travel),position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,near:camera.near,far:camera.far});}
const data={sourceSha256:createHash('sha256').update(source).digest('hex'),kind:'Numerical passport from current authored setCamera function; not visual or device acceptance',waterLevel:WATER_LEVEL,depthStretch:2.1,depthPivot:85,bank:{x:[Math.min(...bank.map(p=>p.x)),Math.max(...bank.map(p=>p.x))],zAuthored:[Math.min(...bank.map(p=>p.z)),Math.max(...bank.map(p=>p.z))],zPhysical:[Math.min(...bank.map(p=>worldZ(p.z))),Math.max(...bank.map(p=>worldZ(p.z)))]},rows};
if(!process.env.QA_OUTPUT)throw Error('QA_OUTPUT required');await mkdir(process.env.QA_OUTPUT,{recursive:false});await writeFile(process.env.QA_OUTPUT+'/world.json',JSON.stringify(data,null,2));console.log({bank:data.bank,rows:rows.length});
