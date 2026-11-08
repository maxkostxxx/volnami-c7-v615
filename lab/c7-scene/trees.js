import {createCanvas,loadTexture} from './canvas-platform.js';
import {finishBuildAsync} from './cooperative-build.js';
import * as THREE from 'three';
import { Tree } from './vendor/ez-tree/tree.js';
import { RuntimeTree } from './tree-runtime.js';
import TreeOptions from './vendor/ez-tree/options.js';

const SOURCE = 'dgreenheck/ez-tree@dcf309bd86bd521083d9c70f01f2de45fdc7c457';
const asset = (name) => new URL(`./assets/tree/${name}`, import.meta.url).href;
const LEAF_ALPHA_TEST = 0.4;
const MAX_CANOPY_LIGHTS = 6;

// Thin broadleaves transmit some incident light through the lamina. Extend
// Three's direct-light BRDF, whose IncidentLight color already carries the
// corresponding source's shadow. This preserves separate visibility for the
// low sun and every sample of the bright sky sector, without extra shadow taps.
// Model reference: GPU Gems 3, chapter 16, vegetation shading in Crysis.
const thinLeafDirect = /* glsl */`
  uniform float uLeafTransmissionStrength;
  uniform float uLeafLightWrap;
  uniform vec3 uLeafTransmissionSpectrum;
  uniform float uLeafTransmissionPigment;
  uniform float uLeafTransmissionExponent;
  uniform float uLeafHGEnabled;
  uniform float uLeafAnisotropy;
  float c7LeafForwardGain(float forwardCosine) {
    float mu = clamp(forwardCosine, -1.0, 1.0);
    float g = clamp(uLeafAnisotropy, 0.0, .97);
    // Incoming photon travel is -L, outgoing travel is view. This sign is the
    // opposite of PBRT's two-directions-away convention. Integral HG dω = 1.
    float denominator = 1.0 + g * g - 2.0 * g * mu;
    float phase = (1.0 - g * g) / (4.0 * PI * denominator * sqrt(denominator));
    float original = mix(.4, 1.0, pow(max(0.0, mu), 2.0));
    // BRDF_Lambert downstream supplies 1/PI; cancel it for a normalized phase.
    // No directional peak clamp: .15 is the transmitted fraction, not radiance.
    return mix(original, PI * phase, clamp(uLeafHGEnabled, 0.0, 1.0));
  }
  vec3 c7LeafTransmittance(vec3 diffuseColor, float forwardCosine) {
    vec3 original = sqrt(clamp(diffuseColor, vec3(0.0), vec3(1.0)));
    vec3 spectrum = clamp(uLeafTransmissionSpectrum, vec3(0.0), vec3(1.0));
    // Independent pigment chroma, with no increase in total RGB throughput.
    // The spectrum redistributes the existing lamina budget; it adds no light.
    float budget = dot(original, vec3(1.0));
    float scale = min(budget / max(.0001, dot(spectrum, vec3(1.0))),
      1.0 / max(.0001, max(spectrum.r, max(spectrum.g, spectrum.b))));
    vec3 pigmented = spectrum * scale;
    float angularWeight = uLeafTransmissionExponent <= 0.0 ? 1.0
      : pow(clamp(forwardCosine, 0.0, 1.0), clamp(uLeafTransmissionExponent, 1.0, 128.0));
    return mix(original, pigmented, clamp(uLeafTransmissionPigment, 0.0, 1.0) * angularWeight);
  }
  uniform float uLeafCanopyStrength;
  uniform int uLeafCanopyLightCount;
  void RE_Direct_C7Leaf(const in IncidentLight directLight,
    const in vec3 geometryPosition, const in vec3 geometryNormal,
    const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal,
      geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float NoL = clamp(dot(geometryNormal, directLight.direction), -1.0, 1.0);
    float backDiffuse = max(0.0, -NoL);
    float forward = c7LeafForwardGain(dot(geometryViewDir, -directLight.direction));
    float wrapped = clamp((NoL + uLeafLightWrap) / max(.001, 1.0 + uLeafLightWrap), 0.0, 1.0);
    float wrapExtra = max(0.0, wrapped - max(0.0, NoL));
    float thinLeafLobe = .7 * backDiffuse * forward + .3 * wrapExtra;
    // A shorter optical path reduces pigment absorption. The measured leaf
    // chroma is retained; the warm color comes from the actual incident light.
    vec3 transmittance = c7LeafTransmittance(material.diffuseColor, dot(geometryViewDir, -directLight.direction));
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(transmittance)
      * thinLeafLobe * clamp(uLeafTransmissionStrength, 0.0, .15)
      * (1.0 - clamp(uLeafCanopyStrength, 0.0, 1.0) * step(.5, float(uLeafCanopyLightCount)));
  }
  #undef RE_Direct
  #define RE_Direct RE_Direct_C7Leaf
`;

