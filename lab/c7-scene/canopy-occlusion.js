import { meadowLeafAreaGLSL } from './meadow-profile.js';
// The resolved near meadow is a volume above the ground. Its unresolved
// blades block some skylight at the roots; they do not erase direct lighting.
// Optical depth is an art-direction parameter, not a measured leaf-area index.
export function applyNearCanopyOcclusion({ground, grass, depthStretch=2.1, depthPivot=85, opticalDepth=1}) {
  const tau={value:opticalDepth};
  const groundMaterial=ground.material, previousGround=groundMaterial.onBeforeCompile;
  const groundKey=groundMaterial.customProgramCacheKey();
  groundMaterial.onBeforeCompile=function(shader,renderer) {
    previousGround.call(this,shader,renderer);
    shader.uniforms.uNearCanopyTau=tau;
    shader.fragmentShader='uniform float uNearCanopyTau;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      vec3 meadowPoint=vTurfWorld;
      meadowPoint.z=${depthPivot.toFixed(8)}+(meadowPoint.z-${depthPivot.toFixed(8)})/${depthStretch.toFixed(8)};
      vec3 meadowEye=cameraPosition;
      meadowEye.z=${depthPivot.toFixed(8)}+(meadowEye.z-${depthPivot.toFixed(8)})/${depthStretch.toFixed(8)};
      float meadowRadius=length(vec2(meadowPoint.x/190.0,(meadowPoint.z-25.0)/145.0))+.035*sin(meadowPoint.x*.037)+.025*sin(meadowPoint.z*.061);
      float meadowCover=1.0-smoothstep(.72,1.06,meadowRadius);
      float meadowDetail=.35+.65*exp(-pow(meadowPoint.x/145.0,2.0)-pow((meadowPoint.z-15.0)/110.0,2.0));
      float meadowLOD=1.0-smoothstep(145.0,205.0,distance(meadowEye,meadowPoint));
      float meadowLeafArea=${meadowLeafAreaGLSL("meadowPoint.z")};
      float meadowT=exp(-uNearCanopyTau*meadowLeafArea*meadowCover*meadowDetail*meadowLOD);
      reflectedLight.indirectDiffuse*=meadowT;
      reflectedLight.indirectSpecular*=meadowT;
    `);
  };
  groundMaterial.customProgramCacheKey=()=>groundKey+`-near-canopy-occlusion-v2-${depthStretch}-${depthPivot}`;
  groundMaterial.needsUpdate=true;
  if(grass) {
    const blade=grass.children[0].material,previousBlade=blade.onBeforeCompile;
    const bladeKey=blade.customProgramCacheKey();
    blade.onBeforeCompile=function(shader,renderer) {
      previousBlade.call(this,shader,renderer);
      shader.uniforms.uNearCanopyTau=tau;
      shader.fragmentShader='uniform float uNearCanopyTau;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace(
        'mix(0.82, 1.0, smoothstep(0.0, 0.8, vGrassHeight))',
        `mix(0.82, 1.0, smoothstep(0.0, 0.8, vGrassHeight))*exp(-uNearCanopyTau*${meadowLeafAreaGLSL(`(${depthPivot.toFixed(8)}+(vGrassWorld.z-${depthPivot.toFixed(8)})/${depthStretch.toFixed(8)})`)}*pow(1.0-clamp(vGrassHeight,0.0,1.0),1.3))`);
    };
    blade.customProgramCacheKey=()=>bladeKey+`-near-canopy-occlusion-v2-${depthStretch}-${depthPivot}`;
    blade.needsUpdate=true;
  }
  return {opticalDepth:tau};
}
