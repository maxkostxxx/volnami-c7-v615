// Lossless C7HFv001 transport for layer-major RGBA16F. No quantization.
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export function encodeHorizonField(raw,width,height,depth=17){
 if(raw.length!==width*height*depth*8)throw Error('Invalid horizon dimensions');
 const source=new Uint16Array(raw.buffer,raw.byteOffset,raw.length/2),count=source.length;
 const bytes=Buffer.alloc(raw.length+64);bytes.write('C7HFv001');
 [width,height,depth,4,raw.length,1].forEach((v,i)=>bytes.writeUInt32LE(v,8+i*4));
 createHash('sha256').update(raw).digest().copy(bytes,32);
 let at=0;const row=width*4,plane=row*height;
 for(let c=0;c<4;c++)for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=z*plane+y*row+x*4+c,a=x?source[i-4]:0,b=y?source[i-row]:0,d=x&&y?source[i-row-4]:0;
  let prediction=x&&y?a+b-d:x?a:b;
  if(z){const a0=x?source[i-plane-4]:0,b0=y?source[i-plane-row]:0,d0=x&&y?source[i-plane-row-4]:0;prediction+=source[i-plane]-(x&&y?a0+b0-d0:x?a0:b0);}
  const delta=(source[i]-prediction)<<16>>16,value=(delta<<1)^(delta>>15);
  bytes[64+at]=value&255;bytes[64+count+at]=value>>>8;at++;
 }
 return gzipSync(bytes,{level:9});
}
export function isEncodedHorizon(gzip){return ['C7HFv001','C7HQv001'].includes(gunzipSync(gzip).subarray(0,8).toString());}

// Bounded fixed-point transport. Dimensions/layers and the shader's RGBA16F
// representation are unchanged; this is explicitly NOT a lossless source field.
export function encodeCompactHorizonField(raw,width,height,scales,half){
 if(raw.byteLength!==width*height*17*8||scales.length!==4)throw Error('Invalid compact field');
 const source=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2);
 const values=Int16Array.from(source,(v,i)=>{
  const n=Math.round(half.fromHalfFloat(v)*scales[i%4]);
  if(!Number.isFinite(n)||n< -32768||n>32767)throw Error('Fixed-point horizon overflow');
  return n;
 });
 const restored=Uint16Array.from(values,(v,i)=>half.toHalfFloat(v/scales[i%4]));
 const bytes=Buffer.alloc(raw.byteLength+80),count=values.length,row=width*4,plane=row*height;
 bytes.write('C7HQv001');[width,height,17,4,raw.byteLength,1].forEach((v,i)=>bytes.writeUInt32LE(v,8+i*4));
 createHash('sha256').update(restored).digest().copy(bytes,32);
 scales.forEach((v,i)=>bytes.writeFloatLE(v,64+i*4));let at=0;
 for(let c=0;c<4;c++)for(let z=0;z<17;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=z*plane+y*row+x*4+c,a=x?values[i-4]:0,b=y?values[i-row]:0,d=x&&y?values[i-row-4]:0;
  let prediction=x&&y?a+b-d:x?a:b;
  if(z){const a0=x?values[i-plane-4]:0,b0=y?values[i-plane-row]:0,d0=x&&y?values[i-plane-row-4]:0;prediction+=values[i-plane]-(x&&y?a0+b0-d0:x?a0:b0);}
  const delta=(values[i]-prediction)<<16>>16,value=(delta<<1)^(delta>>15);
  bytes[80+at]=value&255;bytes[80+count+at]=value>>>8;at++;
 }
 const maxAbsoluteError=Array.from({length:4},(_,c)=>{
  let max=0;for(let i=c;i<count;i+=4)max=Math.max(max,Math.abs(half.fromHalfFloat(source[i])-half.fromHalfFloat(restored[i])));return max;
 });
 return{gzip:gzipSync(bytes,{level:9}),restored,maxAbsoluteError};
}