// A low-frequency foliage volume replaces only the transmission visibility.
// Ordinary reflected light still uses Three's per-source shadow maps. The
// extinction is Beer-Lambert through a fitted crown ellipsoid; terrain
// clearance is computed on the CPU and never bypassed by this contribution.
// Basis: GPU Gems 2 ch.1 §1.5 (shadow feelers / canopy density), GPU Gems 3
// ch.4 §4.4 (thin-leaf backlighting). This is a volume approximation, not a
// measured botanical transport model.
const canopyTransmission = /* glsl */`
  varying vec3 vC7LeafWorld;
  uniform vec3 uLeafCrownCenter;
  uniform vec3 uLeafCrownRadius;
  uniform vec3 uLeafCrownSampleHeights;
  uniform vec3 uLeafCanopyDirections[6];
  uniform vec3 uLeafCanopyRadiance[6];
  uniform vec3 uLeafTerrainClearance[6];
  uniform float uLeafCanopyOpticalDepth;
  uniform float uLeafDensityProfile;
  uniform float uLeafSolarDiskEnabled;
  uniform float uLeafSolarAngularRadius;
  uniform sampler2D uLeafSolarHeightField;
  uniform vec4 uLeafSolarFieldBounds;
  float c7SolarDiskVisibility() {
    // Actual per-fragment world XZ, bilinearly interpolated terrain horizon.
    vec2 g = clamp((vC7LeafWorld.xz - uLeafSolarFieldBounds.xy)
      / uLeafSolarFieldBounds.zw, vec2(0.0), vec2(1.0)) * 2.0;
    vec2 cell = min(floor(g), vec2(1.0)), blend = g - cell;
    vec2 uv = (cell + .5) / 3.0;
    vec2 low = mix(texture2D(uLeafSolarHeightField, uv).rg,
      texture2D(uLeafSolarHeightField, uv + vec2(1.0 / 3.0, 0.0)).rg, blend.x);
    vec2 high = mix(texture2D(uLeafSolarHeightField, uv + vec2(0.0, 1.0 / 3.0)).rg,
      texture2D(uLeafSolarHeightField, uv + vec2(1.0 / 3.0)).rg, blend.x);
    vec2 horizon = mix(low, high, blend.y);
    float cosineElevation = sqrt(max(.000001, 1.0 - uLeafCanopyDirections[0].y * uLeafCanopyDirections[0].y));
    // d(requiredHeight)/d(elevation) = -distance / cos(elevation).
    float halfWidth = max(.00001, horizon.y * uLeafSolarAngularRadius / cosineElevation);
    float q = clamp((vC7LeafWorld.y - horizon.x) / halfWidth, -1.0, 1.0);
    // Exact circular segment fraction for the local straight angular horizon.
    // Outside the finite disk's penumbra visibility is exactly zero or one.
    return .5 + (asin(q) + q * sqrt(max(0.0, 1.0 - q * q))) / PI;
  }

  float c7CanopyPath(vec3 position, vec3 direction) {
    vec3 q = (position - uLeafCrownCenter) / uLeafCrownRadius;
    vec3 d = direction / uLeafCrownRadius;
    float a = dot(d, d), b = dot(q, d), c = dot(q, q) - 1.0;
    float discriminant = b * b - a * c;
    if (discriminant <= 0.0) return 0.0;
    float root = sqrt(discriminant);
    float entry = max(0.0, (-b - root) / a);
    float exit = max(entry, (-b + root) / a);
    float length = exit - entry;
    // Integrate 1-r^2 along the actual ray through the fitted ellipsoid.
    // Factor 1.5 preserves optical depth across a central diameter.
    float weighted = max(0.0, 1.5 * (-c * length
      - b * (exit * exit - entry * entry)
      - a / 3.0 * (exit * exit * exit - entry * entry * entry)));
    return mix(length, weighted, clamp(uLeafDensityProfile, 0.0, 1.0));
  }
  float c7TerrainVisibility(vec3 clearance) {
    float y = vC7LeafWorld.y;
    float low = clamp((y - uLeafCrownSampleHeights.x)
      / max(.001, uLeafCrownSampleHeights.y - uLeafCrownSampleHeights.x), 0.0, 1.0);
    float high = clamp((y - uLeafCrownSampleHeights.y)
      / max(.001, uLeafCrownSampleHeights.z - uLeafCrownSampleHeights.y), 0.0, 1.0);
    float signedClearance = y < uLeafCrownSampleHeights.y
      ? mix(clearance.x, clearance.y, low) : mix(clearance.y, clearance.z, high);
    // Fade only above the obstruction. Negative clearance always blocks.
    return smoothstep(0.0, .25, signedClearance);
  }
  vec3 c7CanopyTransmission(PhysicalMaterial material, vec3 viewNormal, vec3 viewDirection) {
    vec3 normalWorld = transformNormalByInverseViewMatrix(viewNormal, viewMatrix);
    vec3 viewWorld = transformDirectionByInverseViewMatrix(viewDirection, viewMatrix);
    float strength = clamp(uLeafCanopyStrength, 0.0, 1.0)
      * clamp(uLeafTransmissionStrength, 0.0, .15);
    vec3 result = vec3(0.0);
    // Optical depth is specified across one horizontal crown diameter.
    float sigma = clamp(uLeafCanopyOpticalDepth, .25, 8.0)
      / max(.01, 2.0 * sqrt(uLeafCrownRadius.x * uLeafCrownRadius.z));
    for (int i = 0; i < 6; i++) {
      if (i < uLeafCanopyLightCount) {
        vec3 L = uLeafCanopyDirections[i];
        vec3 laminaTransmittance = c7LeafTransmittance(material.diffuseColor, dot(viewWorld, -L));
        float NoL = clamp(dot(normalWorld, L), -1.0, 1.0);
        float forward = c7LeafForwardGain(dot(viewWorld, -L));
        float wrapped = clamp((NoL + uLeafLightWrap) / max(.001, 1.0 + uLeafLightWrap), 0.0, 1.0);
        float lobe = .7 * max(0.0, -NoL) * forward
          + .3 * max(0.0, wrapped - max(0.0, NoL));
        float transmission = exp(-sigma * c7CanopyPath(vC7LeafWorld, L));
        float terrainVisibility = c7TerrainVisibility(uLeafTerrainClearance[i]);
        if (i == 0 && uLeafSolarDiskEnabled > .5) terrainVisibility = c7SolarDiskVisibility();
        result += uLeafCanopyRadiance[i] * BRDF_Lambert(laminaTransmittance)
          * lobe * transmission * terrainVisibility * strength;
      }
    }
    return result;
  }
`;

/** Signed terrain clearance at crown bottom, middle and top, in world metres.
 * The three parallel rays share the same required origin height, so only one
 * terrain traversal is needed. Interpolating clearance (rather than binary
 * visibility) prevents a light leak below an intervening hill's silhouette.
 */
export function computeCanopyTerrainClearance({ center, heights, direction, heightAt,
  authoredZFromWorld = z => z, maxDistance = 2200, authoredStep = 2, maxTerrainHeight = Infinity }) {
  if (typeof heightAt !== 'function') return new THREE.Vector3(-1, -1, -1);
  if (direction.y <= 0) return new THREE.Vector3(-1, -1, -1);
  const { requiredHeight } = traceCanopyTerrainRay({ center, direction, heightAt,
    authoredZFromWorld, maxDistance, authoredStep, maxTerrainHeight });
  return new THREE.Vector3(heights.x - requiredHeight,
    heights.y - requiredHeight, heights.z - requiredHeight);
}

function traceCanopyTerrainRay({ center, direction, heightAt,
  authoredZFromWorld, maxDistance, authoredStep, maxTerrainHeight = Infinity }) {
  const authoredSpeed = Math.hypot(direction.x,
    authoredZFromWorld(center.z + direction.z) - authoredZFromWorld(center.z));
  const step = Math.min(12, Math.max(.75, authoredStep / Math.max(.01, authoredSpeed)));
  let requiredHeight = -Infinity, occluderDistance = 0;
  let samples = 0;
  for (let distance = .25; distance <= maxDistance; distance += step) {
    // Positive elevation makes this upper bound decrease along the ray.
    // Once even the highest terrain cannot improve the existing horizon,
    // every remaining sample is irrelevant. Keep the original sample phase,
    // strict tie rule, dominant-occluder distance and final safety margin.
    if (direction.y > 0 && Number.isFinite(maxTerrainHeight)
      && maxTerrainHeight - direction.y * distance <= requiredHeight) break;
    const terrain = heightAt(center.x + direction.x * distance,
      authoredZFromWorld(center.z + direction.z * distance));
    samples++;
    if (!Number.isFinite(terrain)) continue;
    const required = terrain - direction.y * distance;
    if (required > requiredHeight) { requiredHeight = required; occluderDistance = distance; }
  }
  // Safety margin is toward occlusion, never an offset that escapes a hill.
  requiredHeight += .15;
  return { requiredHeight, samples, occluderDistance };
}

/** Exact, bounded ray cache. No angle rounding or interpolated heightfield.
 * The original sampling phase (.25 along the full 3D ray) depends on elevation;
 * sharing just an azimuth would change the sample positions and clearances.
 * Cache the required origin height instead: any three vertical crown samples
 * can reuse it without changing a floating-point operation in their result.
 * A newly encountered direction still requires its original terrain march.
 */
