import {createCanvas,loadTexture} from './canvas-platform.js';
import * as T from 'three';

// Vegetation light transport references (original implementation below):
// https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
// https://github.com/simondevyoutube/Quick_Grass/blob/6b56164272f213e353a4045d1439d071d5a968cd/public/shaders/grass-lighting-model-fsh.glsl
// Thin leaves need a bounded forward/transmission lobe in addition to surface
// PBR. The distant turf uses the same world-sun/backscatter principle as blades.
const noise = /* glsl */`
float turfHash(vec2 p) { p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y); }
float turfNoise(vec2 p) { vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(turfHash(i),turfHash(i+vec2(1,0)),f.x),mix(turfHash(i+vec2(0,1)),turfHash(i+1.),f.x),f.y); }
float turfField(vec2 p) { return turfNoise(p)*.57+turfNoise(p*2.07+18.)*.28+turfNoise(p*4.13-6.)*.15; }
`;

function turfTextures() {
  const size=1024,height=createCanvas(),color=createCanvas();
  height.width=height.height=color.width=color.height=size;
  const h=height.getContext('2d'),c=color.getContext('2d');
  h.fillStyle='#353535';h.fillRect(0,0,size,size);
  c.fillStyle='#bcbcbc';c.fillRect(0,0,size,size);
  let state=731;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
  for(let i=0;i<24000;i++) {
    const x=random()*size,y=random()*size,len=10+random()*31,angle=random()*Math.PI*2;
    const dx=Math.cos(angle)*len,dy=Math.sin(angle)*len,curve=(random()-.5)*12,width=1+random()*1.7,value=150+random()*100;
    for(const ox of[-size,0,size])for(const oy of[-size,0,size]) {
      if(x+ox< -40||x+ox>size+40||y+oy< -40||y+oy>size+40)continue;
      for(const[ctx,shade]of[[h,value],[c,165+random()*75]]) {
        ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;ctx.lineWidth=width;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x+ox,y+oy);
        ctx.quadraticCurveTo(x+dx*.45+curve+ox,y+dy*.45-curve+oy,x+dx+ox,y+dy+oy);ctx.stroke();
      }
    }
  }
  const map=new T.CanvasTexture(color),bump=new T.CanvasTexture(height);
  // Native bumpmap samples red only. Colour remains sRGB RGBA as before.
  bump.format=T.RedFormat;
  map.colorSpace=T.SRGBColorSpace;
  for(const t of[map,bump]) { t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8; }
  return {map,bump};
}

function meanLinearLuminance(image) {
  const canvas=createCanvas();
  canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const linear = value => { const s=value/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4; };
  let sum=0,count=0;
  // Spatially uniform sampling measures the texture's mean without baking
  // either its dead-grass chroma or an arbitrary brightness multiplier.
  for(let i=0;i<pixels.length;i+=16) {
    sum+=linear(pixels[i])*.2126+linear(pixels[i+1])*.7152+linear(pixels[i+2])*.0722;count++;
  }
  return Math.max(.001,sum/count);
}
const uniform = (value, fallback) => value?.value !== undefined ? value : {value:value ?? fallback};

