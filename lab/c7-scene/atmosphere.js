import { finishBuild, finishBuildAsync } from './cooperative-build.js';
import * as THREE from 'three';

const GRID_SIZE = 128;
const GRID_BOUNDS = { minX: -700, maxX: 700, minZ: -820, maxZ: 390 };
const HORIZON_DISTANCES = [6, 16, 40, 90, 180];

export const DEFAULT_ATMOSPHERE_PARAMETERS = Object.freeze({
  enabled: 1,
  aoStrength: 1,
  clearExtinction: 0.00001,
  mistExtinction: 0.035,
  mistNearZ: -230,
  mistFarZ: -370,
  mistCenterX: -90,
  mistWidthX: 80,
  mistRightWidthX: 0,
  mistOutsideWeight: 0.18,
  westMistExtinction: 0,
  westMistCenterX: -315,
  westMistWidthX: 90,
  westMistCenterZ: -480,
  westMistWidthZ: 200,
  westMistHeightScale: 16,
  heightScale: 160,
  hazeMaxLuminance: 0.6,
  hazeSaturation: 0.2,
  forwardStrength: 0.2,
  phaseAnisotropy: 0.58,
  depthStretch: 1,
  depthPivotZ: 85,
  debugMode: 0,
});
const PARAMETER_UNIFORMS = Object.fromEntries(Object.keys(DEFAULT_ATMOSPHERE_PARAMETERS)
  .map(key => [key, `uC7${key[0].toUpperCase()}${key.slice(1)}`]));


function* buildSkyVisibility(heightAt) {
  const started = performance.now();
  const count = GRID_SIZE * GRID_SIZE;
  const heights = new Float32Array(count);
  const visibility = new Float32Array(count);
  const { minX, maxX, minZ, maxZ } = GRID_BOUNDS;
  const dx = (maxX - minX) / (GRID_SIZE - 1);
  const dz = (maxZ - minZ) / (GRID_SIZE - 1);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  let minimumVisibility = 1;
  let maximumVisibility = 0;
  let visibilitySum = 0;
  for (let z = 0; z < GRID_SIZE; z++) {
    yield;
    for (let x = 0; x < GRID_SIZE; x++) {
      const index = z * GRID_SIZE + x;
      const wx = minX + x * dx;
      const wz = minZ + z * dz;
      const height = heightAt(wx, wz);
      if (!Number.isFinite(height)) throw new Error('Non-finite height while building atmosphere');
      heights[index] = height;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
      let visibleIrradiance = 0;
      for (let azimuth = 0; azimuth < 8; azimuth++) {
        const angle = (azimuth + 0.5) * Math.PI / 4;
        const directionX = Math.cos(angle);
        const directionZ = Math.sin(angle);
        let horizonSlope = 0;
        for (const distance of HORIZON_DISTANCES) {
          const neighbor = heightAt(wx + directionX * distance, wz + directionZ * distance);
          // A short canopy and discretization offset keep the field from
          // treating its own immediate surface as a distant sky blocker.
          horizonSlope = Math.max(horizonSlope, (neighbor - height - 0.4) / distance);
        }
        // Integral of cosine-weighted sky irradiance above the horizon:
        // cos(atan(horizonSlope))². This is visibility, not baked sun lighting.
        visibleIrradiance += 1 / (1 + horizonSlope * horizonSlope);
      }
      const sky = THREE.MathUtils.clamp(visibleIrradiance / 8, 0.18, 1);
      visibility[index] = sky;
      minimumVisibility = Math.min(minimumVisibility, sky);
      maximumVisibility = Math.max(maximumVisibility, sky);
      visibilitySum += sky;
    }
  }
  const heightRange = Math.max(1, maximumHeight - minimumHeight);
  const pixels = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const packedHeight = Math.round(THREE.MathUtils.clamp((heights[i] - minimumHeight) / heightRange, 0, 1) * 65535);
    pixels[i * 4] = Math.round(visibility[i] * 255);
    pixels[i * 4 + 1] = packedHeight >> 8;
    pixels[i * 4 + 2] = packedHeight & 255;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, GRID_SIZE, GRID_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'C7 terrain sky visibility and height';
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    texture,
    minimumHeight,
    heightRange,
    stats: {
      gridSize: GRID_SIZE,
      bounds: { ...GRID_BOUNDS },
      horizonSamples: count * 8 * HORIZON_DISTANCES.length,
      buildMilliseconds: performance.now() - started,
      skyVisibility: { min: minimumVisibility, max: maximumVisibility, mean: visibilitySum / count },
      heightRange: [minimumHeight, maximumHeight],
    },
  };
}

