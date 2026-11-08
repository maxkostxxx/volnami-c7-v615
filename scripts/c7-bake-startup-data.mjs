import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

// Exact small inputs, not baked blade attributes or rendered illumination.
// Usage: node scripts/c7-bake-startup-data.mjs --source lab/c7-scene
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--source')throw Error('Use --source <scene directory>');
const source=path.resolve(args[1]),output=path.join(source,'startup-data');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=['terrain.js','adaptive-terrain.js','far-grass.js','atmosphere.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(inputs.map(async name=>[name,sha(await fs.readFile(path.join(source,name)))])));
const sources=await hashes(),started=performance.now();
const {heightAt,shoreDistance,referenceCamera}=await import(pathToFileURL(path.join(source,'terrain.js')));
const {createFarGrassPlacement}=await import(pathToFileURL(path.join(source,'far-grass.js')));
const {createAtmosphereVisibility}=await import(pathToFileURL(path.join(source,'atmosphere.js')));
const placement=createFarGrassPlacement({heightAt,shoreDistance,referenceCamera,depthStretch:2.1,depthPivot:85});
const values=new ArrayBuffer((placement.cells.length+placement.fillCells.length)*24),view=new DataView(values);
let offset=0;
for(const cell of [...placement.cells,...placement.fillCells])for(const value of[cell.x,cell.z,cell.weight]){view.setFloat64(offset,value,true);offset+=8;}
const placementGzip=gzipSync(new Uint8Array(values),{level:9});
if(placementGzip.byteLength>200*1024)throw Error('Placement exceeds reviewed 200KiB transport budget');
const field=createAtmosphereVisibility(heightAt);
try{
 if(field.texture.image.data.byteLength!==65536)throw Error('Unexpected atmosphere dimensions');
 const raw=Buffer.concat([Buffer.from(field.texture.image.data),Buffer.from(values)]);
 // Byte planes improve compression while retaining every Float64 bit.
 const transport=Buffer.alloc(raw.length),count=placement.cells.length+placement.fillCells.length;
 raw.copy(transport,0,0,65536);
 for(let c=0;c<24;c++)for(let i=0;i<count;i++)transport[65536+c*count+i]=raw[65536+i*24+c];
 const gzip=gzipSync(transport,{level:9});
 const manifest={schema:1,format:'C7-startup-uint8-float64-v1',transport:'byteplanes24-v1',sources,
  parameters:{depthStretch:2.1,depthPivot:85,reference:{fov:referenceCamera.fov,aspect:referenceCamera.aspect,position:referenceCamera.position.toArray(),quaternion:referenceCamera.quaternion.toArray()}},
  bytes:raw.length,gzipBytes:gzip.length,sha256:sha(raw),gzipSha256:sha(gzip),
  placement:{cells:placement.cells.length,fillCells:placement.fillCells.length},
  atmosphere:{minimumHeight:field.minimumHeight,heightRange:field.heightRange,stats:{...field.stats,buildMilliseconds:0}}};
 if(JSON.stringify(await hashes())!==JSON.stringify(sources))throw Error('Startup inputs changed during bake');
 const manifestBytes=JSON.stringify(manifest,null,2)+'\n',key=`// Generated with the exact static fields; verified again during packaging.\nexport const startupDataKey='${sha(manifestBytes)}';\n`;
 await fs.mkdir(output,{recursive:true});
 for(const[name,data]of[['fields.bin.gz',gzip],['manifest.json',manifestBytes]]){await fs.writeFile(path.join(output,name+'.pending'),data);await fs.rename(path.join(output,name+'.pending'),path.join(output,name));}
 await fs.writeFile(path.join(source,'startup-data-key.js.pending'),key);await fs.rename(path.join(source,'startup-data-key.js.pending'),path.join(source,'startup-data-key.js'));
 console.log({source,rawBytes:raw.length,gzipBytes:gzip.length,placementGzipBytes:placementGzip.length,sha256:manifest.sha256,seconds:(performance.now()-started)/1000});
}finally{field.texture.dispose();}