export function createCanopyTerrainRayCache({ heightAt, authoredZFromWorld = z => z,
  maxDistance = 2200, authoredStep = 2, maxEntries = 4096, maxTerrainHeight = Infinity }) {
  const rays = new Map();
  const stats = { hits: 0, misses: 0, samples: 0, entries: 0, evictions: 0 };
  const capacity = Math.max(1, Math.floor(maxEntries));
  return {
    stats,
    query({ center, heights, direction }) {
      if (typeof heightAt !== 'function' || direction.y <= 0) return new THREE.Vector3(-1, -1, -1);
      // Number.toString is an exact round-trip key for these finite doubles.
      const key = [center.x, center.z, direction.x, direction.y, direction.z].join(',');
      let requiredHeight;
      if (rays.has(key)) {
        requiredHeight = rays.get(key);
        rays.delete(key); rays.set(key, requiredHeight);
        stats.hits++;
      } else {
        const ray = traceCanopyTerrainRay({ center, direction, heightAt,
          authoredZFromWorld, maxDistance, authoredStep, maxTerrainHeight });
        requiredHeight = ray.requiredHeight;
        stats.samples += ray.samples;
        stats.misses++;
        if (rays.size >= capacity) { rays.delete(rays.keys().next().value); stats.evictions++; }
        rays.set(key, requiredHeight);
        stats.entries = rays.size;
      }
      return new THREE.Vector3(heights.x - requiredHeight,
        heights.y - requiredHeight, heights.z - requiredHeight);
    },
    clear() {
      rays.clear();
      Object.assign(stats, { hits: 0, misses: 0, samples: 0, entries: 0, evictions: 0 });
    },
  };
}

/** Analytic finite-disk visibility over a locally level angular horizon.
 * Each 3x3 world-XZ node stores the required origin height and the distance
 * to its dominant terrain occluder, both from an actual heightfield trace.
 * A disk viewed through one straight horizon has an exact circular-segment
 * visible fraction. Curved/azimuth-varying horizons are a tested approximation.
 */
export function buildSolarTerrainField({ bounds, direction, angularRadius,
  heightAt, authoredZFromWorld = z => z, maxDistance = 2200, authoredStep = 2, maxTerrainHeight = Infinity }) {
  const started = performance.now(), data = new Float32Array(3 * 3 * 4);
  const fieldBounds = new THREE.Vector4(bounds.min.x, bounds.min.z,
    Math.max(.001, bounds.max.x - bounds.min.x), Math.max(.001, bounds.max.z - bounds.min.z));
  let raySamples = 0;
  for (let iz = 0; iz < 3; iz++) for (let ix = 0; ix < 3; ix++) {
    const center = new THREE.Vector3(fieldBounds.x + ix * fieldBounds.z / 2, 0,
      fieldBounds.y + iz * fieldBounds.w / 2);
    const offset = (iz * 3 + ix) * 4;
    if (direction.y <= 0 || typeof heightAt !== 'function') { data[offset] = 1e6; data[offset + 1] = 1; continue; }
    const traced = traceCanopyTerrainRay({ center, direction, heightAt,
      authoredZFromWorld, maxDistance, authoredStep, maxTerrainHeight });
    data[offset] = Number.isFinite(traced.requiredHeight) ? traced.requiredHeight : 1e6;
    data[offset + 1] = traced.occluderDistance;
    raySamples += traced.samples;
  }
  return { data, bounds: fieldBounds, angularRadius, direction: direction.clone(),
    stats: { cpuMilliseconds: performance.now() - started, rays: 9, raySamples } };
}

export function sampleSolarTerrainHorizon(field, x, z) {
  const b = field.bounds, gx = THREE.MathUtils.clamp((x - b.x) / b.z, 0, 1) * 2;
  const gz = THREE.MathUtils.clamp((z - b.y) / b.w, 0, 1) * 2;
  const ix = Math.min(1, Math.floor(gx)), iz = Math.min(1, Math.floor(gz));
  const tx = gx - ix, tz = gz - iz;
  return [0, 1].map(channel => {
    const read = (x, z) => field.data[(z * 3 + x) * 4 + channel];
    const low = THREE.MathUtils.lerp(read(ix, iz), read(ix + 1, iz), tx);
    const high = THREE.MathUtils.lerp(read(ix, iz + 1), read(ix + 1, iz + 1), tx);
    return THREE.MathUtils.lerp(low, high, tz);
  });
}

export function solarDiskVisibleFraction(height, requiredHeight, occluderDistance,
  angularRadius, sourceElevationCosine) {
  const halfWidth = Math.max(.00001, occluderDistance * angularRadius / Math.max(.001, sourceElevationCosine));
  const q = THREE.MathUtils.clamp((height - requiredHeight) / halfWidth, -1, 1);
  return .5 + (Math.asin(q) + q * Math.sqrt(Math.max(0, 1 - q * q))) / Math.PI;
}

// Ordinary mipmaps average alpha with the transparent space between leaves.
// A 1024px spray then disappears under alphaTest when it covers just 1–3px.
// Preserve the silhouette's coverage at the cutout threshold at each mip level.
// Color is downsampled in premultiplied linear RGB, avoiding a bright fringe;
// only the upload mip alpha channel is adjusted after that filtering.
function preserveLeafMipCoverage(texture) {
  const source = texture.image;
  const base = createCanvas();
  base.width = source.width;
  base.height = source.height;
  const baseContext = base.getContext('2d', { willReadFrequently: true });
  baseContext.drawImage(source, 0, 0);
  const basePixels = baseContext.getImageData(0, 0, base.width, base.height).data;
  const threshold = LEAF_ALPHA_TEST * 255;
  const toLinear = (s) => s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  const toSRGB = (s) => s <= 0.0031308 ? s * 12.92 : 1.055 * s ** (1 / 2.4) - 0.055;
  let covered = 0;
  // Keep an unmodified premultiplied-linear pyramid. Alpha-coverage correction
  // is only applied to the uploaded copy, never fed into the next RGB filter.
  let sourcePixels = new Float32Array(basePixels.length);
  for (let i = 0; i < basePixels.length; i += 4) {
    const alpha = basePixels[i + 3] / 255;
    sourcePixels[i] = toLinear(basePixels[i] / 255) * alpha;
    sourcePixels[i + 1] = toLinear(basePixels[i + 1] / 255) * alpha;
    sourcePixels[i + 2] = toLinear(basePixels[i + 2] / 255) * alpha;
    sourcePixels[i + 3] = alpha;
    covered += basePixels[i + 3] >= threshold ? 1 : 0;
  }
  const targetCoverage = covered / (basePixels.length / 4);
  const mipmaps = [base];
  let sourceWidth = base.width;
  let sourceHeight = base.height;
  while (sourceWidth > 1 || sourceHeight > 1) {
    const width = Math.max(1, sourceWidth >> 1);
    const height = Math.max(1, sourceHeight >> 1);
    const linearPixels = new Float32Array(width * height * 4);
    const mip = createCanvas();
    mip.width = width;
    mip.height = height;
    const context = mip.getContext('2d');
    const pixels = context.createImageData(width, height);
    const rgba = pixels.data;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sourceIndex = (Math.min(sourceHeight - 1, y * 2 + dy) * sourceWidth + Math.min(sourceWidth - 1, x * 2 + dx)) * 4;
        for (let c = 0; c < 4; c++) linearPixels[i + c] += sourcePixels[sourceIndex + c] * 0.25;
      }
      const alpha = linearPixels[i + 3];
      for (let c = 0; c < 3; c++) rgba[i + c] = alpha > 0 ? Math.round(toSRGB(linearPixels[i + c] / alpha) * 255) : 0;
      rgba[i + 3] = Math.round(alpha * 255);
    }
    let low = 0;
    let high = 12;
    for (let step = 0; step < 14; step++) {
      const scale = (low + high) * 0.5;
      let count = 0;
      for (let i = 3; i < rgba.length; i += 4) count += rgba[i] * scale >= threshold ? 1 : 0;
      if (count / (width * height) < targetCoverage) low = scale;
      else high = scale;
    }
    const scale = (low + high) * 0.5;
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = Math.min(255, Math.round(rgba[i] * scale));
    context.putImageData(pixels, 0, 0);
    mipmaps.push(mip);
    sourcePixels = linearPixels;
    sourceWidth = width;
    sourceHeight = height;
  }
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.coverage = targetCoverage;
  texture.userData.mipCount = mipmaps.length;
}

