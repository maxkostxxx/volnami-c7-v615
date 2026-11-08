import fs from'node:fs/promises';import{gunzipSync,gzipSync}from'node:zlib';
const out='evidence/c7-v566-field-compression';let rows=JSON.parse(await fs.readFile(out+'/results.json'));
for(const[name,w,h]of[['sky-data',512,256],['left-sky-data',256,128]]){
const raw=gunzipSync(await fs.readFile(`lab/c7-scene/${name}/field.rgba16f.gz`)),v=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2),meta=JSON.parse(await fs.readFile(out+'/'+name+'/codec.json'));let best=await fs.readFile(out+'/'+name+'/field.rgba16f.gz'),bestMode=meta.mode;
for(const mode of['xy-zigzag','layer-zigzag','xyz-delta','xyz-zigzag']){
 const code=new Uint16Array(v.length);let at=0;for(let c=0;c<4;c++)for(let l=0;l<17;l++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=((l*h+y)*w+x)*4+c,a=x?v[i-4]:0,b=y?v[i-w*4]:0,d=x&&y?v[i-w*4-4]:0,z=l?v[i-w*h*4]:0;
  let pred=mode.startsWith('layer')?z:x&&y?a+b-d:x?a:b;
  if(mode.startsWith('xyz')&&l){const za=x?v[i-w*h*4-4]:0,zb=y?v[i-w*h*4-w*4]:0,zd=x&&y?v[i-w*h*4-w*4-4]:0;pred+=z-(x&&y?za+zb-zd:x?za:zb);}
  const delta=(v[i]-pred)<<16>>16;code[at++]=mode.endsWith('zigzag')?(delta<<1)^(delta>>15):delta;
 }
 for(const pack of['bytes','bits']){
 const bytes=new Uint8Array(raw.length);if(pack==='bytes')for(let i=0;i<code.length;i++){bytes[i]=code[i]&255;bytes[i+code.length]=code[i]>>8;}else for(let bit=0;bit<16;bit++)for(let i=0;i<code.length;i+=8){let value=0;for(let j=0;j<8;j++)value|=((code[i+j]>>bit)&1)<<j;bytes[bit*code.length/8+i/8]=value;}
 const compressed=gzipSync(bytes,{level:9}),id=mode+(pack==='bits'?'-bits':'');rows.push({name,mode:id,bytes:compressed.length});console.log(name,id,compressed.length);if(compressed.length<best.length){best=compressed;bestMode=id;}
 }
}
 await fs.writeFile(out+'/'+name+'/field.rgba16f.gz',best);await fs.writeFile(out+'/'+name+'/codec.json',JSON.stringify({...meta,mode:bestMode},null,2));
}await fs.writeFile(out+'/results.json',JSON.stringify(rows,null,2));