const vertexDeclarations = /* glsl */`
  attribute float aShore;
  varying vec3 vTurfWorld;
  varying vec3 vTurfMacroNormal;
  varying float vTurfShore;
  uniform float uTurfCanopyHeight;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    varying vec4 vTurfCanopyShadowCoord[NUM_DIR_LIGHT_SHADOWS];
  #endif
`;
const canopyShadowVertex = /* glsl */`
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
      {
      // A distant mesh represents the base of a short volume of grass. Its
      // upper fibres can see the low sun even when the opaque ground cannot.
      // This is a world-space height offset, never a painted ridge mask.
      vec4 turfCanopyPosition = worldPosition + vec4(0.0, uTurfCanopyHeight, 0.0, 0.0);
      turfCanopyPosition.xyz += shadowWorldNormal * directionalLightShadows[i].shadowNormalBias;
      vTurfCanopyShadowCoord[i] = directionalShadowMatrix[i] * turfCanopyPosition;
      }
    }
    #pragma unroll_loop_end
  #endif
`;
const fragmentDeclarations = /* glsl */`
  varying vec3 vTurfWorld;
  varying vec3 vTurfMacroNormal;
  varying float vTurfShore;
  uniform vec3 uTurfSunDirection;
  uniform vec3 uTurfSunColor;
  uniform vec3 uTurfTipColor;
  uniform float uTurfSunIntensity;
  uniform float uTurfExplicitSun;
  uniform float uTurfMapMean;
  uniform float uTurfMapContrast;
  uniform float uTurfCanopyStrength;
  uniform vec3 uCanopyTransmissionColor;
  uniform float uCanopyTransmissionMix;
  uniform float uTurfWrap;
  uniform float uTurfWrapStrength;
  uniform float uTurfScatterStrength;
  uniform float uTurfTipWeight;
  uniform float uTurfDebugMode;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    varying vec4 vTurfCanopyShadowCoord[NUM_DIR_LIGHT_SHADOWS];
  #endif
  ${noise}
`;
const canopyFunctions = /* glsl */`
  vec3 turfThinCanopy(vec3 L, vec3 incident, vec3 N, vec3 V, vec3 diffuse, float fibreLuminance) {
    float NoL = clamp(dot(N, L), -1.0, 1.0);
    float wrapped = clamp((NoL + uTurfWrap) / max(.001, 1.0 + uTurfWrap), 0.0, 1.0);
    float wrapExtra = max(0.0, wrapped - max(0.0, NoL));
    float forward = pow(max(0.0, dot(V, -L)), 3.0);
    float grazingLight = pow(max(0.0, 1.0 - abs(NoL)), 1.5);
    float grazingView = pow(max(0.0, 1.0 - abs(dot(N, V))), 2.0);
    float transmission = forward * grazingLight * mix(.35, 1.0, grazingView);
    float thinFibre = mix(.72, 1.0, smoothstep(.65, 1.3, fibreLuminance));
    vec3 transmissionColor = mix(diffuse, uTurfTipColor * fibreLuminance, uTurfTipWeight);
    // Thin-leaf transmission is independent of the reflected root/tip pigment.
    // Still multiplied by this source\'s visibility, direction and incident energy.
    transmissionColor = mix(transmissionColor, uCanopyTransmissionColor, clamp(uCanopyTransmissionMix, 0.0, 1.0));
    return incident * (uTurfWrapStrength * wrapExtra * diffuse
      + uTurfScatterStrength * transmission * thinFibre * transmissionColor)
      * (1.0 / 3.14159265359);
  }
`;
const scalarMap = /* glsl */`
  float turfLuminance = 1.0;
  #ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D(map, vMapUv);
    #ifdef DECODE_VIDEO_TEXTURE
      sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
    #endif
    float measuredLuminance = dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722));
    turfLuminance = clamp(mix(1.0, measuredLuminance / uTurfMapMean, uTurfMapContrast), .55, 1.6);
    // Keep Grass004's fibre structure but discard its dry yellow/brown chroma.
    // Both procedural and scanned detail now share the living-meadow palette.
    diffuseColor *= vec4(vec3(turfLuminance), sampledDiffuseColor.a);
  #endif
`;
// Skip a surface shadow fetch only when its entire ordinary PBR lobe is
// exactly zero. The raised canopy loop keeps its independent six lookups.
// Future clearcoat uses another normal: conservatively retain all its fetches.
const surfaceShadowGate = /* glsl */`
  bool c7GroundSurfaceNeedsShadow(vec3 N, vec3 L) {
    #ifdef USE_CLEARCOAT
      return true;
    #else
      return dot(N, L) > 0.0;
    #endif
  }
`;
const surfaceShadowSource = 'directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap';
if(T.ShaderChunk.lights_fragment_begin.split(surfaceShadowSource).length!==2)
  throw new Error('Three directional shadow chunk changed; ground gate requires review.');
const surfaceLightFragment=T.ShaderChunk.lights_fragment_begin.replace(surfaceShadowSource,
  'directLight.visible && receiveShadow && c7GroundSurfaceNeedsShadow(geometryNormal, directLight.direction) ) ? getShadow( directionalShadowMap');

