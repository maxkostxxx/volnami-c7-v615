import * as T from 'three';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {heightAt,shoreDistance,referenceCamera} from '../lab/c7-scene/terrain.js';
import {decodeTerrain} from '../lab/c7-scene/terrain-cache.js';
import {adaptTerrain} from '../lab/c7-scene/adaptive-terrain.js';
import {createGrass} from '../lab/c7-scene/grass.js';
import {createFarGrass} from '../lab/c7-scene/far-grass.js';
import {createGrassAsync} from '../lab/c7-snapshots/cooperative-grass-v405/grass.js';
import {createFarGrassAsync} from '../lab/c7-snapshots/cooperative-grass-v405/far-grass.js';
const output='evidence/cooperative-grass-v405-construction';await mkdir(output,{recursive:true});
const payload=gunzipSync(await readFile('lab/c7-scene/terrain-cache/geometry.bin.gz'));
const geometry=adaptTerrain(decodeTerrain(payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength),JSON.parse(await readFile('lab/c7-scene/terrain-cache/manifest.json'))));
const options={heightAt,shoreDistance,rootHeightAt:geometry.userData.adaptiveTerrain.heightAt,rootNormalAt:geometry.userData.adaptiveTerrain.normalAt,referenceCamera,depthStretch:2.1,depthPivot:85};
function signature(group){const hash=createHash('sha256');group.traverse(m=>{if(!m.geometry)return;hash.update(m.name);for(const[name,a]of Object.entries(m.geometry.attributes)){hash.update(name);hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}hash.update(new Uint8Array(m.geometry.index.array.buffer));hash.update(JSON.stringify({box:m.geometry.boundingBox,sphere:m.geometry.boundingSphere,count:m.geometry.instanceCount}));});return hash.digest('hex');}
const runs=[];
for(const [name,sync,async]of[['near-low',createGrass,createGrassAsync],['near-normal',createGrass,createGrassAsync],['far',createFarGrass,createFarGrassAsync]]){
 const opts={...options,quality:name==='near-low'?'low':'high'};
 let start=performance.now(),baseline=sync(opts),expected=signature(baseline),syncMs=performance.now()-start;baseline.userData.dispose();baseline=null;
 let beats=0,last=performance.now(),maxGap=0;const timer=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;beats++;},10);
 start=performance.now();const candidate=await async(opts),asyncMs=performance.now()-start;clearInterval(timer);
 const actual=signature(candidate);candidate.userData.dispose();
 runs.push({name,expected,actual,exact:expected===actual,syncMs,asyncMs,beats,maxGap});console.log(runs.at(-1));
 const controller=new AbortController();let disposedGeometry=0,disposedMaterial=0;const gd=T.BufferGeometry.prototype.dispose,md=T.Material.prototype.dispose;
 T.BufferGeometry.prototype.dispose=function(){disposedGeometry++;return gd.call(this)};T.Material.prototype.dispose=function(){disposedMaterial++;return md.call(this)};
 const abortTimer=setTimeout(()=>controller.abort(),60);let error;
 try{await async(opts,{signal:controller.signal});}catch(e){error=e.name;}finally{clearTimeout(abortTimer);T.BufferGeometry.prototype.dispose=gd;T.Material.prototype.dispose=md;}
 runs.at(-1).abort={error,disposedGeometry,disposedMaterial,pass:error==='AbortError'&&disposedMaterial===1};
}
geometry.dispose();
const pass=runs.every(r=>r.exact&&r.beats>10&&r.abort.pass);
await writeFile(output+'/results.json',JSON.stringify({pass,kind:'Node CPU construction; byte hashes of every instance/topology/bounds, event-loop responsiveness and cancellation. Not GPU FPS.',runs},null,2));if(!pass)process.exitCode=1;
