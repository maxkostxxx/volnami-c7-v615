// Continuous, world-space grass clumps supply the subpixel foliage that the
// individual far blades cannot cover. Derivative filtering fades detail before
// it aliases; neither color nor height is tied to the reference camera/image.
export function applyMicrocanopy(material,{strength=1,depthStretch=2.1,depthPivot=85}={}) {
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  const amount={value:strength};
  material.onBeforeCompile=function(shader,renderer) {
    previous.call(this,shader,renderer);
    shader.uniforms.uMicroCanopy=amount;
    shader.fragmentShader='uniform float uMicroCanopy;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // Fine turf on the close meadow revealed behind the initial camera.
      // This is a fixed world zone; the original lake hills keep their scale.
      float meadowZ=${depthPivot.toFixed(8)}+(vTurfWorld.z-${depthPivot.toFixed(8)})/${depthStretch.toFixed(8)};
      float closeMeadow=smoothstep(45.,95.,meadowZ);
      vec2 microP=vTurfWorld.xz*mix(1.8,8.4,closeMeadow);
      float microFootprint=max(length(dFdx(microP)),length(dFdy(microP)));
      // Distant clumps remain resolvable without turning into coarse spots.
      float microWeight=1.-smoothstep(.35,1.,microFootprint);
      float microFineWeight=1.-smoothstep(.15,.5,microFootprint*2.07);
      float microCoarse=turfNoise(microP)-.5;
      float microFine=turfNoise(mat2(.8,-.6,.6,.8)*microP*2.07+31.7)-.5;
      float microField=microCoarse*microWeight+microFine*microFineWeight*.35;
      diffuseColor.rgb*=1.+uMicroCanopy*1.5*microField;
      float microHeight=uMicroCanopy*.018*microField;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      #ifdef USE_BUMPMAP
      normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(microHeight),dFdy(microHeight)),faceDirection);
      #endif
    `);
  };
  material.customProgramCacheKey=()=>key+'-microcanopy-meadow-v130-'+depthStretch+'-'+depthPivot;
  material.needsUpdate=true;
  return {strength:amount};
}
