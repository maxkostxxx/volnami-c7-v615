import {fetchBinaryInput,decompressBinaryInput} from './binary-transfer.js';
import * as T from 'three';
import {createSkyTreeAtlas} from './sky-tree-atlas.js';

// C7HFv001 preserves original half-float bits. C7HQv001 predicts signed
// fixed-point samples, then reconstructs the declared quantized half-float
// field. Both validate the reconstructed SHA before texture upload.
// Old raw fields remain readable so older authoring tools stay compatible.
export async function decodeHorizonField(buffer,width,height,{signal}={}){
 signal?.throwIfAborted();
 const expected=width*height*17*8;
 if(buffer.byteLength===expected)return new Uint16Array(buffer);
 if(![expected+64,expected+80].includes(buffer.byteLength))throw Error('Invalid encoded horizon size');
 const bytes=new Uint8Array(buffer),header=new DataView(buffer);
 const magic=new TextDecoder().decode(bytes.subarray(0,8)),quantized=magic==='C7HQv001',offset=quantized?80:64;
 if(buffer.byteLength!==expected+offset)throw Error('Invalid horizon payload size');
 const scales=quantized?Array.from({length:4},(_,i)=>header.getFloat32(64+i*4,true)):null;
 if(scales?.some(v=>!Number.isFinite(v)||v<=0||v>65536))throw Error('Invalid horizon precision');
 if(!['C7HFv001','C7HQv001'].includes(magic)||
  [width,height,17,4,expected,1].some((v,i)=>header.getUint32(8+i*4,true)!==v))throw Error('Unsupported horizon transport');
 const values=quantized?new Int16Array(expected/2):new Uint16Array(expected/2),result=values,count=result.length,row=width*4,plane=row*height;
 let at=0,lastYield=performance.now();
 for(let c=0;c<4;c++)for(let z=0;z<17;z++){
  for(let y=0;y<height;y++){
   for(let x=0;x<width;x++){
   const i=z*plane+y*row+x*4+c,a=x?result[i-4]:0,b=y?result[i-row]:0,d=x&&y?result[i-row-4]:0;
   let prediction=x&&y?a+b-d:x?a:b;
   if(z){const a0=x?result[i-plane-4]:0,b0=y?result[i-plane-row]:0,d0=x&&y?result[i-plane-row-4]:0;prediction+=result[i-plane]-(x&&y?a0+b0-d0:x?a0:b0);}
   const value=bytes[offset+at]|(bytes[offset+count+at]<<8);at++;
   result[i]=prediction+((value>>>1)^-(value&1));
   }
   if(performance.now()-lastYield>8){
    signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));
    signal?.throwIfAborted();lastYield=performance.now();
   }
  }
 }
 signal?.throwIfAborted();
 const output=quantized?new Uint16Array(values.buffer):result;
 // Each signed fixed-point channel has only 65536 possible values.
 // Reuse exact r186 conversion results instead of converting millions of
 // samples. Tables are local to this decode and never retained by textures.
 const tables=[];
 if(quantized){
  const byScale=new Map();
  for(const scale of scales){
   let table=byScale.get(scale);
   if(!table){
    table=new Uint16Array(65536);
    for(let i=0;i<65536;i++){
     table[i]=T.DataUtils.toHalfFloat((i<<16>>16)/scale);
     if(i%32768===0&&performance.now()-lastYield>8){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));signal?.throwIfAborted();lastYield=performance.now();}
    }
    byScale.set(scale,table);
   }
   tables.push(table);
  }
 }
 if(quantized)for(let i=0;i<count;i++){
  output[i]=tables[i%4][values[i]&65535];
  if(i%32768===0&&performance.now()-lastYield>8){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));signal?.throwIfAborted();lastYield=performance.now();}
 }
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',output));
 signal?.throwIfAborted();
 if(digest.some((v,i)=>v!==bytes[32+i]))throw Error('Horizon reconstruction checksum mismatch');
 return output;
}