// Preserve the original GPU mip tail (levels 2..10), rather than rebuilding
// smaller levels from a resized JPEG. All authored flight views sample this
// tail; the original 1024px source images remain available for authoring.
function restoreBarkMipTail(texture,expectedSize=256) {
  const atlas = texture.image;
  if (atlas.width !== expectedSize || atlas.height !== expectedSize*2-1) throw new Error('Invalid bark mip atlas');
  const levels = [];
  let y = 0;
  for (let size = expectedSize; size >= 1; size >>= 1) {
    const level = createCanvas();
    level.width = level.height = size;
    const context = level.getContext('2d');
    if (!context) throw new Error('Bark mip canvas unavailable');
    context.drawImage(atlas, 0, y, size, size, 0, 0, size, size);
    levels.push(level);
    y += size;
  }
  texture.image = levels[0];
  texture.mipmaps = levels;
  texture.userData.mipCount = levels.length;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

async function fillTextures(textures,{signal,mobile=false,sourceFormat='webp'}={}) {
  const treeAsset=name=>mobile?new URL('./mobile-data/'+(name==='leaves-oak.png'?'leaves-mips-lossless.webp':name),import.meta.url).href:asset(name==='leaves-oak.png'&&sourceFormat!=='png'?'leaves-oak-lossless.webp':name);
  const loaded=await Promise.allSettled([
    ['leaves','leaves-oak.png'],['bark','bark-color-mips.webp'],
    ['normal','bark-normal-mips.webp'],['roughness','bark-roughness-mips.webp'],
  ].map(([key,name])=>loadTexture(treeAsset(name),{signal,texture:textures[key]})));
  const failed=loaded.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  signal?.throwIfAborted();
  const {leaves,bark,normal,roughness}=textures;
  leaves.colorSpace = bark.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [leaves, bark, normal, roughness]) {
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  if(mobile)restoreBarkMipTail(leaves,512);else preserveLeafMipCoverage(leaves);
  for (const texture of [bark, normal, roughness]) restoreBarkMipTail(texture,mobile?128:256);
}

// Stable handles let CPU mesh construction overlap image I/O. No caller may
// upload or render them before ready. One handle owns disposal until take()
// transfers it, or for the entire lifetime of a takeForBuild() consumer.
export function prepareTreeTextures({signal,mobile=false,sourceFormat='webp'}={}) {
  const textures=Object.fromEntries(['leaves','bark','normal','roughness'].map(key=>[key,new THREE.Texture()]));
  const controller=new AbortController();
  let disposed=false,claimed=false,owned=true;
  const release=()=>{if(owned){owned=false;for(const texture of Object.values(textures))texture.dispose();}};
  const onAbort=()=>controller.abort(signal.reason);
  if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});
  const ready=fillTextures(textures,{signal:controller.signal,mobile,sourceFormat}).then(()=>{
    if(disposed)throw new DOMException('Tree textures disposed','AbortError');
  }).catch(error=>{release();throw error;}).finally(()=>signal?.removeEventListener('abort',onAbort));
  ready.catch(()=>{});
  const claim=()=>{if(claimed)throw Error('Tree textures already claimed');if(disposed)throw new DOMException('Tree textures disposed','AbortError');claimed=true;};
  const dispose=()=>{if(disposed)return;disposed=true;controller.abort();release();};
  return {
    async take(){claim();await ready;if(disposed)throw new DOMException('Tree textures disposed','AbortError');owned=false;return textures;},
    takeForBuild(){claim();return{textures,ready,dispose};},
    dispose,
  };
}

function optionsFor(shape, seed, textures) {
  const options = new TreeOptions();
  const column = shape === 'column';
  options.seed = seed;
  // Evergreen branching describes a tapering crown; the actual foliage remains
  // broadleaved oak sprays, matching the reference's narrow deciduous trees.
  options.type = column ? 'evergreen' : 'deciduous';
  options.bark.tint = 0xb3ad91;
  options.bark.textureScale = { x: 1.3, y: 4 };
  options.bark.maps = {
    color: textures.bark,
    normal: textures.normal,
    roughness: textures.roughness,
    ao: null,
  };
  options.branch.levels = 3;
  options.branch.children = column ? { 0: 17, 1: 4, 2: 3 } : { 0: 8, 1: 5, 2: 3 };
  options.branch.angle = column ? { 1: 38, 2: 50, 3: 43 } : { 1: 65, 2: 48, 3: 42 };
  options.branch.length = column
    ? { 0: 48, 1: 28, 2: 9, 3: 4.5 }
    : { 0: 23, 1: 17, 2: 8, 3: 4.5 };
  options.branch.radius = { 0: column ? 0.8 : 1.05, 1: 0.58, 2: 0.59, 3: 0.52 };
  options.branch.sections = { 0: 14, 1: 7, 2: 4, 3: 3 };
  options.branch.segments = { 0: 9, 1: 6, 2: 4, 3: 3 };
  options.branch.start = column ? { 1: 0.24, 2: 0.12, 3: 0.02 } : { 1: 0.62, 2: 0.25, 3: 0.12 };
  options.branch.taper = { 0: 0.82, 1: 0.68, 2: 0.7, 3: 0.85 };
  options.branch.gnarliness = column
    ? { 0: 0.02, 1: 0.075, 2: 0.10, 3: 0.06 }
    : { 0: 0.045, 1: 0.08, 2: 0.10, 3: 0.05 };
  options.branch.twist = { 0: 0.025, 1: 0.12, 2: 0.08, 3: 0.06 };
  options.branch.force = { direction: { x: 0, y: 1, z: 0 }, strength: column ? 0.02 : 0.014 };
  options.leaves.map = textures.leaves;
  options.leaves.type = 'oak';
  options.leaves.billboard = 'double';
  options.leaves.angle = 46;
  options.leaves.count = column ? 24 : 25;
  options.leaves.start = 0.02;
  options.leaves.size = column ? 6.2 : 5.4;
  options.leaves.sizeVariance = 0.22;
  options.leaves.tint = 0x9fc18b;
  options.leaves.alphaTest = LEAF_ALPHA_TEST;
  options.leaves.roundedNormals = true;
  options.trellis.enabled = false;
  return options;
}

