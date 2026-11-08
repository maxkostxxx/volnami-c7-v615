// Run after the existing full-precision horizon bake. Idempotent on C7HQv001.
import fs from'node:fs/promises';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import * as T from'three';
import{decodeHorizonField}from'../lab/c7-scene/sky-horizon.js';
import{encodeCompactHorizonField}from'./c7-horizon-codec.mjs';
const root=process.argv[2]??'lab/c7-scene',sha=b=>createHash('sha256').update(b).digest('hex');
for(const[name,w,h,scales]of[['sky-data',512,256,[2048,2048,32,32]],['left-sky-data',256,128,[2048,2048,1024,1024]]]){
 const dir=root+'/'+name,meta=JSON.parse(await fs.readFile(dir+'/field.json')),input=await fs.readFile(dir+'/field.rgba16f.gz');
 if(meta.gzipSha256!==sha(input))throw Error('Damaged field '+name);
 if(meta.encoding==='C7HQv001-fixed-point-xyz'){console.log(name,'already compact');continue;}
 const b=gunzipSync(input),raw=await decodeHorizonField(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),w,h);
 const {gzip,restored,maxAbsoluteError}=encodeCompactHorizonField(Buffer.from(raw.buffer),w,h,scales,T.DataUtils);
 const next={...meta,encoding:'C7HQv001-fixed-point-xyz',precision:{scales,maxAbsoluteError,kind:'Quantized authoring field; full dimensions/layers retained'},originalRawSha256:sha(raw),sha256:sha(restored),rawSha256:sha(restored),gzipBytes:gzip.length,gzipSha256:sha(gzip)};
 // Validate by the production decoder before replacing either authoring file.
 const c=gunzipSync(gzip);await decodeHorizonField(c.buffer.slice(c.byteOffset,c.byteOffset+c.byteLength),w,h);
 await fs.writeFile(dir+'/field.rgba16f.gz.pending',gzip);await fs.writeFile(dir+'/field.json.pending',JSON.stringify(next,null,2));
 await fs.rename(dir+'/field.rgba16f.gz.pending',dir+'/field.rgba16f.gz');await fs.rename(dir+'/field.json.pending',dir+'/field.json');console.log(name,input.length,'->',gzip.length);
}
