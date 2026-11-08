/**
 * Extract an approximate cloud-coverage scalar from a CC0 HDR sky photograph.
 * This is a 3D-material data bake, not RGB sky retouching or a landscape image.
 * R/B chromatic response is based on the cloud-classification principle in
 * https://doi.org/10.5194/amt-5-2881-2012 . Unlike that calibrated instrument
 * study, we have no matched clear-sky library, so the result is ART-DIRECTED
 * COVERAGE, not a measured cloud optical depth.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {FloatType} from 'three';
const dir=path.dirname(new URL(import.meta.url).pathname);
const source='citrus_orchard_road_puresky_8k.hdr';
const bytes=await fs.readFile(path.join(dir,source));
const hdr=new HDRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const w=4096,h=2048,ratios=new Float32Array(w*h),lum=new Float32Array(w*h);
let maxLum=0,sunX=0,sunY=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let r=0,b=0,l=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const k=((y*2+j)*hdr.width+x*2+i)*4;
  r+=hdr.data[k];b+=hdr.data[k+2];l+=hdr.data[k]*.2126+hdr.data[k+1]*.7152+hdr.data[k+2]*.0722;
 }
 const p=y*w+x;ratios[p]=Math.log(Math.max(r,1e-6)/Math.max(b,1e-6));lum[p]=l*.25;
 if(y<h/2&&lum[p]>maxLum){maxLum=lum[p];sunX=x;sunY=y}
}
// Robust per-elevation clear-air and cloudy envelopes; smoothing prevents
// row boundaries. A whole azimuth band is used, so the periodic seam matches.
const quantiles=Array.from({length:h/2},()=>[0,0]);
for(let y=0;y<h/2;y++){
 const row=[];for(let x=0;x<w;x+=4)row.push(ratios[y*w+x]);row.sort((a,b)=>a-b);
 quantiles[y]=[row[Math.floor(row.length*.06)],row[Math.floor(row.length*.92)]];
}
const qSmooth=quantiles.map((q,y)=>{
 let a=0,b=0,sum=0;for(let j=-40;j<=40;j++){const yy=Math.min(h/2-1,Math.max(0,y+j)),weight=Math.exp(-j*j/(2*18*18));a+=quantiles[yy][0]*weight;b+=quantiles[yy][1]*weight;sum+=weight}return[a/sum,b/sum];
});
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
const sunAz=sunX/w*Math.PI*2,sunAlt=Math.PI/2-sunY/h*Math.PI;
const out=Buffer.alloc(w*h);let min=1,max=0,sum=0,count=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 // Lower hemisphere has no photo radiance or terrain. It is a neutral scalar.
 let coverage=.5;
 if(y<h/2){
  const [clear,cloudy]=qSmooth[y],span=Math.max(.08,cloudy-clear);
  coverage=smooth(.04,.96,(ratios[y*w+x]-clear)/span);
  // The original disk/aureole must never survive as a baked second light.
  const az=x/w*Math.PI*2,alt=Math.PI/2-y/h*Math.PI;
  const angular=Math.acos(Math.min(1,Math.max(-1,Math.sin(alt)*Math.sin(sunAlt)+Math.cos(alt)*Math.cos(sunAlt)*Math.cos(az-sunAz))));
  coverage=.5+(coverage-.5)*smooth(3*Math.PI/180,7*Math.PI/180,angular);
  // The precise zenith is a projection singularity; fade tiny top cap.
  coverage=.5+(coverage-.5)*smooth(0,.04,y/(h/2));
  if(alt>12*Math.PI/180&&alt<40*Math.PI/180){min=Math.min(min,coverage);max=Math.max(max,coverage);sum+=coverage;count++}
 }
 out[y*w+x]=Math.round(255*coverage);
}
// Make the periodic data boundary exact over 8 columns (0.7 degrees); this
// touches only the numeric field, preserves the unmodified HDR source, and
// avoids a discontinuity during a full camera orbit or environment capture.
for(let y=0;y<h/2;y++){
 const edge=(out[y*w]+out[y*w+w-1])*.5;
 for(let x=0;x<8;x++){
  const weight=smooth(0,8,x);
  out[y*w+x]=Math.round(edge+(out[y*w+x]-edge)*weight);
  out[y*w+w-1-x]=Math.round(edge+(out[y*w+w-1-x]-edge)*weight);
 }
}
const outfile='cloud-coverage-4k.webp';
await sharp(out,{raw:{width:w,height:h,channels:1}}).webp({lossless:true,effort:6}).toFile(path.join(dir,outfile));
// Gray preview shows extracted numeric data, not final sky colors.
await sharp(out,{raw:{width:w,height:h,channels:1}}).resize(2048,1024).png().toFile(path.join(dir,'research/cloud-coverage-preview.png'));
const written=await fs.readFile(path.join(dir,outfile));
const manifest={source,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),output:outfile,outputSha256:crypto.createHash('sha256').update(written).digest('hex'),outputBytes:written.length,width:w,height:h,encoding:'8-bit scalar, lossless WebP, NoColorSpace',license:'CC0-1.0',sourcePage:'https://polyhaven.com/a/citrus_orchard_road_puresky',authors:{'Dimitrios Savva':'Photography','Jarod Guest':'Processing'},algorithm:'linear HDR 2x2 average; log(red/blue); 6th/92nd percentile envelopes per elevation, Gaussian-smoothed sigma18 rows; smooth coverage; source sun 3–7 degree mask to neutral; neutral lower hemisphere; 8-column periodic edge feather',limitations:['Estimated cloud coverage, not calibrated physical optical depth.','No original RGB or radiance is included in the data texture.','4K angular detail is appropriate for thin soft clouds, not a sharp photographic background.'],sourceSun:{u:sunX/w,vTop:sunY/h,altitudeDegrees:sunAlt*180/Math.PI,maskDegrees:[3,7]},recommendedMapping:{centerU:.663,azimuthScale:2.1,elevationOffsetDegrees:12,elevationScale:2.5},coverageStats12To40Degrees:{min,max,mean:sum/count},generatedAt:new Date().toISOString()};
await fs.writeFile(path.join(dir,'runtime-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