function addCanopyVariation(geometry, seed) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const bounds = geometry.boundingBox || (geometry.computeBoundingBox(), geometry.boundingBox);
  const range = Math.max(1, bounds.max.y - bounds.min.y);
  for (let i = 0; i < position.count; i += 4) {
    // One value per leaf card, so variation cannot create a triangle checkerboard.
    const leaf = Math.floor(i / 4);
    const noise = Math.sin(leaf * 12.9898 + seed * 0.781) * 43758.5453;
    const random = noise - Math.floor(noise);
    const high = THREE.MathUtils.clamp((position.getY(i) - bounds.min.y) / range, 0, 1);
    const tone = 0.72 + random * 0.22 + high * 0.06;
    for (let j = i; j < Math.min(i + 4, position.count); j++) {
      colors[j * 3] = tone;
      colors[j * 3 + 1] = tone;
      colors[j * 3 + 2] = tone * 0.91;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Author two volumetric crowns from the generated branching skeleton.
 * No topology is added. Both branches and foliage follow the same smooth
 * spatial field; the existing rounded normals follow its inverse transpose.
 * Exported so authoring checks can validate geometry without a WebGL context.
 */
export function shapeGeneratedTree(tree, shape) {
  const meshes = [tree.branchesMesh, tree.leavesMesh];
  const compressAbove = (threshold, scale) => {
    for (const mesh of meshes) {
      const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) <= threshold) continue;
        p.setY(i, threshold + (p.getY(i) - threshold) * scale);
        const nx = n.getX(i), ny = n.getY(i) / scale, nz = n.getZ(i);
        const length = Math.hypot(nx, ny, nz);
        n.setXYZ(i, nx / length, ny / length, nz / length);
      }
      mesh.geometry.computeBoundingBox();
    }
  };
  tree.leavesMesh.geometry.computeBoundingBox();
  if (shape === 'round') {
    compressAbove(Math.max(0, tree.leavesMesh.geometry.boundingBox.min.y), .6);
    const bounds = tree.leavesMesh.geometry.boundingBox;
    // The generator's deciduous terminal branch otherwise leaves a tall spike.
    compressAbove(bounds.min.y + .72 * (bounds.max.y - bounds.min.y), .35);
  }
  const bounds = tree.leavesMesh.geometry.boundingBox;
  const base = bounds.min.y, height = Math.max(.001, bounds.max.y - base);
  const leaves = tree.leavesMesh.geometry.getAttribute('position');
  let radius = 0;
  for (let i = 0; i < leaves.count; i++) radius = Math.max(radius, Math.hypot(leaves.getX(i), leaves.getZ(i)));
  radius = Math.max(.01, radius * .85);
  let minRadialDerivative = Infinity, maxNormalError = 0;
  for (const mesh of meshes) {
    const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-8) continue;
      const rawU = (y - base) / height, u = THREE.MathUtils.clamp(rawU, .008, .998);
      const ellipse = Math.sqrt(4 * u * (1 - u));
      const pear = shape === 'column' ? 1.6 - 1.2 * u : 1;
      const R = Math.max(.01, radius * ellipse * pear);
      const dRdy = rawU > .008 && rawU < .998
        ? radius * ((2 - 4 * u) / ellipse * pear + ellipse * (shape === 'column' ? -1.2 : 0)) / height : 0;
      const q = r / R, t = Math.tanh(q), exp = Math.exp(-2 * q);
      const dr = Math.max(1e-15, 4 * exp / ((1 + exp) * (1 + exp)));
      const dy = dRdy * (t - q * dr), tangentialScale = R * t / r;
      p.setXYZ(i, x * tangentialScale, y, z * tangentialScale);
      // In cylindrical coordinates the Jacobian is [[dr,dy,0],[0,1,0],
      // [0,0,r'/r]]. This direct inverse transpose avoids subtractive
      // cancellation when a peripheral twig is compressed near the boundary.
      const ex = x / r, ez = z / r;
      const nr = n.getX(i) * ex + n.getZ(i) * ez;
      const nt = -n.getX(i) * ez + n.getZ(i) * ex;
      const nextR = nr / dr, nextT = nt / tangentialScale;
      const nx = nextR * ex - nextT * ez;
      const ny = n.getY(i) - dy * nextR;
      const nz = nextR * ez + nextT * ex;
      const length = Math.hypot(nx, ny, nz);
      n.setXYZ(i, nx / length, ny / length, nz / length);
      minRadialDerivative = Math.min(minRadialDerivative, dr);
      maxNormalError = Math.max(maxNormalError,
        Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
    }
    p.needsUpdate = n.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  return { minRadialDerivative, maxNormalError };
}

/** Fit dense column crowns using the same monotone warp for wood/leaves.
 * World placement is already final. Limit the requested warp by the actual
 * terrain below every leaf-card vertex, retaining a 20cm clearance. The full
 * root/tip/XZ bounds remain fixed, so height and crown width do not drift.
 */
export function lowerColumnCrown(tree, {strength=.55,heightAt,authoredZFromWorld=z=>z,clearance=.2}={}) {
  const meshes=[tree.branchesMesh,tree.leavesMesh],full=new THREE.Box3();
  for(const mesh of meshes){mesh.geometry.computeBoundingBox();full.union(mesh.geometry.boundingBox)}
  const H=full.max.y-full.min.y,leaf=tree.leavesMesh.geometry.getAttribute('position'),point=new THREE.Vector3();
  let k=THREE.MathUtils.clamp(strength,0,.8);
  tree.updateMatrixWorld(true);
  if(typeof heightAt==='function'){
    for(let i=0;i<leaf.count;i++){
      const y=leaf.getY(i),u=THREE.MathUtils.clamp((y-full.min.y)/H,0,1),dropPerUnit=H*u*(1-u)*tree.scale.y;
      if(dropPerUnit<1e-8)continue;
      point.fromBufferAttribute(leaf,i).applyMatrix4(tree.leavesMesh.matrixWorld);
      const ground=heightAt(point.x,authoredZFromWorld(point.z));
      if(!Number.isFinite(ground)){k=0;break}
      // A wider authored crown can already intersect the slope before lowering.
      // A negative coefficient raises its interior with the same smooth warp;
      // root and tip remain fixed. The shared wood/leaf deformation preserves
      // attachment and its analytic inverse-transpose normal transformation.
      k=Math.min(k,(point.y-ground-clearance)/dropPerUnit);
    }
  }
  // The warp derivative is at least 1-|k|. Never accept a fold or silently
  // leave a crown below the terrain when this bounded deformation cannot fit.
  if(k < -.8)throw new Error('Column crown requires a different placement or width');
  let maxNormalError=0,minVerticalDerivative=1;
  for(const mesh of meshes){
    const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++){
      const y=p.getY(i),u=THREE.MathUtils.clamp((y-full.min.y)/H,0,1),derivative=1-k*(1-2*u);
      p.setY(i,y-k*H*u*(1-u));
      const nx=n.getX(i),ny=n.getY(i)/derivative,nz=n.getZ(i),length=Math.hypot(nx,ny,nz);
      n.setXYZ(i,nx/length,ny/length,nz/length);
      minVerticalDerivative=Math.min(minVerticalDerivative,derivative);
      maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
    }
    p.needsUpdate=n.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  }
  return{requestedStrength:strength,strength:k,clearance,limited:k<strength,minVerticalDerivative,maxNormalError};
}

