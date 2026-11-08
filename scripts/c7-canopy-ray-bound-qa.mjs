import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {decodeTerrain} from '../lab/c7-scene/terrain-cache.js';
import {adaptTerrain} from '../lab/c7-scene/adaptive-terrain.js';
import * as base from '../lab/c7-scene/trees.js';
import * as cand from '../lab/c7-snapshots/canopy-ray-bound-v515/trees.js';
const out='evidence/canopy-ray-bound-v515-cpu';await fs.mkdir(out,{recursive:true});
const meta=JSON.parse(await fs.readFile('lab/c7-scene/terrain-cache/manifest.json'));
const bytes=gunzipSync(await fs.readFile('lab/c7-scene/terrain-cache/geometry.bin.gz'));
const g=adaptTerrain(decodeTerrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta));g.computeBoundingBox();
const sample=g.userData.adaptiveTerrain.heightAt,maxTerrainHeight=g.boundingBox.max.y+1;
const previous=JSON.parse(await fs.readFile('evidence/left-middle-depth-v511-trees/placement.json'));
const trees=previous.rows.at(-1).trees.map(t=>({name:t.name,bounds:new T.Box3(new T.Vector3(...t.min),new T.Vector3(...t.max))}));
const authoredZFromWorld=z=>85+(z-85)/2.1;
let mismatches=0,baselineSamples=0,candidateSamples=0,baseMs=0,candMs=0,fields=0,clearances=0;
let seed=537;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const directions=[];
for(let i=0;i<=128;i++){const phase=i/128,angle=phase*Math.PI,day=Math.sin(angle),drop=T.MathUtils.lerp(.03861850296119363,.05450711909413477,phase)*Math.cos(angle)**2;directions.push(new T.Vector3(-.49/2.1*Math.cos(angle),(.022+.85*day-drop)/2.1,-.87).normalize());}
for(let i=0;i<128;i++)directions.push(new T.Vector3(rand()*2-1,rand()*.8,rand()*2-1).normalize());
for(const direction of directions)for(const tree of trees){
 const center=tree.bounds.getCenter(new T.Vector3()),heights=new T.Vector3(tree.bounds.min.y,center.y,tree.bounds.max.y);
 const opts={center,heights,bounds:tree.bounds,direction,angularRadius:.00465,authoredZFromWorld};
 let t=performance.now();const a=base.computeCanopyTerrainClearance({...opts,heightAt:(x,z)=>{baselineSamples++;return sample(x,z)}});const af=base.buildSolarTerrainField({...opts,heightAt:(x,z)=>{baselineSamples++;return sample(x,z)}});baseMs+=performance.now()-t;
 t=performance.now();const b=cand.computeCanopyTerrainClearance({...opts,maxTerrainHeight,heightAt:(x,z)=>{candidateSamples++;return sample(x,z)}});const bf=cand.buildSolarTerrainField({...opts,maxTerrainHeight,heightAt:(x,z)=>{candidateSamples++;return sample(x,z)}});candMs+=performance.now()-t;
 clearances++;fields++;
 if(!a.equals(b)||!Buffer.from(af.data.buffer).equals(Buffer.from(bf.data.buffer)))mismatches++;
}
g.dispose();
const result={kind:'Finite CPU exactness against unchanged original, actual v512 adaptive terrain,13 tree bounds,129 solar plus128 deterministic arbitrary directions. Full nine-node float32 horizon fields include dominant-occluder distance. CPU timing is interleaved base/candidate, not frame FPS.',maxTerrainHeight,clearances,fields,mismatches,baselineSamples,candidateSamples,sampleReduction:1-candidateSamples/baselineSamples,baseMs,candMs,pass:mismatches===0};
await fs.writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(result);if(!result.pass)process.exitCode=1;
