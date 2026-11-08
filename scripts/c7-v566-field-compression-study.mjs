import fs from'node:fs/promises';import{gunzipSync,gzipSync}from'node:zlib';import{createHash}from'node:crypto';
const out='evidence/c7-v566-field-compression';await fs.mkdir(out,{recursive:true});const rows=[];
for(const[name,width,height]of[['sky-data',512,256],['left-sky-data',256,128]]){
 const gz=await fs.readFile(`lab/c7-scene/${name}/field.rgba16f.gz`),raw=gunzipSync(gz),v=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2),plane=width*height;
 let best;
 for(const mode of['shuffle','x-xor','x-delta','xy-xor','xy-delta','layer-xor','layer-delta']){
 const coded=new Uint16Array(v.length);let at=0;
 for(let c=0;c<4;c++)for(let l=0;l<17;l++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const i=((l*height+y)*width+x)*4+c,a=x?v[i-4]:0,b=y?v[i-width*4]:0,d=x&&y?v[i-width*4-4]:0;
 let pred=mode.startsWith('xy')?x&&y?a+b-d:x?a:b:mode.startsWith('x-')?a:mode.startsWith('layer')?l?v[i-plane*4]:0:0;pred&=65535;
 coded[at++]=mode.endsWith('delta')?v[i]-pred:v[i]^pred;
 }
 const bytes=new Uint8Array(raw.byteLength);for(let i=0;i<coded.length;i++){bytes[i]=coded[i]&255;bytes[i+coded.length]=coded[i]>>8;}
 const compressed=gzipSync(bytes,{level:9});rows.push({name,mode,original:gz.length,bytes:compressed.length,saving:1-compressed.length/gz.length});
 if(!best||compressed.length<best.bytes.length)best={mode,bytes:compressed};
 }
 await fs.mkdir(out+'/'+name,{recursive:true});await fs.writeFile(out+'/'+name+'/field.rgba16f.gz',best.bytes);await fs.writeFile(out+'/'+name+'/codec.json',JSON.stringify({width,height,layers:17,channels:4,mode:best.mode,rawSha256:createHash('sha256').update(raw).digest('hex'),gzipSha256:createHash('sha256').update(best.bytes).digest('hex')},null,2));console.log(name,best.mode,gz.length,best.bytes.length);
}
await fs.writeFile(out+'/results.json',JSON.stringify(rows,null,2));