/**
 * True branching trees with textured, intersecting leaf sprays.
 * placements: [{ x, y, z, height, width?, shape: 'column' | 'round', seed }]
 * The root is at the placement; total mesh height is exactly `height` metres.
 * Optional width is a fixed, physical crown width, never a viewport mask.
 * Caller owns the group. Call group.userData.dispose() when removing it.
 */
function refineCrownNormals(geometry, blend) {
  if (!(blend > 0)) return;
  geometry.computeBoundingBox();
  const center=geometry.boundingBox.getCenter(new THREE.Vector3());
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  const envelope=new THREE.Vector3(),detail=new THREE.Vector3();
  for(let i=0;i<position.count;i++) {
    // The broad crown defines a coherent volume; retain local leaf normals
    // for detail. Positions, cutout coverage and shadow geometry stay intact.
    envelope.set((position.getX(i)-center.x)/Math.max(.0001,size.x*size.x),
      (position.getY(i)-center.y)/Math.max(.0001,size.y*size.y),
      (position.getZ(i)-center.z)/Math.max(.0001,size.z*size.z)).normalize();
    detail.fromBufferAttribute(normal,i).lerp(envelope,THREE.MathUtils.clamp(blend,0,1)).normalize();
    normal.setXYZ(i,detail.x,detail.y,detail.z);
  }
  normal.needsUpdate=true;
}