// Start compressed transfer before CPU scene construction. Decoding remains
// sequential in loadHorizonTextures; the first frame still waits for both fields.
// Single-consumer ownership prevents retaining an extra copy after decoding.
export function prepareHorizonTransfer({signal,compact=false,inputs}={}){
 const controller=new AbortController();let claimed=false,disposed=false;
 const abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const ready=(async()=>{
  try{
   controller.signal.throwIfAborted();
   return await Promise.all(['sky-data','left-sky-data'].map(async directory=>{
    if(inputs)return inputs.takeCompressed(compact?`./mobile-data/${directory}.gz`:`./${directory}/field.rgba16f.gz`,controller.signal);
    return fetchBinaryInput(compact?`./mobile-data/${directory}.gz`:`./${directory}/field.rgba16f.gz`,{signal:controller.signal});
   }));
  }catch(error){const reason=controller.signal.aborted?controller.signal.reason:error;controller.abort(reason);throw reason;}
  finally{signal?.removeEventListener('abort',abort);}
 })();
 // A later consumer owns the failure; early abort must not create an unhandled rejection.
 ready.catch(()=>{});
 return{
  async claim(consumerSignal){
   if(disposed||claimed)throw Error('Horizon transfer has no available consumer');claimed=true;
   const cancel=()=>controller.abort(consumerSignal.reason);
   if(consumerSignal?.aborted)cancel();else consumerSignal?.addEventListener('abort',cancel,{once:true});
   try{consumerSignal?.throwIfAborted();const bytes=await ready;consumerSignal?.throwIfAborted();return bytes;}
   catch(error){ready.then(bytes=>bytes.fill(null),()=>{});throw error;}
   finally{consumerSignal?.removeEventListener('abort',cancel);}
  },
  dispose(){if(disposed)return;disposed=true;controller.abort();if(!claimed)ready.then(bytes=>bytes.fill(null),()=>{});}
 };
}

// Fetch the small compressed bodies together, but inflate/decode only one
// field at a time. Failure cancels the sibling request and releases any field
// already created; ownership transfers to applySkyHorizon only on success.
export async function loadHorizonTextures({signal,transfer,compact=false}={}){
 const controller=new AbortController(),textures=[],input=transfer??prepareHorizonTransfer({signal,compact});
 const abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const fields=compact?[['sky-data',256,128],['left-sky-data',128,64]]:[['sky-data',512,256],['left-sky-data',256,128]];let compressed;
 try{
  controller.signal.throwIfAborted();
  compressed=await input.claim(controller.signal);
  for(let i=0;i<fields.length;i++){
   controller.signal.throwIfAborted();
   const [,width,height]=fields[i];
   const decoded=await decompressBinaryInput(compressed[i],{signal:controller.signal});
   compressed[i]=null;
   const data=await decodeHorizonField(decoded,width,height,{signal:controller.signal});
   controller.signal.throwIfAborted();
   const texture=new T.DataArrayTexture(data,width,height,17);textures.push(texture);
   texture.format=T.RGBAFormat;texture.type=T.HalfFloatType;
   texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  }
  return{texture:textures[0],localTexture:textures[1]};
 }catch(error){
  // Response.arrayBuffer can wrap an aborted decompression stream in a
  // TypeError. Preserve the caller's original cancellation reason.
  const reason=controller.signal.aborted?controller.signal.reason:error;
  controller.abort(reason);for(const texture of textures)texture.dispose();throw reason;
 }finally{compressed?.fill(null);signal?.removeEventListener('abort',abort);input.dispose();}
}

