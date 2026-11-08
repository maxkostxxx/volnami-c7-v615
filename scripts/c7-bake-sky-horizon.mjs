import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {encodeHorizonField} from './c7-horizon-codec.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {DataUtils} from 'three';

// Rebuild whenever terrain.js/adaptive-terrain.js changes. The field contains
// visibility geometry, not image colours or a substitute for the 3D landscape.
export const FIELD={width:512,height:256,depth:17,traceWidth:1024,traceHeight:512,bounds:[-330,-405,660,280],firstAzimuth:-22.5,step:2.5,canopyHeight:.32,guardRange:[2,8]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sourceHashes(source){return Object.fromEntries(await Promise.all(['terrain.js','adaptive-terrain.js'].map(async name=>[name,hash(await fs.readFile(path.join(source,name)))])))}

export function packLayer(full){
 if(full.length!==1024*512*4)throw Error('Expected a1024x512 RGBA float layer');
 const packed=new Uint16Array(512*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<512;x++)for(let c=0;c<4;c++){
  const values=[];for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)values.push(full[((y*2+dy)*1024+x*2+dx)*4+c]);
  const value=c<2?values.reduce((s,v)=>s+v,0)/4:Math.min(8,...values);
  packed[(y*512+x)*4+c]=DataUtils.toHalfFloat(value);
 }
 return packed;
}

async function worker(source,directory,first,last){
 const {createTerrainGeometry}=await import(pathToFileURL(path.join(source,'terrain.js')));
 const {adaptTerrain}=await import(pathToFileURL(path.join(source,'adaptive-terrain.js')));
 const geometry=adaptTerrain(createTerrainGeometry()),height=geometry.userData.adaptiveTerrain.heightAt;
 function trace(x,z,az){
  const dx=Math.sin(az),dz=-Math.cos(az)/2.1,y=height(x,z),max=[-Math.PI/2,-Math.PI/2],distances=[0,0],values=[],peaks=[];
  const at=d=>{const h=height(x+dx*d,z+dz*d);if(!Number.isFinite(h))return null;const angles=[Math.atan2(h-y,d),Math.atan2(h-y-.32,d)];for(let k=0;k<2;k++)if(angles[k]>max[k]){max[k]=angles[k];distances[k]=d}return angles};
  for(let d=.05;d<=3200;d*=1.035){const a=at(d);if(a===null)break;values.push([d,...a])}
  for(let i=1;i<values.length-1;i++)if([1,2].some(k=>values[i][k]>=values[i-1][k]&&values[i][k]>=values[i+1][k]))peaks.push([values[i-1][0],values[i+1][0]]);
  let end=0;for(const[lo,hi]of peaks){for(let d=Math.max(lo,end);d<=hi;d+=(d<5?.001:.05))at(d);end=Math.max(end,hi)}
  return max.concat(distances);
 }
 for(let layer=first;layer<last;layer++){
  const data=new Float32Array(1024*512*4),az=(-22.5+layer*2.5)*Math.PI/180;
  for(let y=0;y<512;y++)for(let x=0;x<1024;x++)data.set(trace(-330+(x+.5)/1024*660,-405+(y+.5)/512*280,az),(y*1024+x)*4);
  const filtered=data.slice();
  for(let y=0;y<512;y++)for(let x=0;x<1024;x++)for(let c=2;c<4;c++){
   let minimum=Infinity;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)minimum=Math.min(minimum,data[(Math.max(0,Math.min(511,y+dy))*1024+Math.max(0,Math.min(1023,x+dx)))*4+c]);
   filtered[(y*1024+x)*4+c]=minimum;
  }
  const packed=packLayer(filtered);await fs.writeFile(path.join(directory,`layer-${layer}.bin`),Buffer.from(packed.buffer));console.log(`Prepared sky direction ${layer+1}/17`);
 }
 geometry.dispose();
}

async function main(){
 const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]},source=path.resolve(get('--source','lab/c7-scene'));
 if(args.includes('--worker'))return worker(source,get('--worker'),Number(get('--first')),Number(get('--last')));
 const output=path.resolve(get('--output',path.join(source,'sky-data'))),workers=Number(get('--workers','3'));
 if(!Number.isInteger(workers)||workers<1||workers>4)throw Error('--workers must be1..4');
 const before=await sourceHashes(source),directory=await fs.mkdtemp(path.join(os.tmpdir(),'c7-sky-horizon-')),start=performance.now();
 console.log('Preparing scene-specific sky visibility. Temporary directory:',directory);
 const jobs=await Promise.allSettled(Array.from({length:workers},(_,i)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--source',source,'--worker',directory,'--first',String(Math.floor(i*17/workers)),'--last',String(Math.floor((i+1)*17/workers))],{stdio:'inherit'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Sky worker failed: '+code)));
 })));
 for(const result of jobs)if(result.status==='rejected')throw Error(result.reason+'; temporary data retained at '+directory);
 if(JSON.stringify(before)!==JSON.stringify(await sourceHashes(source)))throw Error('Terrain changed during baking; previous field preserved');
 const layers=await Promise.all(Array.from({length:17},(_,i)=>fs.readFile(path.join(directory,`layer-${i}.bin`)))),bytes=Buffer.concat(layers);
 if(bytes.length!==512*256*17*8)throw Error('Unexpected packed field size');
 const gzip=encodeHorizonField(bytes,512,256),metadata={...FIELD,encoding:'C7HFv001-xyz-zigzag-byteplanes',kind:'Finite terrain horizons, layer-major little-endian RGBA16F. RG ground/32cm canopy angles; BA capped conservative blocker distance. Linear spatial/azimuth sampling, smooth2..8m fallback to ordinary shadows.',source:before,bytes:bytes.length,gzipBytes:gzip.length,sha256:hash(bytes),gzipSha256:hash(gzip),seconds:(performance.now()-start)/1000};
 await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'field.rgba16f.gz.pending'),gzip);await fs.writeFile(path.join(output,'field.json.pending'),JSON.stringify(metadata,null,2));
 await fs.rename(path.join(output,'field.rgba16f.gz.pending'),path.join(output,'field.rgba16f.gz'));await fs.rename(path.join(output,'field.json.pending'),path.join(output,'field.json'));
 await fs.rm(directory,{recursive:true});console.log(metadata);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
