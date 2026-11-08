import * as T from 'three';

// Same five Vogel offsets and per-pixel IGN rotation as Three r186 PCF.
// Rotate constant disk vectors with one sin/cos pair instead of evaluating
// sin/cos(phi + theta) independently for all five samples. No map/radius,
// sample count, PCF weights or light changes. Scoped to this laboratory page.
const key='shadowmap_pars_fragment';
const original=T.ShaderChunk[key], start=original.indexOf('float getShadow( sampler2DShadow'), end=original.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',start);
if(start<0||end<start)throw new Error('Directional PCF function changed');
let chunk=original.slice(start,end);
const phase='float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;';
if(chunk.split(phase).length!==2)throw new Error('PCF phase changed; review shader optimization');
chunk=chunk.replace(phase,phase+'\n vec2 c7Rot=vec2(cos(phi),sin(phi)); mat2 c7DiskRotation=mat2(c7Rot.x,c7Rot.y,-c7Rot.y,c7Rot.x);');
for(let i=0;i<5;i++){
 const source=`vogelDiskSample( ${i}, 5, phi )`;
 if(chunk.split(source).length!==2)throw new Error('PCF sample changed; review shader optimization');
 const r=Math.sqrt((i+.5)/5),theta=i*2.399963229728653;
 chunk=chunk.replace(source,`(c7DiskRotation * vec2(${(r*Math.cos(theta)).toFixed(12)},${(r*Math.sin(theta)).toFixed(12)}))`);
}
T.ShaderChunk[key]=original.slice(0,start)+chunk+original.slice(end);
