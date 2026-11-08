import * as T from 'three';

// Fine grass has many more shaded vertices than resolved pixels. Interpolate
// one world position and its original normal bias instead of seven vec4
// shadow coordinates. Linear shadow transforms commute with interpolation;
// the shadow maps, receiver bias and all lighting equations are unchanged.
export function compactGrassShadows(groups) {
 // The rewrite is reviewed against r186 only. An upgrade keeps stock shadows
 // until its shader layout is checked, rather than silently dropping varyings.
 if(T.REVISION!=='186')return;
 const requireAnchor=(source,anchor)=>{
  if(source.split(anchor).length!==2)throw Error('Compact grass shadow anchor changed: '+anchor);
 };
 const seen=new Set();
 for(const group of groups)group?.traverse(object=>{
  for(const material of [object.material??[]].flat()){
   if(seen.has(material))continue;seen.add(material);
   const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    for(const anchor of ['#include <shadowmap_pars_vertex>','#include <shadowmap_vertex>'])requireAnchor(shader.vertexShader,anchor);
    requireAnchor(shader.fragmentShader,'#include <shadowmap_pars_fragment>');
    for(const anchor of ['varying vec4 vDirectionalShadowCoord','varying vec4 vSpotLightCoord'])requireAnchor(T.ShaderChunk.shadowmap_pars_fragment,anchor);
    if([...shader.fragmentShader.matchAll(/void\s+main\s*\(\s*\)\s*\{/g)].length!==1)throw Error('Compact grass shadow main hook changed');
    shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_pars_vertex>',
      'varying vec4 vC7ShadowPosition; varying vec3 vC7ShadowNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>',`
      vC7ShadowPosition=worldPosition;
      #ifdef HAS_NORMAL
       vC7ShadowNormal=transformNormalByInverseViewMatrix(transformedNormal,viewMatrix);
      #else
       vC7ShadowNormal=vec3(0.0);
      #endif
    `);
    let pars=T.ShaderChunk.shadowmap_pars_fragment
      .replace('varying vec4 vDirectionalShadowCoord','vec4 vDirectionalShadowCoord')
      .replace('varying vec4 vSpotLightCoord','vec4 vSpotLightCoord');
    pars+=`
      varying vec4 vC7ShadowPosition;varying vec3 vC7ShadowNormal;
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
       uniform mat4 directionalShadowMatrix[NUM_DIR_LIGHT_SHADOWS];
      #endif
      #if NUM_SPOT_LIGHT_COORDS > 0
       uniform mat4 spotLightMatrix[NUM_SPOT_LIGHT_COORDS];
      #endif
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',pars);
    shader.fragmentShader=shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,`void main(){
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
       #pragma unroll_loop_start
       for(int i=0;i<NUM_DIR_LIGHT_SHADOWS;i++){
        vDirectionalShadowCoord[i]=directionalShadowMatrix[i]*(vC7ShadowPosition+vec4(vC7ShadowNormal*directionalLightShadows[i].shadowNormalBias,0.0));
       }
       #pragma unroll_loop_end
      #endif
      #if NUM_SPOT_LIGHT_COORDS > 0
       #pragma unroll_loop_start
       for(int i=0;i<NUM_SPOT_LIGHT_COORDS;i++){
       {
        vec4 p=vC7ShadowPosition;
        #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS
         p.xyz+=vC7ShadowNormal*spotLightShadows[i].shadowNormalBias;
        #endif
        vSpotLightCoord[i]=spotLightMatrix[i]*p;
       }
       }
       #pragma unroll_loop_end
      #endif
    `);
   };
   material.customProgramCacheKey=()=>key+'|compact-grass-shadows-1';
  }
 });
}