// Offline finite heightfield horizons for the low sky. The sun, trees and
// close blockers retain shadow maps. This is a scene-specific prototype.
export async function applySkyHorizon({ground,grass,farGrass,trees,depthStretch,renderer,skyLight,rearMeadow,signal,transfer,compact=false,deferReady=false}) {
 // Stable sampler identities allow shader compilation while exact fields
 // are still arriving. The caller must await ready before any scene draw.
 const sizes=compact?[[256,128],[128,64]]:[[512,256],[256,128]];
 const [texture,localTexture]=sizes.map(([w,h])=>{
  const t=new T.DataArrayTexture(null,w,h,17);t.format=T.RGBAFormat;t.type=T.HalfFloatType;
  t.minFilter=t.magFilter=T.LinearFilter;return t;
 });
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 let atlas,disposed=false;const edited=[];
 function dispose(){
  if(disposed)return;disposed=true;controller.abort();signal?.removeEventListener('abort',abort);atlas?.dispose();texture.dispose();localTexture.dispose();
  for(const{material,previous,previousKey}of edited){material.onBeforeCompile=previous;material.customProgramCacheKey=previousKey;material.needsUpdate=true;}
 }
 try{
 signal?.throwIfAborted();
 atlas=createSkyTreeAtlas({trees,renderer,lights:skyLight.lights,rearMeadow});
 const sources=skyLight.lights.map(()=>new T.Vector2());
 const receiverMatrices=skyLight.lights.map(()=>new T.Matrix3());
 const uniforms={uReceiverMatrices:{value:receiverMatrices},uReceiverTexelBias:{value:.5},uLocalHorizon:{value:localTexture},uLocalMix:{value:1},uLocalGuard:{value:new T.Vector2(.2,.6)},...atlas.uniforms,uSkyHorizonSources:{value:sources},uSkyHorizon:{value:texture},uSkyHorizonMix:{value:depthStretch===2.1?1:0},uSkyHorizonRadius:{value:T.MathUtils.degToRad(3)}};
 const declarations=/* glsl */`
 uniform highp sampler2DArray uSkyHorizon,uLocalHorizon;uniform float uLocalMix;uniform vec2 uLocalGuard;
 uniform float uSkyHorizonMix,uSkyHorizonRadius;uniform vec2 uSkyHorizonSources[3];
 float c7TreeShadow(vec3 world,int lightIndex);
 vec2 c7SkyHorizon(vec3 world,int lightIndex,float canopy){
  float z=85.+(world.z-85.)/2.1;
  vec2 localP=vec2(world.x,z),localUV=(localP-vec2(-600.,-800.))/vec2(340.,360.);
  float localEdge=smoothstep(0.,20.,localP.x+600.)*(1.-smoothstep(-280.,-260.,localP.x))*smoothstep(0.,20.,localP.y+800.)*(1.-smoothstep(-460.,-440.,localP.y));
  vec2 localSource=uSkyHorizonSources[lightIndex-1];
  float localWeight=localEdge*clamp(uSkyHorizonMix,0.,1.)*clamp(uLocalMix,0.,1.)*step(0.,localSource.x)*step(localSource.x,16.);
  if(localWeight>0.){
   vec2 localSample=clamp(localUV,vec2(.5/256.,.5/128.),vec2(1.-.5/256.,1.-.5/128.));
   float localLayer=clamp(localSource.x,0.,16.),localLow=floor(localLayer);
   vec4 localA=texture(uLocalHorizon,vec3(localSample,localLow)),localB=texture(uLocalHorizon,vec3(localSample,min(16.,localLow+1.)));
   vec2 localAngles=mix(localA.rg,localB.rg,fract(localLayer));
   // Empirical confidence from a dilated spatial/angular curvature stencil.
   // Unreliable reconstruction retains the existing per-source shadow map.
   // The stencil already includes adjacent azimuth layers. Interpolate its
   // metric continuously: taking max of a changing layer pair can jump.
   vec2 localUncertainty=mix(localA.ba,localB.ba,fract(localLayer));
   localWeight*=1.-smoothstep(uLocalGuard.x,uLocalGuard.y,mix(localUncertainty.r,localUncertainty.g,canopy));
   if(localWeight>0.){
    float localQ=clamp((localSource.y-mix(localAngles.r,localAngles.g,canopy))/uSkyHorizonRadius,-1.,1.);
    // Exact circular-segment endpoints: a fully occluded sky source needs
    // neither inverse trigonometry nor a tree-shadow lookup.
    if(localQ<=-1.)return vec2(0.,localWeight);
    if(localQ>=1.)return vec2(c7TreeShadow(world,lightIndex),localWeight);
    float localV=.5+(asin(localQ)+localQ*sqrt(max(0.,1.-localQ*localQ)))/3.141592653589793;
    return vec2(localV*c7TreeShadow(world,lightIndex),localWeight);
   }
  }

  vec2 p=vec2(world.x,z),uv=(p-vec2(-330.,-405.))/vec2(660.,280.);
  float edge=smoothstep(0.,8.,p.x+330.)*(1.-smoothstep(322.,330.,p.x))
   *smoothstep(0.,8.,p.y+405.)*(1.-smoothstep(-133.,-125.,p.y));
  vec2 source=uSkyHorizonSources[lightIndex-1];
  float blend=clamp(uSkyHorizonMix,0.,1.)*edge*step(0.,source.x)*step(source.x,16.);
  if(blend<=0.)return vec2(1.,0.);
  uv=clamp(uv,vec2(.5/512.,.5/256.),vec2(1.-.5/512.,1.-.5/256.));
  float layer=clamp(source.x,0.,16.),low=floor(layer),high=min(16.,low+1.);
  vec4 a=texture(uSkyHorizon,vec3(uv,low)),b=texture(uSkyHorizon,vec3(uv,high));
  vec2 horizons=mix(a.rg,b.rg,fract(layer));
  // Interpolate the capped guard continuously across azimuth layers.
  vec2 distances=mix(a.ba,b.ba,fract(layer));
  float angle=mix(horizons.r,horizons.g,canopy),distance=mix(distances.r,distances.g,canopy);
  blend*=smoothstep(2.,8.,distance);
  if(blend<=0.)return vec2(1.,0.);
  float q=clamp((source.y-angle)/max(.00001,uSkyHorizonRadius),-1.,1.);
  if(q<=-1.)return vec2(0.,blend);
  if(q>=1.)return vec2(c7TreeShadow(world,lightIndex),blend);
  float visibility=.5+(asin(q)+q*sqrt(max(0.,1.-q*q)))/3.141592653589793;
  return vec2(visibility*c7TreeShadow(world,lightIndex),blend);
 }
 `;
 const seen=new Set();
 function install(material,kind){
  if(seen.has(material))return;seen.add(material);
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey,key=previousKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
   if(shader.fragmentShader.includes('#include <lights_fragment_begin>'))shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',T.ShaderChunk.lights_fragment_begin);
   shader.fragmentShader=(compact?declarations.replaceAll('vec2(.5/256.,.5/128.)','vec2(.5/128.,.5/64.)').replaceAll('vec2(1.-.5/256.,1.-.5/128.)','vec2(1.-.5/128.,1.-.5/64.)').replaceAll('vec2(.5/512.,.5/256.)','vec2(.5/256.,.5/128.)').replaceAll('vec2(1.-.5/512.,1.-.5/256.)','vec2(1.-.5/256.,1.-.5/128.)'):declarations)+shader.fragmentShader;atlas.wrap(shader);
   const receiverNormal=kind==='ground'?'vTurfMacroNormal':'vC7ReceiverNormal';
   if(kind!=='ground'){
    shader.vertexShader='varying vec3 vC7ReceiverNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
     (kind==='near'&&material.userData.staticPrepared?'vC7ReceiverNormal=aTerrainNormal.xyz;\n#include <project_vertex>':'vC7ReceiverNormal=normalize(vec3(aTerrainNormal.xy,aTerrainNormal.z/uDepthStretch));\n#include <project_vertex>'));
    shader.fragmentShader='varying vec3 vC7ReceiverNormal;\n'+shader.fragmentShader;
   }
   shader.fragmentShader=/* glsl */`
    uniform mat3 uReceiverMatrices[3];
    uniform float uReceiverTexelBias;
    float interleavedGradientNoise(vec2 position);
    vec2 vogelDiskSample(int sampleIndex,int samplesCount,float phi);
    vec2 c7ReceiverSlope(vec3 worldNormal,int slot){
     vec3 normal=uReceiverMatrices[slot]*worldNormal;
     return abs(normal.z)<1e-6?vec2(0.):-normal.xy/normal.z;
    }
    float c7PlaneShadow(sampler2DShadow map,vec2 size,float intensity,float bias,float radius,vec4 coord,vec2 slope){
     vec3 p=coord.xyz/coord.w;
     if(any(lessThan(p.xy,vec2(0.)))||any(greaterThan(p.xy,vec2(1.)))||p.z>1.)return 1.;
     p.z+=bias;
     p.z-=dot(abs(slope),uReceiverTexelBias/size);
     float phi=interleavedGradientNoise(gl_FragCoord.xy)*6.283185307179586;
     float value=0.;
     for(int j=0;j<5;j++){
      vec2 offset=vogelDiskSample(j,5,phi)*radius/size.x;
      value+=texture(map,vec3(p.xy+offset,p.z+dot(slope,offset)));
     }
     return mix(1.,value*.2,intensity);
    }
   `+shader.fragmentShader;
   if(kind==='ground'){
    // Both ground lobes query the same world point and immutable tree atlas.
    // The per-fragment cache starts empty for every fragment/render pass.
    const functionPattern=/float c7TreeShadow\(/g;
    if([...shader.fragmentShader.matchAll(functionPattern)].length!==2)throw Error('Tree visibility cache needs declaration and definition');
    shader.fragmentShader=shader.fragmentShader.replace(functionPattern,'float c7TreeShadowUncached(');
    shader.fragmentShader=/* glsl */`
     float c7TreeShadowUncached(vec3 world,int lightIndex);
     vec3 c7TreeVisibilityCache=vec3(-1.0);
     float c7TreeShadow(vec3 world,int lightIndex){
      int slot=lightIndex-1;
      if(c7TreeVisibilityCache[slot]<0.0)c7TreeVisibilityCache[slot]=c7TreeShadowUncached(world,lightIndex);
      return c7TreeVisibilityCache[slot];
     }
    `+shader.fragmentShader;
   }

   const world={ground:'vTurfWorld',far:'vFarGrassRootWorld',near:'vGrassWorld'}[kind];
   const pattern=/directLight\.color \*= [^;\n]*getShadow\( directionalShadowMap[^;\n]*;/g,matches=[...shader.fragmentShader.matchAll(pattern)];
   if(matches.length!==1)throw Error('Expected one sky surface shadow hook for '+kind);
   const original=matches[0][0];
   const standardFallback=original.slice('directLight.color *= '.length,-1);
   const receiverFallback=standardFallback
    .replace('getShadow(', 'c7PlaneShadow(')
    .replace(/vDirectionalShadowCoord\[ i \]\s*\)/,`vDirectionalShadowCoord[ i ], c7ReceiverSlope(${receiverNormal}, UNROLLED_LOOP_INDEX-1) )`);
   shader.fragmentShader=shader.fragmentShader.replace(original,`
    #if UNROLLED_LOOP_INDEX > 0 && UNROLLED_LOOP_INDEX < 4
     {
       ${kind==='ground'?`// The ordinary surface PBR lobe is zero here. The separate raised
       // turf-canopy loop below still evaluates its own transmission and shadows.
       if(!c7GroundSurfaceNeedsShadow(geometryNormal,directLight.direction)){
         directLight.color=vec3(0.0);
       }else{`:''}
       vec2 c7H=c7SkyHorizon(${world},UNROLLED_LOOP_INDEX,${kind==='ground'?'0.':'1.'});
       float c7Old=1.;
       if(c7H.y<1.){
        c7Old=${standardFallback};
        float c7ReceiverMix=smoothstep(0.,.2,c7H.y);
        if(c7ReceiverMix>0.)c7Old=mix(c7Old,${receiverFallback},c7ReceiverMix);
       }
       directLight.color*=mix(c7Old,c7H.x,c7H.y);
       ${kind==='ground'?'}':''}
     }
    #else
     ${original}
    #endif`);
   if(kind==='ground'){
    const pattern=/visibility = receiveShadow \? getShadow\(directionalShadowMap\[i\],[\s\S]*?vTurfCanopyShadowCoord\[i\]\) : 1\.0;/;
    const match=shader.fragmentShader.match(pattern);if(!match)throw Error('Sky canopy shadow hook missing');
    const canopyReceiver=match[0].slice('visibility = '.length,-1)
     .replace('getShadow(', 'c7PlaneShadow(')
     .replace('vTurfCanopyShadowCoord[i])', 'vTurfCanopyShadowCoord[i], c7ReceiverSlope(vTurfMacroNormal,UNROLLED_LOOP_INDEX-1))');
    shader.fragmentShader=shader.fragmentShader.replace(pattern,`
     #if UNROLLED_LOOP_INDEX > 0 && UNROLLED_LOOP_INDEX < 4
      vec2 c7HC=c7SkyHorizon(vTurfWorld,UNROLLED_LOOP_INDEX,1.);
      if(c7HC.y<1.){
       ${match[0]}
       float c7ReceiverMix=smoothstep(0.,.2,c7HC.y);
       if(c7ReceiverMix>0.){
        float c7PlaneVisibility=${canopyReceiver};
        visibility=mix(visibility,c7PlaneVisibility,c7ReceiverMix);
       }
       visibility=mix(visibility,c7HC.x,c7HC.y);
      }else visibility=c7HC.x;
     #else
      ${match[0]}
     #endif`);
   }
  };
  material.customProgramCacheKey=()=>key+'|receiver-scoped-v530-'+kind;material.needsUpdate=true;edited.push({material,previous,previousKey});
 }
 install(ground.material,'ground');
 for(const[group,kind]of[[grass,'near'],[farGrass,'far']])group?.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))install(m,kind)});
 function update(){
  for(let i=0;i<3;i++){const light=skyLight.lights[i],direction=new T.Vector3().subVectors(light.position,light.target.position).normalize();sources[i].set((T.MathUtils.radToDeg(Math.atan2(direction.x,-direction.z))+22.5)/2.5,Math.asin(T.MathUtils.clamp(direction.y,-1,1)));}
  atlas.update();
  for(let i=0;i<3;i++)receiverMatrices[i].getNormalMatrix(skyLight.lights[i].shadow.matrix);
 }
 const readyPromise=loadHorizonTextures({signal:controller.signal,transfer,compact}).then(loaded=>{
  const incoming=[loaded.texture,loaded.localTexture];
  if(disposed){for(const t of incoming)t.dispose();throw new DOMException('Horizon owner disposed','AbortError');}
  for(const [i,t]of[texture,localTexture].entries()){t.image=incoming[i].image;t.needsUpdate=true;incoming[i].dispose();}
 }).finally(()=>signal?.removeEventListener('abort',abort));
 readyPromise.catch(()=>{});
 if(!deferReady)await readyPromise;
 return{uniforms,update,atlas:atlas.target,dispose,readyPromise};
 }catch(error){dispose();throw error;}
}