const canopyLight = /* glsl */`
  vec3 turfV = normalize(cameraPosition - vTurfWorld);
  vec3 turfN = normalize(vTurfMacroNormal);
  float turfCover = smoothstep(0.0, .7, vTurfShore);
  vec3 turfCanopyRadiance = vec3(0.0);
  float turfVisibleEnergy = 0.0;
  float turfTotalEnergy = 0.0;
  #if NUM_DIR_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      {
        // Match Three's shadow-first directional-light ordering. Each sky
        // sample keeps its own visibility: the occluded low sun must never
        // multiply away another source's visible contribution.
        float visibility = 1.0;
        #if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS)
          DirectionalLightShadow canopyShadow = directionalLightShadows[i];
          visibility = receiveShadow ? getShadow(directionalShadowMap[i], canopyShadow.shadowMapSize,
            canopyShadow.shadowIntensity, canopyShadow.shadowBias, canopyShadow.shadowRadius,
            vTurfCanopyShadowCoord[i]) : 1.0;
        #endif
        vec3 L = inverseTransformDirection(directionalLights[i].direction, viewMatrix);
        vec3 incident = directionalLights[i].color;
        float energy = dot(incident, vec3(.2126,.7152,.0722));
        turfTotalEnergy += energy;
        turfVisibleEnergy += energy * visibility;
        turfCanopyRadiance += turfThinCanopy(L, incident, turfN, turfV, material.diffuseColor, turfLuminance) * visibility;
      }
    }
    #pragma unroll_loop_end
  #else
    // Optional explicit light supports isolated material previews. In a lit
    // scene, the actual directional lights and their own shadows are authoritative.
    turfCanopyRadiance = turfThinCanopy(normalize(uTurfSunDirection), uTurfSunColor * uTurfSunIntensity,
      turfN, turfV, material.diffuseColor, turfLuminance) * uTurfExplicitSun;
    turfTotalEnergy = 1.0;
    turfVisibleEnergy = uTurfExplicitSun;
  #endif
  float turfVisibility = turfVisibleEnergy / max(.00001, turfTotalEnergy);
  turfCanopyRadiance *= turfCover * uTurfCanopyStrength;
  // A small fraction of the surface lobe is reassigned to thin-leaf transport.
  // No ambient or emissive term is raised: occluded valleys remain shadowed.
  reflectedLight.directDiffuse *= 1.0 - .12 * clamp(uTurfCanopyStrength, 0.0, 1.0);
  reflectedLight.directDiffuse += turfCanopyRadiance;
`;

/**
 * createTurfMaterial(useAsset?, {sunDirection?, sunColor?, sunIntensity?,
 *   rootColor?, tipColor?, ...}) — vectors/colors or {value} uniforms accepted.
 * Existing boolean-only callers remain valid: the actual directional sun is
 * inferred from Three's lighting uniforms. Explicit vectors are a fallback
 * for light-free previews; real scenes use every directional light separately.
 * Controls: material.userData.turfUniforms; diagnostic modes 1=weighted canopy visibility,
 * 2=canopy radiance. Set uTurfCanopyStrength.value=0 for an exact lighting A/B.
 */