const vertexDeclarations = /* glsl */`
  varying vec3 vC7AerialWorld;
`;
const vertexWorld = /* glsl */`
  vec4 c7AerialPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    c7AerialPosition = batchingMatrix * c7AerialPosition;
  #endif
  #ifdef USE_INSTANCING
    c7AerialPosition = instanceMatrix * c7AerialPosition;
  #endif
  vC7AerialWorld = (modelMatrix * c7AerialPosition).xyz;
`;
const fragmentDeclarations = /* glsl */`
  varying vec3 vC7AerialWorld;
  uniform sampler2D uC7SkyVisibility;
  uniform vec4 uC7VisibilityBounds;
  uniform vec2 uC7TerrainHeightRange;
  uniform vec3 uC7AerialSun;
  uniform vec3 uC7SkyRadiance;
  ${Object.values(PARAMETER_UNIFORMS).map(name => `uniform float ${name};`).join('\n')}

  vec3 c7AuthoredPosition(vec3 actualWorld) {
    actualWorld.z = uC7DepthPivotZ + (actualWorld.z - uC7DepthPivotZ) / max(uC7DepthStretch, 0.001);
    return actualWorld;
  }
  float c7SkyVisibility(vec3 actualWorldPosition) {
    vec3 worldPosition = c7AuthoredPosition(actualWorldPosition);
    vec2 uv = (worldPosition.xz - uC7VisibilityBounds.xy) / uC7VisibilityBounds.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
    vec2 texelUV = (uv * 127.0 + 0.5) / 128.0;
    vec4 sampleValue = texture2D(uC7SkyVisibility, texelUV);
    float packedHeight = dot(sampleValue.gb, vec2(65280.0, 255.0)) / 65535.0;
    float terrainHeight = uC7TerrainHeightRange.x + packedHeight * uC7TerrainHeightRange.y;
    float aboveGround = max(0.0, worldPosition.y - terrainHeight);
    return mix(sampleValue.r, 1.0, 1.0 - exp(-aboveGround / 22.0));
  }

  vec3 c7ApplyAerial(vec3 outgoingRadiance, vec3 actualWorldPosition) {
    if (uC7Enabled < 0.5) return outgoingRadiance;
    vec3 worldPosition = c7AuthoredPosition(actualWorldPosition);
    vec3 eyePosition = c7AuthoredPosition(cameraPosition);
    vec3 ray = worldPosition - eyePosition;
    float rayLength = length(ray);
    if (rayLength < 0.01) return outgoingRadiance;
    // Extinction is measured in authored-world metres: stretching the world
    // for a longer focal length must not silently triple the aerosol amount.
    float eyeHeight = abs(eyePosition.y);
    float opticalDepth = 0.0;
    float westOpticalDepth = 0.0;
    // If the whole authored ray precedes the mist volume, all twelve mist
    // terms are exactly zero. For nonnegative heights, the remaining twelve
    // midpoint samples form a geometric series. Factor the polynomial instead
    // of dividing by 1-r, which would be unstable on nearly level rays.
    float clearDelta = worldPosition.y - eyeHeight;
    if (min(eyePosition.z, worldPosition.z) >= uC7MistNearZ
        && worldPosition.y >= 0.0 && abs(clearDelta) <= 12.0 * uC7HeightScale) {
      float r = exp(-clearDelta / (12.0 * uC7HeightScale));
      float r2 = r * r, r4 = r2 * r2, r6 = r4 * r2;
      float firstSample = exp(-(eyeHeight + clearDelta / 24.0) / uC7HeightScale);
      opticalDepth = uC7ClearExtinction * firstSample
        * (1.0 + r) * (1.0 + r2 + r4) * (1.0 + r6) * rayLength / 12.0;
    } else {
    for (int sampleIndex = 0; sampleIndex < 12; sampleIndex++) {
      float t = (float(sampleIndex) + 0.5) / 12.0;
      vec3 samplePoint = mix(eyePosition, worldPosition, t);
      float physicalHeight = max(0.0, mix(eyeHeight, worldPosition.y, t));
      float distantMist = 1.0 - smoothstep(uC7MistFarZ, uC7MistNearZ, samplePoint.z);
      // A localized rear-valley aerosol volume, denser on its western side.
      // The variation belongs to the world, not to the sun or screen pixels.
      // Two halves of one world-space aerosol pocket meet with equal value
      // and zero first derivative. Zero right width preserves the old volume.
      float mistX = samplePoint.x - uC7MistCenterX;
      float mistWidth = mistX > 0.0 && uC7MistRightWidthX > 0.0 ? uC7MistRightWidthX : uC7MistWidthX;
      float west = exp(-pow(mistX / mistWidth, 2.0));
      float localDensity = mix(uC7MistOutsideWeight, 1.0, west);
      float extinction = uC7ClearExtinction + uC7MistExtinction * distantMist * localDensity;
      float sampleLength = exp(-physicalHeight / uC7HeightScale) * rayLength / 12.0;
      opticalDepth += extinction * sampleLength;
      vec2 westOffset=(samplePoint.xz-vec2(uC7WestMistCenterX,uC7WestMistCenterZ))/vec2(uC7WestMistWidthX,uC7WestMistWidthZ);
      westOpticalDepth += uC7WestMistExtinction*distantMist*exp(-dot(westOffset,westOffset)-physicalHeight/uC7WestMistHeightScale)*rayLength/12.0;
    }
    }
    float transmittance = exp(-min(opticalDepth+westOpticalDepth, 12.0));
    vec3 rayDirection = normalize(actualWorldPosition - cameraPosition);
    float cosine = clamp(dot(rayDirection, normalize(uC7AerialSun)), -1.0, 1.0);
    float g = uC7PhaseAnisotropy;
    float denominator = 1.0 + g * g - 2.0 * g * cosine;
    float forward = pow((1.0 - g) * (1.0 - g) / max(denominator, 0.001), 1.5);
    // The background sky's inverse-tone-mapped HDR values may be several
    // times brighter than terrain. Bound luminance and chroma before mixing;
    // otherwise even 2% haze turns dark foreground grass sand-yellow.
    vec3 source = max(uC7SkyRadiance, vec3(0.0));
    float sourceY = max(dot(source, vec3(0.2126, 0.7152, 0.0722)), 0.00001);
    vec3 chroma = mix(vec3(1.0), source / sourceY, uC7HazeSaturation);
    float boundedY = min(sourceY, uC7HazeMaxLuminance);
    float phaseGain = 1.0 + uC7ForwardStrength * (forward - 0.5);
    vec3 inScattering = chroma * boundedY * phaseGain;
    // Authored aerosol pocket in the western valley, illuminated by the
    // rising warm sky. The same world density is seen in reflected rays.
    // Its energy fades with the common solar phase, never with screen position.
    vec3 westRadiance=vec3(1.65,.78,.22)*(0.65+0.7*forward);
    inScattering=mix(inScattering,westRadiance,westOpticalDepth/max(.000001,opticalDepth+westOpticalDepth));
    if (uC7DebugMode > 0.5 && uC7DebugMode < 1.5) return vec3(transmittance);
    if (uC7DebugMode > 1.5 && uC7DebugMode < 2.5) return vec3(c7SkyVisibility(actualWorldPosition));
    if (uC7DebugMode > 2.5) return inScattering;
    return outgoingRadiance * transmittance + inScattering * (1.0 - transmittance);
  }
`;

