import fs from 'node:fs/promises';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import{encodeHorizonField,isEncodedHorizon}from'./c7-horizon-codec.mjs';
// Idempotent authoring transport conversion; the original numerical field is retained.
const source=process.env.QA_SOURCE??'lab/c7-scene';
for(const[name,w,h]of[['sky-data',512,256],['left-sky-data',256,128]]){
 const dir=source+'/'+name,original=await fs.readFile(dir+'/field.rgba16f.gz'),meta=JSON.parse(await fs.readFile(dir+'/field.json'));
 if(isEncodedHorizon(original)){console.log(name,'already encoded');continue;}
 const raw=gunzipSync(original),hash=b=>createHash('sha256').update(b).digest('hex');
 if(hash(raw)!==(meta.sha256??meta.rawSha256))throw Error('Raw horizon hash changed');
 const encoded=encodeHorizonField(raw,w,h),next={...meta,encoding:'C7HFv001-xyz-zigzag-byteplanes',gzipBytes:encoded.length,gzipSha256:hash(encoded)};
 await fs.writeFile(dir+'/field.rgba16f.gz.pending',encoded);await fs.writeFile(dir+'/field.json.pending',JSON.stringify(next,null,2));
 await fs.rename(dir+'/field.rgba16f.gz.pending',dir+'/field.rgba16f.gz');await fs.rename(dir+'/field.json.pending',dir+'/field.json');console.log(name,original.length,'->',encoded.length);
}