export async function createTurfMaterial(useAsset=false, options={}) {
  if(typeof useAsset==='object') { options=useAsset;useAsset=!!options.useAsset; }
  let map,bump=null,normal=null,roughness=null,ao=null;
  if(useAsset) {
    const loader=({loadAsync:loadTexture});
    const url=name=>new URL(`./assets/turf/${name}.webp`,import.meta.url).href;
    [map,normal,roughness,ao]=await Promise.all(['Color','NormalGL','Roughness','AmbientOcclusion'].map(name=>loader.loadAsync(url(name))));
    map.colorSpace=T.SRGBColorSpace;
    for(const texture of[map,normal,roughness,ao]) {
      texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.setScalar(4/1.4);texture.anisotropy=8;
    }
  } else {
    ({map,bump}=turfTextures());
    // The procedural strokes represent grass clumps: a16m tile with a
    // bounded6cm bump envelope. Mipmaps/anisotropic sampling filter the
    // fibres in the distance; the actual terrain and silhouette stay fixed.
    map.repeat.setScalar(.25);bump.repeat.setScalar(.25);
  }
  const root=options.rootColor?.value ?? options.rootColor ?? new T.Color('#436d41');
  const material=new T.MeshPhysicalMaterial({
    name:'C7 thin living turf',color:root,map,bumpMap:bump,bumpScale:useAsset?.012:.06,
    normalMap:normal,normalScale:new T.Vector2(.45,.45),roughnessMap:roughness,
    aoMap:ao,aoMapIntensity:.35,roughness:.98,metalness:0,
    sheen:.05,sheenColor:new T.Color('#6e8f53'),sheenRoughness:.95,
    specularIntensity:.35,dithering:true,
  });
  const mapMean=meanLinearLuminance(map.image);
  const uniforms={
    uTurfSunDirection:uniform(options.sunDirection,new T.Vector3(-.49,.004,-.87).normalize()),
    uTurfSunColor:uniform(options.sunColor,new T.Color('#ffd5a0')),
    uTurfSunIntensity:uniform(options.sunIntensity,6),
    uTurfExplicitSun:{value:options.sunDirection?1:0},
    uTurfTipColor:uniform(options.tipColor,new T.Color('#6e8f53')),
    uTurfMapMean:{value:mapMean},
    uTurfMapContrast:uniform(options.mapContrast,.2),
    uTurfCanopyHeight:uniform(options.canopyHeight,.32),
    uTurfCanopyStrength:uniform(options.canopyStrength,1),
    uCanopyTransmissionColor: { value: new T.Color().setRGB(.4735315,.5711248,.3231432) },
    uCanopyTransmissionMix: { value: 0 },
    uTurfWrap:uniform(options.wrap,.38),
    uTurfWrapStrength:uniform(options.wrapStrength,.6),
    uTurfScatterStrength:uniform(options.scatterStrength,.3),
    uTurfTipWeight:uniform(options.tipWeight,.55),
    uTurfDebugMode:{value:0},
  };
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=vertexDeclarations+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTurfShore=aShore;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vTurfWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      vTurfMacroNormal=transformNormalByInverseViewMatrix(transformedNormal,viewMatrix);`);
    shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>', '#include <shadowmap_vertex>\n'+canopyShadowVertex);
    shader.fragmentShader=fragmentDeclarations+shader.fragmentShader;
    // Fade the micro-relief out as its screen footprint grows. The terrain's
    // 16m clump tile becomes subpixel on distant hills, where unfiltered bump
    // reads as dark flecks rather than texture. Colour and geometry stay fixed.
    const filteredBump=T.ShaderChunk.bumpmap_pars_fragment
      .replaceAll('bumpScale * texture2D','c7BumpScale * texture2D')
      .replace('vec2 dSTdx = dFdx( vBumpMapUv );','float c7BumpScale = bumpScale * clamp(0.06 / max(max(fwidth(vTurfWorld.x), fwidth(vTurfWorld.z)), 1e-5), 0.0, 1.0);\n  vec2 dSTdx = dFdx( vBumpMapUv );');
    shader.fragmentShader=shader.fragmentShader.replace('#include <bumpmap_pars_fragment>',filteredBump);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',scalarMap);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float turfPatch=turfField(vTurfWorld.xz*.065);
      diffuseColor.rgb*=mix(.98,1.02,turfPatch);
      diffuseColor.rgb*=mix(.86,1.0,smoothstep(0.0,.55,vTurfShore));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',
      '#include <shadowmap_pars_fragment>\n'+canopyFunctions+surfaceShadowGate);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',surfaceLightFragment);
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\n'+canopyLight);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`if(uTurfDebugMode>.5&&uTurfDebugMode<1.5)outgoingLight=vec3(turfVisibility);
      if(uTurfDebugMode>1.5)outgoingLight=turfCanopyRadiance;
      #include <opaque_fragment>`);
    material.userData.shader=shader;
  };
  material.customProgramCacheKey=()=>`c7-thin-canopy-turf-v5-clump-relief-${useAsset?'asset':'procedural'}`;
  material.userData.turfUniforms=uniforms;
  material.userData.turfStats={useAsset,meanLinearMapLuminance:mapMean,rootColor:material.color.getHexString(),primaryModel:'PBR + shadowed wrapped diffuse and forward thin-canopy transport'};
  return material;
}