export async function createTrees(placements, options = {}) {
  if (!Array.isArray(placements)) throw new TypeError('Tree placements must be an array');
  for (const p of placements) {
    if (![p.x, p.y, p.z, p.height].every(Number.isFinite) || p.height <= 0) {
      throw new TypeError('Tree placements require finite coordinates and positive height');
    }
    if (p.shape !== 'column' && p.shape !== 'round') throw new TypeError('Unknown tree shape');
    if (p.width !== undefined && (!Number.isFinite(p.width) || p.width <= 0)) {
      throw new TypeError('Optional tree crown width must be positive and finite');
    }
  }
  const preparation=options.preparedTextures??prepareTreeTextures({signal:options.signal,mobile:options.mobile});
  const early=options.deferTextureReady?preparation.takeForBuild():null;
  const textures=early?early.textures:await preparation.take();
  const group = new THREE.Group();
  group.name = 'ReferenceTrees';
  // The heightfield is authored before the scene's longitudinal scaling.
  // worldZ may be supplied for the current affine world conversion; an
  // explicit inverse also supports callers with a different coordinate map.
  const worldZero = typeof options.worldZ === 'function' ? options.worldZ(0)
    : (options.depthPivot ?? 85) * (1 - (options.depthStretch ?? 1));
  const worldScale = typeof options.worldZ === 'function' ? options.worldZ(1) - worldZero
    : (options.depthStretch ?? 1);
  if (!Number.isFinite(worldScale) || worldScale <= 0) throw new TypeError('Tree worldZ must have positive affine scale');
  const authoredZFromWorld = options.authoredZFromWorld ?? (z => (z - worldZero) / worldScale);
  const terrainRayCache = createCanopyTerrainRayCache({
    heightAt: options.heightAt, authoredZFromWorld,
    maxDistance: options.terrainRayDistance ?? 2200,
    authoredStep: options.terrainRayStep ?? 2,
    maxEntries: options.terrainRayCacheEntries ?? 4096,
    maxTerrainHeight: options.terrainMaxHeight ?? Infinity,
  });
  // The v319 reference comparison selects full forward-angle pigment mixing.
  // Transmission strength remains .05 and the existing RGB budget is unchanged. Shared controls
  // retain reproducible A/B without recompilation; crown/reference matching
  // and the continuous solar-cycle performance gate remain open.
  const leafUniforms = {
    uLeafTransmissionStrength: { value: .05 },
    uLeafTransmissionSpectrum: { value: new THREE.Vector3(1, .35, .035) },
    uLeafTransmissionPigment: { value: 1 },
    uLeafTransmissionExponent: { value: 32 },
    uLeafHGEnabled: { value: 1 },
    uLeafSolarDiskEnabled: { value: 1 },
    uLeafSolarAngularRadius: { value: 0.006 },
    uLeafAnisotropy: { value: .8 },
    uLeafLightWrap: { value: .3 },
    uLeafCanopyStrength: { value: 1 },
    uLeafCanopyOpticalDepth: { value: 2 },
    uLeafDensityProfile: { value: 1 },
    uLeafCanopyLightCount: { value: 0 },
    uLeafCanopyDirections: { value: Array.from({ length: MAX_CANOPY_LIGHTS }, () => new THREE.Vector3(0, 1, 0)) },
    uLeafCanopyRadiance: { value: Array.from({ length: MAX_CANOPY_LIGHTS }, () => new THREE.Vector3()) },
  };
  const stats = [];
  const crowns = [];
  const disposeBuiltTrees = () => {
    terrainRayCache.clear();
    for (const crown of crowns) crown.solarFields?.clear();
    for (const crown of crowns) crown.uniforms.uLeafSolarHeightField.value.dispose();
    group.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    if(early)early.dispose();else Object.values(textures).forEach((texture) => texture.dispose());
    group.clear();
  };
  try {
  await finishBuildAsync((function* () {
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const seed = Number.isFinite(placement.seed) ? placement.seed : 4242 + i * 997;
    const treeOptions=optionsFor(placement.shape, seed, textures);
    // Authored foliage density may differ per tree; the branching seed and
    // final world dimensions remain explicit in the placement.
    treeOptions.leaves.count=placement.leafCount??treeOptions.leaves.count;
    const tree = options.releaseConstructionData ? new RuntimeTree(treeOptions) : new Tree(treeOptions);
    if(options.mobile){
      // The vendor meshes one unchanged skeleton at lower detail. Keeping
      // double crossed leaf cards preserves depth when camera/sun move.
      tree.generateLODs([{distance:0,detail:{sectionStride:3,segmentFactor:.75,leafStride:2,leafScale:1.25}}]);
      tree.add(tree.branchesMesh,tree.leavesMesh);tree.remove(tree.lod);tree.lod=null;
    }else tree.generate();
    tree.name = `${placement.shape}-tree-${i}-${seed}`;
    const crownShapeStats = shapeGeneratedTree(tree, placement.shape);
    tree.rotation.y = (seed * 0.61803398875 % 1) * Math.PI * 2;
    const generatedLeafMaterial = tree.leavesMesh.material;
    const leafMaterial = new THREE.MeshPhysicalMaterial();
    // Preserve all upstream Standard properties, including texture references,
    // alpha coverage and custom normal/wind hook, then enable only reflectivity.
    THREE.MeshStandardMaterial.prototype.copy.call(leafMaterial, generatedLeafMaterial);
    leafMaterial.defines = { STANDARD: '', PHYSICAL: '' };
    leafMaterial.userData = generatedLeafMaterial.userData;
    leafMaterial.onBeforeCompile = generatedLeafMaterial.onBeforeCompile;
    leafMaterial.specularIntensity = .35;
    tree.leavesMesh.material = leafMaterial;
    generatedLeafMaterial.dispose();
    leafMaterial.name = 'oak-foliage';
    // The main MSAA canvas lost almost all subpixel leaf coverage with A2C,
    // unlike the non-MSAA reflection target. Opaque cutouts keep both coherent.
    leafMaterial.alphaToCoverage = false;
    leafMaterial.forceSinglePass = true;
    leafMaterial.vertexColors = true;
    leafMaterial.roughness = 0.92;
    leafMaterial.shadowSide = THREE.DoubleSide;
    addCanopyVariation(tree.leavesMesh.geometry, seed);
    const solarTexture = new THREE.DataTexture(new Float32Array(3 * 3 * 4).fill(1e6),
      3, 3, THREE.RGBAFormat, THREE.FloatType);
    solarTexture.minFilter = THREE.NearestFilter; solarTexture.magFilter = THREE.NearestFilter;
    solarTexture.generateMipmaps = false; solarTexture.needsUpdate = true;
    const crownUniforms = {
      uLeafSolarHeightField: { value: solarTexture },
      uLeafSolarFieldBounds: { value: new THREE.Vector4() },
      uLeafCrownCenter: { value: new THREE.Vector3() },
      uLeafCrownRadius: { value: new THREE.Vector3(1, 1, 1) },
      uLeafCrownSampleHeights: { value: new THREE.Vector3() },
      uLeafTerrainClearance: { value: Array.from({ length: MAX_CANOPY_LIGHTS }, () => new THREE.Vector3(-1, -1, -1)) },
    };
    // The reference comparison is a still. Freeze upstream wind so rendered
    // geometry and its shadow stay identical; the site may add wind separately.
    const compileLeaf = leafMaterial.onBeforeCompile;
    leafMaterial.onBeforeCompile = function (shader, renderer) {
      compileLeaf.call(this, shader, renderer);
      shader.uniforms.uWindStrength.value.set(0, 0, 0);
      Object.assign(shader.uniforms, leafUniforms, crownUniforms);
      shader.vertexShader = 'varying vec3 vC7LeafWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>',
        '#include <fog_vertex>\nvC7LeafWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_pars_fragment>',
        '#include <lights_physical_pars_fragment>\n' + thinLeafDirect + canopyTransmission,
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directDiffuse += c7CanopyTransmission(material, geometryNormal, geometryViewDir);');
    };
    leafMaterial.userData.leafUniforms = leafUniforms;
    leafMaterial.userData.crownUniforms = crownUniforms;
    leafMaterial.customProgramCacheKey = () => 'c7-eztree-physical-leaf-v10';
    tree.branchesMesh.material.normalScale.set(0.35, 0.35);
    tree.branchesMesh.material.roughness = 1;
    for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.geometry.computeBoundingSphere();
    }
    // Native generator units are arbitrary. Author width independently, then
    // use the real full-tree bounds to obtain a repeatable world-space height.
    const widthScale = placement.shape === 'column' ? 1.08 : .73;
    tree.scale.set(widthScale, 1, widthScale);
    tree.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tree);
    const scale = placement.height / (box.max.y - box.min.y);
    tree.scale.multiplyScalar(scale);
    tree.updateMatrixWorld(true);
    if (placement.width !== undefined) {
      const leafBounds = new THREE.Box3().setFromObject(tree.leavesMesh, true);
      const widthRatio = placement.width / (leafBounds.max.x - leafBounds.min.x);
      tree.scale.x *= widthRatio;
      tree.scale.z *= widthRatio;
    }
    // Compress only the authored crown's world-depth axis before clearance fit.
    // Keep projected width, root and height; transform normals with the same
    // invertible affine map, including the tree's deterministic rotation.
    if(placement.crownDepthScale!==undefined&&placement.crownDepthScale!==1){
      const depth=placement.crownDepthScale;
      if(!Number.isFinite(depth)||depth<=0)throw new TypeError('Crown depth scale must be positive and finite');
      const rotation=new THREE.Matrix4().makeRotationY(tree.rotation.y);
      const fit=new THREE.Matrix4().makeRotationY(-tree.rotation.y)
        .multiply(new THREE.Matrix4().makeScale(1,1,depth)).multiply(rotation);
      for(const mesh of [tree.branchesMesh,tree.leavesMesh])mesh.geometry.applyMatrix4(fit);
    }
    tree.position.set(placement.x, placement.y - box.min.y * scale, placement.z);
    tree.updateMatrixWorld(true);
    if(placement.shape==='column')crownShapeStats.verticalWarp=lowerColumnCrown(tree,{strength:placement.crownLowering??.55,heightAt:options.heightAt,authoredZFromWorld});
    refineCrownNormals(tree.leavesMesh.geometry,placement.crownNormalBlend??0);
    const measured = new THREE.Box3().setFromObject(tree);
    const crownBounds = new THREE.Box3().setFromObject(tree.leavesMesh);
    const center = crownBounds.getCenter(crownUniforms.uLeafCrownCenter.value);
    const radius = crownBounds.getSize(crownUniforms.uLeafCrownRadius.value).multiplyScalar(.5);
    radius.max(new THREE.Vector3(.01, .01, .01));
    // Expand the AABB-derived ellipsoid just enough to contain every card
    // vertex. This avoids zero-thickness holes at box corners outside it.
    const leafPosition = tree.leavesMesh.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    let enclosure = 1;
    for (let vertex = 0; vertex < leafPosition.count; vertex++) {
      point.fromBufferAttribute(leafPosition, vertex).applyMatrix4(tree.leavesMesh.matrixWorld);
      point.sub(center).divide(radius);
      enclosure = Math.max(enclosure, point.length());
    }
    radius.multiplyScalar(enclosure);
    crownUniforms.uLeafCrownSampleHeights.value.set(crownBounds.min.y, center.y, crownBounds.max.y);
    crowns.push({ tree, material: leafMaterial, uniforms: crownUniforms,
      originalTint: leafMaterial.color.clone(), bounds: crownBounds });
    stats.push({
      name: tree.name, seed, shape: placement.shape,
      triangles: tree.triangleCount,
      width: measured.max.x - measured.min.x,
      crownWidth: (() => { const b = new THREE.Box3().setFromObject(tree.leavesMesh, true); return b.max.x - b.min.x; })(),
      height: measured.max.y - measured.min.y,
      rootY: measured.min.y,
      crownShape: crownShapeStats,
    });
    if(options.releaseConstructionData) tree.releaseConstructionData();
    group.add(tree);
    yield;
  }
  })(), {signal:options.signal});
  } catch(error) { disposeBuiltTrees(); throw error; }
  group.userData.source = SOURCE;
  group.userData.leafUniforms = leafUniforms;
  group.userData.setLeafTintRelaxation = amount => {
    const t = THREE.MathUtils.clamp(amount, 0, 1);
    for (const crown of crowns) crown.material.color.copy(crown.originalTint).lerp(new THREE.Color(1, 1, 1), t);
    return t;
  };
  group.userData.updateEnvironment = (texture, intensity, solarPhase = 1) => {
    // At dawn, a strong uniform sky fill and bright leaf highlights compete
    // with the backlit silhouette. Recover directional half-tones only during
    // emergence; the existing daytime/sunset response is unchanged.
    // solarPhase is the same eased phase as skyLight, not camera travel.
    const dawnToDay = THREE.MathUtils.smoothstep(solarPhase, 0, .08);
    const leafEnvironmentGain = THREE.MathUtils.lerp(1, 1.8, dawnToDay);
    const leafSpecular = THREE.MathUtils.lerp(.12, .35, dawnToDay);
    for (const crown of crowns) {
      const clearances = crown.uniforms.uLeafTerrainClearance.value.slice(0, 4);
      const visibility = clearances.reduce((sum, clearance) => sum + THREE.MathUtils.clamp((clearance.y + 5) / 15, 0, 1), 0) / clearances.length;
      // Use the existing sky environment; no extra direct light or pass.
      // Keep the terrain-visibility modulation; no extra direct light or pass.
      const environmentChanged=crown.material.envMap!==texture;
      crown.material.envMap = texture;
      crown.material.envMapIntensity = texture ? intensity * leafEnvironmentGain * (.55 + .45 * visibility) : 1;
      crown.material.specularIntensity = leafSpecular;
      // A radiance/intensity update does not change the shader layout.
      if(environmentChanged)crown.material.needsUpdate = true;
    }
  };
  // Explicit array order is retained; it is independent of Three's internal
  // light sorting. Only current scene light color/intensity feeds this lobe.
  group.userData.invalidateTerrainLighting = () => {
    terrainRayCache.clear();
    for (const crown of crowns) { crown.solarFields?.clear(); crown.solarKey = undefined; }
  };
  group.userData.updateLighting = lights => {
    if (!Array.isArray(lights) || lights.length > MAX_CANOPY_LIGHTS
      || lights.some(light => !light?.isDirectionalLight)) {
      throw new TypeError(`Canopy lighting requires at most ${MAX_CANOPY_LIGHTS} directional lights in stable order`);
    }
    if (typeof options.heightAt !== 'function') {
      leafUniforms.uLeafCanopyLightCount.value = 0;
      return { enabled: false, reason: 'heightAt is required to preserve terrain occlusion' };
    }
    const started = performance.now();
    const target = new THREE.Vector3();
    for (let i = 0; i < MAX_CANOPY_LIGHTS; i++) {
      const radiance = leafUniforms.uLeafCanopyRadiance.value[i];
      if (i >= lights.length) { radiance.set(0, 0, 0); continue; }
      const light = lights[i], direction = leafUniforms.uLeafCanopyDirections.value[i];
      light.getWorldPosition(direction); light.target.getWorldPosition(target);
      direction.sub(target).normalize();
      radiance.set(light.color.r, light.color.g, light.color.b).multiplyScalar(light.visible ? light.intensity : 0);
      for (const crown of crowns) crown.uniforms.uLeafTerrainClearance.value[i].copy(terrainRayCache.query({
        center: crown.uniforms.uLeafCrownCenter.value,
        heights: crown.uniforms.uLeafCrownSampleHeights.value,
        direction,
      }));
    }
    // Index zero is the actual sunlight, matching the explicit caller order.
    // Reuse the exact field for repeated still frames; a changed direction
    // retraces it. Performance is measured, not hidden by throttling.
    const solar = leafUniforms.uLeafCanopyDirections.value[0];
    const solarRadius = options.sunAngularRadius ?? 0.006;
    const solarKey = [solar.x, solar.y, solar.z, solarRadius].join(',');
    let solarMilliseconds = 0, solarHits = 0, solarRays = 0;
    for (const crown of crowns) {
      if (crown.solarKey === solarKey) continue;
      // Exact per-crown keys: no angular interpolation or quantization beyond
      // the existing world's solar grid. A return scroll reuses immutable field
      // bytes; the texture still owns its separate upload buffer.
      const fields = crown.solarFields ??= new Map();
      let field = fields.get(solarKey);
      if (field) solarHits++;
      else {
        field = buildSolarTerrainField({ bounds: crown.bounds, direction: solar,
          angularRadius: solarRadius, heightAt: options.heightAt, authoredZFromWorld,
          maxDistance: options.terrainRayDistance ?? 2200, authoredStep: options.terrainRayStep ?? 2,
          maxTerrainHeight: options.terrainMaxHeight ?? Infinity });
        if (fields.size >= 512) fields.delete(fields.keys().next().value);
        fields.set(solarKey, field);
        solarMilliseconds += field.stats.cpuMilliseconds;solarRays += field.stats.rays;
      }
      crown.uniforms.uLeafSolarHeightField.value.image.data.set(field.data);
      crown.uniforms.uLeafSolarHeightField.value.needsUpdate = true;
      crown.uniforms.uLeafSolarFieldBounds.value.copy(field.bounds);
      crown.solarKey = solarKey; crown.solarStats = field.stats;
    }
    leafUniforms.uLeafCanopyLightCount.value = lights.length;
    const result = { enabled: true, cpuMilliseconds: performance.now() - started,
      terrainCache: { ...terrainRayCache.stats },
      finiteSolarDisk: { angularRadius: solarRadius, samples: 0, grid: [3, 3],
        cpuMilliseconds: solarMilliseconds, cacheHits: solarHits,
        cacheEntries: crowns.reduce((n,c)=>n+(c.solarFields?.size??0),0),
        cacheDataBytes: crowns.reduce((n,c)=>n+(c.solarFields?.size??0)*144,0),
        rays: solarRays },
      lightOrder: lights.map(light => ({ name: light.name || light.type, uuid: light.uuid })),
      crowns: crowns.map(crown => ({ name: crown.tree.name,
        center: crown.uniforms.uLeafCrownCenter.value.toArray(),
        radius: crown.uniforms.uLeafCrownRadius.value.toArray(),
        heights: crown.uniforms.uLeafCrownSampleHeights.value.toArray(),
        terrainClearance: crown.uniforms.uLeafTerrainClearance.value.slice(0, lights.length).map(v => v.toArray()) })) };
    group.userData.canopyLighting = result;
    return result;
  };
  const updateMipStats=()=>{group.userData.leafMipCoverage={target:textures.leaves.userData.coverage,levels:textures.leaves.userData.mipCount};};
  if(early){group.userData.readyPromise=early.ready.then(updateMipStats);group.userData.readyPromise.catch(()=>{});}else updateMipStats();
  group.userData.stats = stats;
  group.userData.triangles = stats.reduce((sum, t) => sum + t.triangles, 0);
  group.userData.dispose = disposeBuiltTrees;
  return group;
}