const indirectOcclusion = /* glsl */`
  float c7VisibleSky = mix(1.0, c7SkyVisibility(vC7AerialWorld), uC7Enabled * uC7AoStrength);
  reflectedLight.indirectDiffuse *= c7VisibleSky;
  reflectedLight.indirectSpecular *= mix(1.0, c7VisibleSky, clamp(material.roughness, 0.0, 1.0));
`;

/**
 * Visibility + aerial perspective for the C7 world, in metres and linear HDR.
 * Pass the live sunDirection and haze/sky radiance Vector3; references are kept.
 * apply(groupOrMesh) wraps existing PBR hooks, preserving tree/grass shaders.
 * This module does not modify scene.fog, lights, geometry, or non-PBR materials.
 * setParams({...}) or direct params.foo writes update live uniforms immediately.
 * debugMode: 0 beauty, 1 transmittance, 2 sky visibility, 3 bounded haze radiance.
 * debugSample(worldPoint, cameraPosition) returns the CPU equivalent of the
 * 12-sample optical calculation. Params.depthStretch/PivotZ preserve authored
 * optical distance when geometry is stretched for a long-lens camera study.
 */
function* buildAtmosphere({ heightAt, sunDirection, skyRadiance, params: initialParameters = {}, visibilityField }) {
  if (typeof heightAt !== 'function') throw new TypeError('Atmosphere requires heightAt(x,z)');
  if (!sunDirection?.isVector3 || !skyRadiance?.isVector3) throw new TypeError('Atmosphere sunDirection and skyRadiance must be Vector3');
  const field = visibilityField ? restoreSkyVisibility(visibilityField) : yield* buildSkyVisibility(heightAt);
  const uniforms = {
    uC7SkyVisibility: { value: field.texture },
    uC7VisibilityBounds: { value: new THREE.Vector4(GRID_BOUNDS.minX, GRID_BOUNDS.minZ, GRID_BOUNDS.maxX - GRID_BOUNDS.minX, GRID_BOUNDS.maxZ - GRID_BOUNDS.minZ) },
    uC7TerrainHeightRange: { value: new THREE.Vector2(field.minimumHeight, field.heightRange) },
    uC7AerialSun: { value: sunDirection },
    uC7SkyRadiance: { value: skyRadiance },
  };
  const parameterValues = { ...DEFAULT_ATMOSPHERE_PARAMETERS };
  for (const [key, name] of Object.entries(PARAMETER_UNIFORMS)) uniforms[name] = { value: parameterValues[key] };
  const params = new Proxy(parameterValues, {
    set(target, key, value) {
      if (!Object.hasOwn(DEFAULT_ATMOSPHERE_PARAMETERS, key)) throw new TypeError(`Unknown atmosphere parameter: ${String(key)}`);
      const number = typeof value === 'boolean' ? Number(value) : value;
      if (!Number.isFinite(number)) throw new TypeError(`Atmosphere parameter ${String(key)} must be finite`);
      let calibrated = number;
      if (['depthStretch', 'mistWidthX', 'heightScale', 'westMistWidthX', 'westMistWidthZ', 'westMistHeightScale'].includes(key)) calibrated = Math.max(0.001, number);
      if (['enabled', 'aoStrength', 'mistOutsideWeight', 'hazeSaturation'].includes(key)) calibrated = THREE.MathUtils.clamp(number, 0, 1);
      if (key === 'forwardStrength') calibrated = THREE.MathUtils.clamp(number, 0, 2);
      if (key === 'phaseAnisotropy') calibrated = THREE.MathUtils.clamp(number, 0, 0.95);
      if (['clearExtinction', 'mistExtinction', 'hazeMaxLuminance', 'westMistExtinction', 'mistRightWidthX'].includes(key)) calibrated = Math.max(0, number);
      target[key] = calibrated;
      uniforms[PARAMETER_UNIFORMS[key]].value = calibrated;
      return true;
    },
  });
  const setParams = values => { Object.assign(params, values); return { ...params }; };
  setParams(initialParameters);
  const wrapped = new Map();
  const stats = { ...field.stats, materialCount: 0, compiledMaterials: 0, disposed: false, params };
  const compiled = new WeakSet();

  function apply(groupOrMesh) {
    if (stats.disposed) throw new Error('Cannot apply a disposed atmosphere');
    if (!groupOrMesh?.traverse) throw new TypeError('Atmosphere.apply requires Object3D');
    groupOrMesh.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.isMeshStandardMaterial || wrapped.has(material)) continue;
        const priorCompile = material.onBeforeCompile;
        const priorCacheKey = material.customProgramCacheKey;
        const baseCacheKey = priorCacheKey.call(material);
        wrapped.set(material, { priorCompile, priorCacheKey });
        material.onBeforeCompile = function (shader, renderer) {
          priorCompile.call(this, shader, renderer);
          if (!shader.vertexShader.includes('#include <fog_vertex>') ||
              !shader.fragmentShader.includes('#include <aomap_fragment>') ||
              !shader.fragmentShader.includes('#include <opaque_fragment>')) {
            throw new Error(`Atmosphere hook points missing from material ${this.name || this.type}`);
          }
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = vertexDeclarations + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + vertexWorld);
          shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + indirectOcclusion);
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = c7ApplyAerial(outgoingLight, vC7AerialWorld);\n#include <opaque_fragment>');
          if (!compiled.has(this)) {
            compiled.add(this);
            stats.compiledMaterials++;
          }
        };
        material.customProgramCacheKey = () => `${baseCacheKey}|c7-atmosphere-asymmetric-pocket-v503`;
        material.needsUpdate = true;
      }
    });
    stats.materialCount = wrapped.size;
    return groupOrMesh;
  }

  function dispose() {
    if (stats.disposed) return;
    for (const [material, previous] of wrapped) {
      material.onBeforeCompile = previous.priorCompile;
      material.customProgramCacheKey = previous.priorCacheKey;
      material.needsUpdate = true;
    }
    wrapped.clear();
    field.texture.dispose();
    stats.disposed = true;
    stats.materialCount = 0;
  }
  function debugSample(point, eye) {
    const actualPoint = point.isVector3 ? point.clone() : new THREE.Vector3(...point);
    const actualEye = eye.isVector3 ? eye.clone() : new THREE.Vector3(...eye);
    const world = actualPoint.clone();
    const camera = actualEye.clone();
    world.z = params.depthPivotZ + (world.z - params.depthPivotZ) / params.depthStretch;
    camera.z = params.depthPivotZ + (camera.z - params.depthPivotZ) / params.depthStretch;
    const rayLength = world.distanceTo(camera);
    let opticalDepth = 0;
    let westOpticalDepth = 0;
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12;
      const x = THREE.MathUtils.lerp(camera.x, world.x, t);
      const z = THREE.MathUtils.lerp(camera.z, world.z, t);
      const height = Math.max(0, THREE.MathUtils.lerp(Math.abs(camera.y), world.y, t));
      const mist = 1 - THREE.MathUtils.smoothstep(z, params.mistFarZ, params.mistNearZ);
      const west = Math.exp(-(((x - params.mistCenterX) / params.mistWidthX) ** 2));
      const density = THREE.MathUtils.lerp(params.mistOutsideWeight, 1, west);
      const westDistance=((x-params.westMistCenterX)/params.westMistWidthX)**2+((z-params.westMistCenterZ)/params.westMistWidthZ)**2;
      westOpticalDepth+=params.westMistExtinction*mist*Math.exp(-westDistance-height/params.westMistHeightScale)*rayLength/12;
      opticalDepth += (params.clearExtinction + params.mistExtinction * mist * density) * Math.exp(-height / params.heightScale) * rayLength / 12;
    }
    const direction = actualPoint.clone().sub(actualEye).normalize();
    const cosine = THREE.MathUtils.clamp(direction.dot(sunDirection.clone().normalize()), -1, 1);
    const g = params.phaseAnisotropy;
    const forward = (((1 - g) ** 2) / Math.max(0.001, 1 + g * g - 2 * g * cosine)) ** 1.5;
    const source = skyRadiance.clone().max(new THREE.Vector3());
    const sourceY = Math.max(0.00001, source.dot(new THREE.Vector3(0.2126, 0.7152, 0.0722)));
    const scattering = new THREE.Vector3(1, 1, 1).lerp(source.multiplyScalar(1 / sourceY), params.hazeSaturation)
      .multiplyScalar(Math.min(sourceY, params.hazeMaxLuminance) * (1 + params.forwardStrength * (forward - 0.5)));
    scattering.lerp(new THREE.Vector3(1.65,.78,.22).multiplyScalar(.65+.7*forward),westOpticalDepth/Math.max(.000001,opticalDepth+westOpticalDepth));
    return {
      actualPoint: actualPoint.toArray(), authoredPoint: world.toArray(), authoredRayLength: rayLength,
      opticalDepth, westOpticalDepth, transmittance: params.enabled ? Math.exp(-Math.min(12, opticalDepth+westOpticalDepth)) : 1,
      forwardPhase: forward, inScatteringRadiance: scattering.toArray(),
    };
  }
  return { apply, dispose, stats, params, uniforms, setParams, debugSample };
}

export function createAtmosphere(options) { return finishBuild(buildAtmosphere(options)); }
export function createAtmosphereAsync(options, scheduling) { return finishBuildAsync(buildAtmosphere(options), scheduling); }

// The cached bytes are the generator's final RGBA8 texture, not an approximation.
export function createAtmosphereVisibility(heightAt){return finishBuild(buildSkyVisibility(heightAt));}
function restoreSkyVisibility(field){
 if(!(field.data instanceof Uint8Array)||field.data.length!==GRID_SIZE*GRID_SIZE*4||!Number.isFinite(field.minimumHeight)||!Number.isFinite(field.heightRange)||field.heightRange<1)throw Error('Invalid cached atmosphere');
 const texture=new THREE.DataTexture(field.data,GRID_SIZE,GRID_SIZE,THREE.RGBAFormat,THREE.UnsignedByteType);
 texture.name='C7 terrain sky visibility and height';texture.colorSpace=THREE.NoColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;texture.needsUpdate=true;
 return {texture,minimumHeight:field.minimumHeight,heightRange:field.heightRange,stats:{...field.stats,buildMilliseconds:0,precomputed:true}};
}
