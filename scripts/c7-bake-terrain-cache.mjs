import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {encodeIntegerTerrain} from './c7-terrain-codec.mjs';

// Same spatial sampling and v602 rounding policy; v608 changes transport only.
// Usage: --source <scene directory> [--output <cache directory>]
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 if(!['--source','--output'].includes(args[i])||!args[i+1])throw Error('Use --source <scene directory> [--output <cache directory>]');
 options[args[i]]=args[i+1];
}
if(!options['--source'])throw Error('--source is required');
const source=path.resolve(options['--source']),out=path.resolve(options['--output']??path.join(source,'terrain-cache'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceSha256=hash(await fs.readFile(path.join(source,'terrain.js')));
const {createTerrainGeometry}=await import(pathToFileURL(path.join(source,'terrain.js')));
const {decodeTerrain}=await import(pathToFileURL(path.join(source,'terrain-cache.js')));
const started=performance.now(),geometry=createTerrainGeometry();
try{
 const p=geometry.attributes.position,n=geometry.attributes.normal,shore=geometry.attributes.aShore;
 for(let k=0;k<p.count;k++){
  p.setY(k,Math.round(p.getY(k)*4096)/4096);
  for(let c=0;c<3;c++)n.array[k*3+c]=Math.round(n.array[k*3+c]*4096)/4096;
  shore.setX(k,Math.round(shore.getX(k)*1024)/1024);
 }
 const {payload,gzip,metadata}=encodeIntegerTerrain(geometry);
 const meta={...metadata,three:T.REVISION,sourceSha256,seconds:(performance.now()-started)/1000,
  precision:{positionY:1/4096,normalComponent:1/4096,shore:1/1024,kind:'Same v602 rounding to nearest step; x/z axes exact'},
  kind:'Full original grid; exact integer residual transport after existing rounding, including negative zero. Adaptive tessellation unchanged.'};
 const decoded=decodeTerrain(payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength),meta);
 try{
  for(const[name,a]of Object.entries(decoded.attributes))if(hash(a.array)!==meta.geometryHashes[name])throw Error('Terrain codec roundtrip '+name);
  if(hash(decoded.index.array)!==meta.geometryHashes.index)throw Error('Terrain index roundtrip');
 }finally{decoded.dispose();}
 if(hash(await fs.readFile(path.join(source,'terrain.js')))!==sourceSha256)throw Error('Terrain source changed during bake');
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'geometry.bin.gz.pending'),gzip);
 await fs.writeFile(path.join(out,'manifest.json.pending'),JSON.stringify(meta,null,2));
 await fs.rename(path.join(out,'geometry.bin.gz.pending'),path.join(out,'geometry.bin.gz'));
 await fs.rename(path.join(out,'manifest.json.pending'),path.join(out,'manifest.json'));
 console.log(meta);
}finally{geometry.dispose();}
