import * as T from 'three';
import {rearMeadowData} from './rear-meadow-data.js';

// This small exact mask replaces only the static ownerAt sampling. The
// original calculation below remains the fallback for a failed decode.
export async function prepareRearMeadowOwner({signal}={}){
 signal?.throwIfAborted();
 const bytes=Uint8Array.from(atob(rearMeadowData.gzipBase64),c=>c.charCodeAt(0));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'),{signal});
 const data=new Uint8Array(await new Response(stream).arrayBuffer());
 signal?.throwIfAborted();
 if(data.length!==rearMeadowData.width*rearMeadowData.height)throw Error('Invalid rear meadow mask size');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
 signal?.throwIfAborted();
 if(hash!==rearMeadowData.sha256)throw Error('Rear meadow mask checksum mismatch');
 return data;
}

// Art direction: a pale meadow on the whole bounded rear-owner
// patch. Its species/albedo are NOT inferred physical measurements. This only
// changes diffuse material reflectance before the ordinary PBR lighting path;
// no emissive term, light gain, screen mask, baked shadow or fog is introduced.
const declarations = /* glsl */`
uniform float uRearMeadowStrength,uRearMeadowStretch,uRearMeadowPivot;
uniform vec3 uRearMeadowRoot,uRearMeadowTip;
uniform sampler2D uRearMeadowOwner;
float c7RearMeadowMask(vec3 world){
 float z=uRearMeadowPivot+(world.z-uRearMeadowPivot)/uRearMeadowStretch;
 vec2 uv=(vec2(world.x,z)-vec2(-155.,-420.))/vec2(160.,145.);
 float interior=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 return clamp(uRearMeadowStrength,0.,1.)*texture2D(uRearMeadowOwner,uv).r*interior;
}
vec3 c7RearMeadowTip(vec3 oldTip,vec3 world){
 return mix(oldTip,uRearMeadowTip,c7RearMeadowMask(world));
}
`;

export function applyRearMeadow({ground,farGrass,grass,depthStretch=2.1,depthPivot=85,
 strength=.8,rootColor='#bcc58d',tipColor='#c8ce9b',ownerAt,ownerData}={}){
 if(!ground?.isMesh)throw new TypeError('Rear meadow requires the terrain mesh');
 if(typeof ownerAt!=='function')throw new TypeError('Rear meadow requires a real terrain-owner function');
 const width=320,height=290,data=ownerData??new Uint8Array(width*height);
 if(!(data instanceof Uint8Array)||data.length!==width*height)throw Error('Invalid rear meadow owner data');
 if(!ownerData)for(let j=0;j<height;j++)for(let i=0;i<width;i++)data[j*width+i]=Math.round(255*T.MathUtils.clamp(ownerAt(-155+(i+.5)/width*160,-420+(j+.5)/height*145),0,1));
 const ownerTexture=new T.DataTexture(data,width,height,T.RedFormat,T.UnsignedByteType);
 ownerTexture.minFilter=ownerTexture.magFilter=T.LinearFilter;ownerTexture.wrapS=ownerTexture.wrapT=T.ClampToEdgeWrapping;ownerTexture.needsUpdate=true;
 const uniforms={uRearMeadowOwner:{value:ownerTexture},uRearMeadowStrength:{value:strength},uRearMeadowStretch:{value:depthStretch},uRearMeadowPivot:{value:depthPivot},uRearMeadowRoot:{value:new T.Color(rootColor)},uRearMeadowTip:{value:new T.Color(tipColor)}};
 const edited=[],seen=new Set();
 function install(material,kind){
  if(seen.has(material))return;seen.add(material);
  if(material.userData.rearMeadowCandidate)throw new Error('Rear meadow already installed');
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey,baseKey=key.call(material);
  const world={ground:'vTurfWorld',far:'vFarGrassRootWorld',near:'vGrassWorld'}[kind];
  const oldAlbedo=kind==='ground'?'diffuse':kind==='far'?'mix(uRootColor,uTipColor,pow(clamp(vFarGrassHeight,0.,1.),1.45)*uTipAlbedoStrength)':'mix(uRootColor,uTipColor,pow(clamp(vGrassHeight,0.,1.),1.55))';
  const newAlbedo=kind==='ground'?'uRearMeadowRoot':kind==='far'?'mix(uRearMeadowRoot,uRearMeadowTip,pow(clamp(vFarGrassHeight,0.,1.),1.45)*uTipAlbedoStrength)':'mix(uRearMeadowRoot,uRearMeadowTip,pow(clamp(vGrassHeight,0.,1.),1.55))';
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
   if(!shader.fragmentShader.includes(world))throw new Error('Rear meadow world coordinate missing: '+kind);
   const marker='#include <roughnessmap_fragment>';
   if(!shader.fragmentShader.includes(marker))throw new Error('Rear meadow PBR material insertion point missing');
   shader.fragmentShader=declarations+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace(marker,`
    vec3 rearOldAlbedo=${oldAlbedo},rearNewAlbedo=${newAlbedo};
    vec3 rearAlbedoCandidate=min(diffuseColor.rgb*rearNewAlbedo/max(rearOldAlbedo,vec3(.0001)),vec3(.9));
    diffuseColor.rgb=mix(diffuseColor.rgb,rearAlbedoCandidate,c7RearMeadowMask(${world}));
    ${marker}`);
   const tipSource=kind==='ground'?'uTurfTipColor * fibreLuminance':kind==='far'?'uTipColor * vFarGrassShade':'uTipColor * vGrassShade';
   if(!shader.fragmentShader.includes(tipSource))throw new Error('Rear meadow canopy tip insertion point missing: '+kind);
   shader.fragmentShader=shader.fragmentShader.replace(tipSource,`c7RearMeadowTip(${kind==='ground'?'uTurfTipColor':'uTipColor'},${world}) * ${kind==='ground'?'fibreLuminance':kind==='far'?'vFarGrassShade':'vGrassShade'}`);
  };
  material.customProgramCacheKey=()=>baseKey+'|rear-continuous-owner-albedo-v1-'+kind;
  material.userData.rearMeadowCandidate={kind,uniforms};material.needsUpdate=true;edited.push({material,previous,key});
 }
 install(ground.material,'ground');
 for(const[group,kind]of[[farGrass,'far'],[grass,'near']])group?.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))install(m,kind)});
 return{uniforms,materialCount:edited.length,dispose(){ownerTexture.dispose();for(const{material,previous,key}of edited){material.onBeforeCompile=previous;material.customProgramCacheKey=key;delete material.userData.rearMeadowCandidate;material.needsUpdate=true;}}};
}
