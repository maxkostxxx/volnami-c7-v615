import {prepareGrassStatic} from './grass-static.js';
import { finishBuild, finishBuildAsync } from './cooperative-build.js';
/**
 * Short, dense, real-geometry meadow grass for the C7 reference scene.
 *
 * Rendering techniques adapted from SimonDev's Quick_Grass: curved blades,
 * rounded shading normals, dark roots, backscatter and patch/distance LOD.
 * Primary source, inspected at commit 6b56164272f213e353a4045d1439d071d5a968cd:
 * https://github.com/simondevyoutube/Quick_Grass
 * This implementation has no dependency on that demo's game framework/assets.
 *
 * MIT License — Copyright (c) 2023 simondevyoutube
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import * as THREE from 'three';
import { SHORT_MEADOW_START, SHORT_MEADOW_END, SHORT_MEADOW_SCALE } from './meadow-profile.js';

const LOD_MORPH_START = 65;
const LOD_MORPH_END = 105;

const grassDeclarations = /* glsl */`
  attribute vec3 aRoot;
  attribute vec3 aTerrainNormal;
  attribute vec4 aShape;
  attribute float aOrder;
  uniform float uTime;
  uniform float uWind;
  uniform float uMinDensity;
  uniform float uViewportY;
  uniform float uDepthStretch;
  uniform float uDepthPivot;
  varying vec3 vGrassWorld;
  varying float vGrassHeight;
  varying float vGrassShade;
  float fieldHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float fieldNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fieldHash(i), fieldHash(i + vec2(1, 0)), f.x),
      mix(fieldHash(i + vec2(0, 1)), fieldHash(i + vec2(1, 1)), f.x), f.y);
  }
`;

const grassDeformation = /* glsl */`
    float t = position.y;
    // Roots/density live in authored terrain coordinates. The group places
    // those roots in the longer physical world without changing the meadow's
    // LOD zones when the lens is narrowed to preserve the composition.
    vec3 authoredCamera = cameraPosition;
    authoredCamera.z = uDepthPivot + (cameraPosition.z - uDepthPivot) / uDepthStretch;
    float distanceToBlade = distance(authoredCamera, aRoot);
    float lodMorph = smoothstep(${LOD_MORPH_START.toFixed(8)}, ${LOD_MORPH_END.toFixed(8)}, distanceToBlade);
    vec3 worldRoot = (modelMatrix * vec4(aRoot, 1.0)).xyz;
    float physicalDistance = distance(cameraPosition, worldRoot);
    float fade = 1.0 - smoothstep(145.0, 205.0, distanceToBlade);
    float density = mix(1.0, uMinDensity, smoothstep(110.0, 190.0, distanceToBlade));
    // Continuous, per-blade density keeps adjacent patches indistinguishable.
    float densityFade = 1.0 - smoothstep(max(0.0, density - 0.08), density, aOrder);
    // Neighbouring blades form small tufts, rather than unrelated pixel noise.
    // At the reference camera this 0.4m variation spans roughly 3–4 pixels.
    float tuft = fieldNoise(aRoot.xz * 2.3);
    float height = 0.8 * aShape.x * mix(0.90, 1.08, tuft) * fade * densityFade;
    // Keep a distant blade around 0.65 drawing-buffer pixels wide, with a
    // bounded world-space correction. MSAA then resolves a thin edge instead
    // of randomly losing a subpixel blade and producing dark stippled dots.
    float resolvedWidth = min(0.09, 1.3 * physicalDistance / (uViewportY * projectionMatrix[1][1]));
    float width = 1.875 * max(aShape.y, resolvedWidth) * sqrt(fade * densityFade);
    vec3 side = vec3(cos(aShape.z), 0.0, sin(aShape.z));
    vec3 bendDirection = vec3(-side.z, 0.0, side.x);
    float gust = fieldNoise(aRoot.xz * 0.075 + vec2(uTime * 0.11, uTime * 0.04));
    float flutter = sin(uTime * 1.45 + aShape.w * 19.0 + aRoot.x * 0.21) * 0.020;
    float bend = 0.16 + aShape.w * 0.20 + uWind * (gust * 0.12 + flutter);
    vec3 lean = bendDirection * bend + normalize(vec3(0.85, 0.0, 0.4))
      * (uWind * gust * 0.09 + tuft * 0.10);
    // The terrain's physical slope is shallower along stretched Z. Build each
    // blade in physical metres, then undo only its offset before modelMatrix.
    vec3 physicalTerrainNormal = normalize(vec3(aTerrainNormal.xy, aTerrainNormal.z / uDepthStretch));
    vec3 up = normalize(mix(vec3(0, 1, 0), physicalTerrainNormal, 0.12));
    // Keep roots and topology fixed; lower the tips20% and curve their upper
    // section. f(0)=0, f(1)=1; f'(t)>0 across the whole blade.
    float curveRise = (t - 0.35 * t * t) / 0.65;
    float curveDerivative = (1.0 - 0.70 * t) / 0.65;
    vec3 stem = up * height * curveRise + lean * 1.35 * height * t * t;
    // Morph the high-detail strip onto the same triangle as the low LOD.
    // Both endpoints and every interpolated shading varying must agree before
    // the CPU may switch topology. Distance is per root, never per patch.
    vec3 straightStem = (up + lean * 1.35) * height * t;
    float taper = mix(pow(max(0.0, 1.0 - t), 0.72), 1.0 - t, lodMorph);
    vec3 physicalOffset = mix(stem, straightStem, lodMorph) + side * position.x * width * taper;
    vec3 grassPosition = aRoot + vec3(physicalOffset.xy, physicalOffset.z / uDepthStretch);
    vec3 bladeNormal = normalize(cross(side, normalize(up * curveDerivative + lean * (2.70 * t))));
    float closeNormalBlend = mix(.14, .025, smoothstep(${SHORT_MEADOW_START.toFixed(8)}, ${SHORT_MEADOW_END.toFixed(8)}, aRoot.z));
    vec3 grassNormal = normalize(mix(physicalTerrainNormal, bladeNormal, closeNormalBlend));
    vec3 rootBladeNormal = normalize(cross(side, up / 0.65));
    vec3 tipBladeNormal = normalize(cross(side, up * (0.30 / 0.65) + lean * 2.70));
    vec3 rootNormal = normalize(mix(physicalTerrainNormal, rootBladeNormal, closeNormalBlend));
    vec3 tipNormal = normalize(mix(physicalTerrainNormal, tipBladeNormal, closeNormalBlend));
    // Leave the linear endpoint interpolation unnormalised here, just as the
    // low triangle's rasterizer does. Fragment shading normalises the result.
    grassNormal = mix(grassNormal, mix(rootNormal, tipNormal, t), lodMorph);
    vGrassWorld = (modelMatrix * vec4(grassPosition, 1.0)).xyz;
    vGrassHeight = t;
    vGrassShade = (0.97 + aShape.w * 0.08) * mix(0.90, 1.10, tuft);
    // Standard's normalMatrix will apply inverse-transpose of the group scale.
    // This local covector recovers the intended physical shading normal.
    vec3 objectNormal = vec3(grassNormal.xy, grassNormal.z * uDepthStretch);
`;

const fragmentDeclarations = /* glsl */`
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uRootColor;
  uniform vec3 uTipColor;
  uniform float uScatter;
  uniform float uCanopyStrength;
  uniform vec3 uCanopyTransmissionColor;
  uniform float uCanopyTransmissionMix;
  uniform float uCanopyWrap;
  uniform float uCanopyWrapStrength;
  uniform float uCanopyTipWeight;
  varying vec3 vGrassWorld;
  varying float vGrassHeight;
  varying float vGrassShade;
`;

// Match materials.js turfThinCanopy and the far-grass coverage BRDF. Three
// calls this hook once per direct source, after applying that source's own
// shadow. An occluded low sun cannot erase visible light from a sky sample.
const thinCanopyDirect = /* glsl */`
  void RE_Direct_C7Grass(const in IncidentLight directLight,
    const in vec3 geometryPosition, const in vec3 geometryNormal,
    const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    vec3 precedingDiffuse = reflectedLight.directDiffuse;
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal,
      geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float strength = clamp(uCanopyStrength, 0.0, 1.0);
    // Reassign the same bounded part of this source's surface diffuse as turf;
    // contributions from earlier lights and the indirect pipeline are untouched.
    reflectedLight.directDiffuse = precedingDiffuse +
      (reflectedLight.directDiffuse - precedingDiffuse) * (1.0 - .12 * strength);
    float NoL = clamp(dot(geometryNormal, directLight.direction), -1.0, 1.0);
    float wrap = clamp(uCanopyWrap, 0.0, 1.0);
    float wrapped = clamp((NoL + wrap) / (1.0 + wrap), 0.0, 1.0);
    float wrapExtra = max(0.0, wrapped - max(0.0, NoL));
    float forward = pow(max(0.0, dot(geometryViewDir, -directLight.direction)), 3.0);
    float grazingLight = pow(max(0.0, 1.0 - abs(NoL)), 1.5);
    float grazingView = pow(max(0.0, 1.0 - abs(dot(geometryNormal, geometryViewDir))), 2.0);
    float transmission = forward * grazingLight * mix(.35, 1.0, grazingView);
    float thinFibre = mix(.72, 1.0, smoothstep(.65, 1.3, vGrassShade));
    vec3 transmissionColor = mix(material.diffuseColor, uTipColor * vGrassShade,
      clamp(uCanopyTipWeight, 0.0, 1.0));
    // Thin-leaf transmission is independent of the reflected root/tip pigment.
    // Still multiplied by this source\'s visibility, direction and incident energy.
    transmissionColor = mix(transmissionColor, uCanopyTransmissionColor, clamp(uCanopyTransmissionMix, 0.0, 1.0));
    vec3 canopy = clamp(uCanopyWrapStrength, 0.0, 1.0) * wrapExtra * material.diffuseColor
      + clamp(uScatter, 0.0, .5) * transmission * thinFibre * transmissionColor;
    reflectedLight.directDiffuse += directLight.color * canopy * (1.0 / 3.14159265359) * strength;
  }
  #undef RE_Direct
  #define RE_Direct RE_Direct_C7Grass
`;

function createGrassMaterial(uniforms) {
  // Ground and blades must use the same PBR light/IBL/shadow pipeline. A
  // separately lit grass shader made every root a contrasting dark fleck.
  const material = new THREE.MeshPhysicalMaterial({
    name: 'C7 meadow PBR blades', color: 0xffffff, roughness: 0.98, specularIntensity: 0.35,
    metalness: 0, side: THREE.DoubleSide, transparent: false,
    depthWrite: true, toneMapped: true, dithering: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    let declarations=grassDeclarations,deformation=grassDeformation;
    if(material.userData.staticPrepared){
      declarations=declarations.replace('attribute vec3 aTerrainNormal;','attribute vec4 aTerrainNormal;').replace('attribute float aOrder;','attribute vec2 aOrder;');
      deformation=deformation.replace('density, aOrder);','density, aOrder.x);')
        .replace('fieldNoise(aRoot.xz * 2.3)','aTerrainNormal.w')
        .replace('vec3(cos(aShape.z), 0.0, sin(aShape.z))','vec3(aShape.z, 0.0, aOrder.y)')
        .replace('normalize(vec3(aTerrainNormal.xy, aTerrainNormal.z / uDepthStretch))','aTerrainNormal.xyz');
    }
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', deformation);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = grassPosition;');
    // The physical canopy normals already have unit endpoints. Preserve their
    // linear interpolation when the detailed strip becomes the low triangle.
    shader.vertexShader = shader.vertexShader.replace('#include <normal_vertex>',
      THREE.ShaderChunk.normal_vertex.replace('vNormal = normalize( transformedNormal );', 'vNormal = transformedNormal;'));
    shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
    // The shading normal represents the upward-facing *canopy*, not the
    // random front/back orientation of a very thin strip. Standard's default
    // DoubleSide normal flip would turn half of this canopy upside down.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', 'normal *= 1.0;'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      '#include <lights_physical_pars_fragment>\n' + thinCanopyDirect);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // MSAA can extrapolate the varying outside a subpixel triangle. Keep
      // fractional powers defined even when the evaluated height is negative.
      diffuseColor.rgb *= mix(uRootColor, uTipColor, pow(clamp(vGrassHeight, 0.0, 1.0), 1.55)) * vGrassShade;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      reflectedLight.indirectDiffuse *= mix(0.82, 1.0, smoothstep(0.0, 0.8, vGrassHeight));`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => material.userData.staticPrepared?'c7-meadow-pbr-16-prepared-stem-normal':'c7-meadow-pbr-13-continuous-lod';
  return material;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bladeTopology(segments) {
  const p = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    p.push(-0.5, i / segments, 0, 0.5, i / segments, 0);
    if (i < segments) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2);
      // At t=1 both tip vertices have width*pow(1-t,.72)=0. The
      // second triangle of the last quad is exactly zero-area at any
      // wind, LOD and root position, so do not submit it to the GPU.
      if (i < segments - 1) indices.push(v + 2, v + 1, v + 3);
    }
  }
  // Three r186 automatically enables FLAT_SHADED when geometry.normal is
  // absent, bypassing the canopy normals generated by our vertex hook. The
  // placeholder keeps smooth normal interpolation active; the hook replaces it.
  const normals = new Float32Array(p.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  return {
    position: new THREE.Float32BufferAttribute(p, 3),
    normal: new THREE.BufferAttribute(normals, 3),
    index: new THREE.Uint16BufferAttribute(indices, 1),
  };
}

/**
 * Reference-scene scale is metres. sunDirection points from ground to sun.
 * The supplied time uniform and sun objects are retained by reference.
 * Call group.userData.update(camera) after moving the camera.
 * Colors/intensities remain accessible in group.userData.uniforms for matching
 * the terrain's light rig; they are linear THREE.Color values.
 * depthStretch/depthPivot describe the group's external Z placement:
 * group.scale.z = depthStretch; group.position.z = depthPivot * (1-depthStretch).
 * Root coordinates stay authored; individual blades retain physical size.
 */
function* buildGrass({ heightAt, rootHeightAt = heightAt, shoreDistance, sunDirection, sunColor, time, quality = 'normal', depthStretch = 1, depthPivot = 85, preparedPacket }) {
  if (typeof heightAt !== 'function' || typeof shoreDistance !== 'function') {
    throw new TypeError('createGrass requires heightAt(x,z) and shoreDistance(x,z).');
  }
  if (!Number.isFinite(depthStretch) || depthStretch <= 0 || !Number.isFinite(depthPivot)) {
    throw new RangeError('createGrass requires positive depthStretch and finite depthPivot.');
  }
  const low = quality === 'low' || quality === 'mobile';
  const density = quality === 'mobile' ? 9 : low ? 28 : 48; // Dense foreground; the shoreline and broad meadow mask remove hidden ground.
  const group = new THREE.Group();
  group.name = 'C7 dense short meadow';
  const uniforms = {
    uTime: time ?? { value: 0 },
    uMinDensity: { value: low ? 0.35 : 0.5 },
    uViewportY: { value: 720 },
    uDepthStretch: { value: depthStretch },
    uDepthPivot: { value: depthPivot },
    uWind: { value: 0.40 },
    uSunDirection: { value: sunDirection ?? new THREE.Vector3(-0.7, 0.15, -0.7).normalize() },
    uSunColor: { value: sunColor ?? new THREE.Color('#ffdfad') },
    uSunIntensity: { value: 1 },
    uRootColor: { value: new THREE.Color('#3b6229') },
    uTipColor: { value: new THREE.Color('#5c7d37') },
    uScatter: { value: .3 },
    uCanopyStrength: { value: 1 },
    uCanopyTransmissionColor: { value: new THREE.Color().setRGB(.4735315,.5711248,.3231432) },
    uCanopyTransmissionMix: { value: 0 },
    uCanopyWrap: { value: .38 },
    uCanopyWrapStrength: { value: .6 },
    uCanopyTipWeight: { value: .55 },
  };
  const material = createGrassMaterial(uniforms);
  let completed = false;
  const allocatedGeometries = [];
  try {
  const topology = [bladeTopology(2), bladeTopology(1)];
  const patches = [];
  let total = 0;
  // Every coarse-grid normal is immutable. Adjacent 20m patches share grid
  // edges; sparse shore patches need only the nodes reached by accepted roots.
  // Store the same Float32 result once per build, preserving RNG and interpolation.
  const normal = new THREE.Vector3(), normalCache=new Float32Array(201*171*3),normalReady=new Uint8Array(201*171);
  const rng = random(0xC7397);

  // 20m patches retain useful frustum culling without hundreds of draw calls.
  const coverage = (x, z) => {
    const radius = Math.hypot(x / 190, (z - 25) / 145)
      + 0.035 * Math.sin(x * 0.037) + 0.025 * Math.sin(z * 0.061);
    return 1 - THREE.MathUtils.smoothstep(radius, 0.72, 1.06);
  };
  const viewport = new THREE.Vector4();
  if(preparedPacket){
   for(const source of preparedPacket.records){
    yield;
    const count=source.count,order=source.order,bounds=new THREE.Box3(new THREE.Vector3().fromArray(source.bounds),new THREE.Vector3().fromArray(source.bounds,3));
    const sphere=new THREE.Sphere(new THREE.Vector3().fromArray(source.sphere),source.sphere[3]),boundingSphere=new THREE.Sphere(new THREE.Vector3().fromArray(source.boundingSphere),source.boundingSphere[3]);
    const attributes={aRoot:new THREE.InstancedBufferAttribute(source.root,3),aTerrainNormal:new THREE.InstancedBufferAttribute(source.normal,3),aShape:new THREE.InstancedBufferAttribute(source.shape,4),aOrder:new THREE.InstancedBufferAttribute(order,1)};
    const patch={count,order,density:1,sphere,bounds,meshes:[],geometries:[]};total+=count;
    for(let level=0;level<2;level++){
     const geometry=new THREE.InstancedBufferGeometry();allocatedGeometries.push(geometry);patch.geometries.push(geometry);
     geometry.setAttribute('position',topology[level].position);geometry.setAttribute('normal',topology[level].normal);geometry.setIndex(topology[level].index);for(const[name,a]of Object.entries(attributes))geometry.setAttribute(name,a);
     geometry.instanceCount=count;geometry.boundingBox=bounds.clone();geometry.boundingSphere=boundingSphere.clone();if(level!==0)continue;
     const mesh=new THREE.Mesh(geometry,material);mesh.name=source.name;mesh.castShadow=false;mesh.receiveShadow=true;mesh.visible=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();mesh.onBeforeRender=renderer=>{renderer.getCurrentViewport(viewport);uniforms.uViewportY.value=Math.max(1,viewport.w);};group.add(mesh);patch.meshes.push(mesh);
    }
    patches.push(patch);
   }
  }else{
  for (let x0 = -200; x0 < 200; x0 += 20) {
    for (let z0 = -140; z0 < 200; z0 += 20) {
      yield;
      if (coverage(x0 + 10, z0 + 10) < 0.001 &&
        coverage(x0, z0) < 0.001 && coverage(x0 + 20, z0 + 20) < 0.001) continue;
      const roots = [], normals = [], shapes = [];
      const count = 400 * density;
      let ymin = Infinity, ymax = -Infinity;
      // A coarse normal grid avoids four extra height evaluations per blade.
      // Roots use the rendered triangles; smooth authored derivatives still
      // supply normals, independently of tessellation and root placement.
      const normalIndex = (gx, gz) => {
        const k = ((x0 + 200) / 2 + gx) * 171 + (z0 + 140) / 2 + gz;
        if (!normalReady[k]) {
          const x = x0 + gx * 2, z = z0 + gz * 2, e = .2;
          normal.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e,
            heightAt(x, z - e) - heightAt(x, z + e)).normalize();
          normal.toArray(normalCache, k * 3);
          normalReady[k] = 1;
        }
        return k * 3;
      };
      let tuftX = 0, tuftZ = 0, tuftHeight = 0, tuftAngle = 0, tuftShade = 0;
      for (let i = 0; i < count; i++) {
        // Three nearby shoots form a finer coherent tuft, with overlapping
        // tufts filling the meadow. Independent uniformly spaced blades read
        // as noise even when their projected height is correct.
        if (i % 3 === 0) {
          tuftX = x0 + rng() * 20; tuftZ = z0 + rng() * 20;
          tuftHeight = rng(); tuftAngle = rng() * Math.PI * 2; tuftShade = rng();
        }
        const x = tuftX + (rng() + rng() - 1) * 0.07;
        const z = tuftZ + (rng() + rng() - 1) * 0.07;
        const cover = coverage(x, z);
        const detail = 0.35 + 0.65 * Math.exp(-((x / 145) ** 2 + ((z - 15) / 110) ** 2));
        if (rng() > cover * detail) continue;
        const shore = shoreDistance(x, z);
        if (shore < 0.06) continue;
        const y = rootHeightAt(x, z);
        // Preserve the authored waterline rejection/RNG near its threshold.
        // The0.1m guard retains analytical rejection near the threshold;
        // full root/shape comparisons verify this authored distribution.
        if (!Number.isFinite(y) || (y < .835 && heightAt(x, z) < .735)) continue;
        const edge = THREE.MathUtils.smoothstep(shore, 0.06, 1.25);
        const heightSeed = tuftHeight * 0.75 + rng() * 0.25;
        // At 1280×720, the visible near bank is 90–120m from the camera:
        // 0.225m projected to only 1.9–2.5px. A ~0.5m blade projects to
        // 4.3–5.5px, matching the distinct tufts in the client's foreground.
        // This is a world-space meadow zone, not camera-dependent scaling.
        const nearMeadow = THREE.MathUtils.smoothstep(z, -65, -12);
        const bladeHeight = THREE.MathUtils.lerp(0.15 + heightSeed * 0.15,
          0.37 + heightSeed * 0.26, nearMeadow);
        // Shorter meadow on the newly revealed close hills. This is a fixed
        // world zone; moving the camera never changes the actual blade size.
        const shortMeadow = THREE.MathUtils.lerp(1, SHORT_MEADOW_SCALE, THREE.MathUtils.smoothstep(z, SHORT_MEADOW_START, SHORT_MEADOW_END));
        const h = shortMeadow * bladeHeight * (0.3 + 0.7 * edge) * (0.35 + 0.65 * cover);
        const w = (0.025 + rng() * 0.02) * Math.sqrt(shortMeadow);
        const angle = tuftAngle + (rng() - 0.5) * 1.4;
        const shade = tuftShade * 0.8 + rng() * 0.2;
        // Retain two shoots in every tuft after consuming the original
        // RNG stream. A1.5× strip width preserves nominal leaf area.
        ymin = Math.min(ymin, y - 0.03); ymax = Math.max(ymax, y + h + 0.12);
        if(i % 3 === 2)continue;
        roots.push(x, y - 0.012, z);
        shapes.push(h, w, angle, shade);
        const fx = THREE.MathUtils.clamp((x - x0) / 2, 0, 10);
        const fz = THREE.MathUtils.clamp((z - z0) / 2, 0, 10);
        const ix = Math.min(9, Math.floor(fx)), iz = Math.min(9, Math.floor(fz));
        const tx = fx - ix, tz = fz - iz;
        const na=normalIndex(ix,iz),nb=normalIndex(ix+1,iz),nc=normalIndex(ix,iz+1),nd=normalIndex(ix+1,iz+1);
        for (let component = 0; component < 3; component++) {
          const a = normalCache[na+component];
          const b = normalCache[nb+component];
          const c = normalCache[nc+component];
          const d = normalCache[nd+component];
          normals.push(THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz));
        }
        ymin = Math.min(ymin, y - 0.03); ymax = Math.max(ymax, y + h + 0.12);
      }
      const n = roots.length / 3;
      if (!n) continue;
      total += n;
      // Keep each original Float32 attribute and original density rank.
      // Partition spatially only to tighten conservative camera culling.
      const bins = Array.from({length:16},()=>[]);
      for (let i = 0; i < n; i++) bins[Math.max(0,Math.min(3,Math.floor((roots[i*3]-x0)/5))) + 4*Math.max(0,Math.min(3,Math.floor((roots[i*3+2]-z0)/5)))].push(i);
      for (let bin = 0; bin < bins.length; bin++) {
      const indices = bins[bin], count = indices.length;
      if (!count) continue;
      const patchX = x0 + (bin % 4) * 5, patchZ = z0 + Math.floor(bin/4) * 5;
      const order = new Float32Array(count), rootData = new Float32Array(count*3), normalData = new Float32Array(count*3), shapeData = new Float32Array(count*4);
      for (let j=0; j<count; j++) {
        const i=indices[j]; order[j]=i/n;
        for(let c=0;c<3;c++){rootData[j*3+c]=roots[i*3+c];normalData[j*3+c]=normals[i*3+c];}
        for(let c=0;c<4;c++)shapeData[j*4+c]=shapes[i*4+c];
      }
      const attributes = {
        aRoot: new THREE.InstancedBufferAttribute(rootData, 3),
        aTerrainNormal: new THREE.InstancedBufferAttribute(normalData, 3),
        aShape: new THREE.InstancedBufferAttribute(shapeData, 4),
        aOrder: new THREE.InstancedBufferAttribute(order, 1),
      };
      // Include root jitter and physical blade lean. Z offsets are inversely
      // scaled in the shader, including for a supported depthStretch < 1.
      const zPadding = 0.14 + 0.66 / depthStretch;
      const bounds = new THREE.Box3(new THREE.Vector3(patchX - 0.8, ymin, patchZ - zPadding),
        new THREE.Vector3(patchX + 5.8, ymax, patchZ + 5 + zPadding));
      const boundsSphere = bounds.getBoundingSphere(new THREE.Sphere());
      // LOD uses a fixed authored envelope, independent of the compensated
      // render bounds; changing only the stretch must not change blade counts.
      const authoredBounds = bounds.clone();
      authoredBounds.min.x=patchX-.7;authoredBounds.max.x=patchX+5.7;
      authoredBounds.min.z = patchZ - 0.7; authoredBounds.max.z = patchZ + 5.7;
      const sphere = authoredBounds.getBoundingSphere(new THREE.Sphere());
      const patch = { count, order, density: 1, sphere, bounds, meshes: [], geometries: [] };
      for (let level = 0; level < 2; level++) {
        const geometry = new THREE.InstancedBufferGeometry();
        allocatedGeometries.push(geometry);patch.geometries.push(geometry);
        geometry.setAttribute('position', topology[level].position);
        geometry.setAttribute('normal', topology[level].normal);
        geometry.setIndex(topology[level].index);
        for (const [key, value] of Object.entries(attributes)) geometry.setAttribute(key, value);
        geometry.instanceCount = count;
        geometry.boundingBox = bounds.clone();
        geometry.boundingSphere = boundsSphere.clone();
        if (level !== 0) continue;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `Grass ${patchX},${patchZ} LOD${level}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.visible = level === 0;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.onBeforeRender = renderer => {
          renderer.getCurrentViewport(viewport);
          uniforms.uViewportY.value = Math.max(1, viewport.w);
        };
        group.add(mesh); patch.meshes.push(mesh);
      }
      patches.push(patch);
      }
    }
  }
  }
  const frustum = new THREE.Frustum(), projectionView = new THREE.Matrix4();
  const worldCamera = new THREE.Vector3(), authoredCamera = new THREE.Vector3();
  let staticPreparationAbort=null,staticPreparationDisposed=false;
  group.userData.prepareStatic = async(renderer,options={})=>{
    if(group.userData.staticPreparation||group.userData.preparingStatic)throw Error('Grass static fields already prepared or preparing');
    if(staticPreparationDisposed)throw Error('Grass already disposed');
    group.userData.preparingStatic=true;
    const controller=new AbortController(),abort=()=>controller.abort(options.signal.reason);
    staticPreparationAbort=controller;
    if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
    try{
      controller.signal.throwIfAborted();
      
      group.userData.staticPreparation=await prepareGrassStatic(renderer,patches,depthStretch,{...options,signal:controller.signal});
      material.userData.staticPrepared=true;material.needsUpdate=true;
    }finally{options.signal?.removeEventListener('abort',abort);staticPreparationAbort=null;group.userData.preparingStatic=false;}
  };
  group.userData.uniforms = uniforms;
  group.userData.preparationPacket = () => ({records:patches.map(p=>{
    const g=p.geometries[0];return {count:p.count,order:p.order,root:g.attributes.aRoot.array,
      normal:g.attributes.aTerrainNormal.array,shape:g.attributes.aShape.array,
      bounds:p.bounds.min.toArray().concat(p.bounds.max.toArray()),
      sphere:p.sphere.center.toArray().concat(p.sphere.radius),
      boundingSphere:g.boundingSphere.center.toArray().concat(g.boundingSphere.radius),name:p.meshes[0].name};
  })});
  group.userData.totalBlades = total;
  group.userData.stats = { totalBlades: total, patches: patches.length, activeBlades: total,
    activePatches: patches.length, quality: low ? 'low' : 'normal' };
  group.userData.update = (camera) => {
    camera.updateWorldMatrix(true, false);
    group.updateWorldMatrix(true, false);
    camera.getWorldPosition(worldCamera);
    authoredCamera.copy(worldCamera);
    authoredCamera.z = depthPivot + (worldCamera.z - depthPivot) / depthStretch;
    // Transform the camera planes into grass-local space once. Testing the
    // unchanged local boxes avoids projecting eight corners per patch/pass.
    projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
    frustum.setFromProjectionMatrix(projectionView);
    let activeBlades = 0, activePatches = 0;
    for (const patch of patches) {
      const distance = authoredCamera.distanceTo(patch.sphere.center);
      const visible = distance - patch.sphere.radius < 205 && frustum.intersectsBox(patch.bounds);
      // Invisible grass does not cast shadows. Recompute its LOD/count when
      // it next enters either camera; avoid per-patch density searches now.
      const mesh = patch.meshes[0];
      mesh.visible = visible;
      if (!visible) continue;
      // Every root lies inside this sphere. Switch only once the whole
      // patch has completed the per-root morph; boundaries then share shape.
      const level = quality === 'mobile' || distance - patch.sphere.radius >= LOD_MORPH_END ? 1 : 0;
      patch.density = THREE.MathUtils.lerp(1, low ? 0.35 : 0.5,
        THREE.MathUtils.smoothstep(Math.max(0, distance - patch.sphere.radius), 110, 190));
      // Original ranks remain sorted inside each bin. Retain every root
      // whose shader density fade might be nonzero; do not renormalise rank.
      let first=0,last=patch.count;
      while(first<last){const mid=(first+last)>>>1;if(patch.order[mid] <= patch.density)first=mid+1;else last=mid;}
      const count=first;
      mesh.geometry = patch.geometries[level];
      mesh.geometry.instanceCount = count;
      activeBlades += count; activePatches++;
    }
    group.userData.activeBlades = activeBlades;
    group.userData.activePatches = activePatches;
    group.userData.stats.activeBlades = activeBlades;
    group.userData.stats.activePatches = activePatches;
  };
  group.userData.dispose = () => {
    staticPreparationDisposed=true;
    staticPreparationAbort?.abort(new DOMException('Grass disposed during static preparation','AbortError'));
    for (const geometry of allocatedGeometries) geometry.dispose();
    material.dispose();
    group.clear();
  };
  completed = true;
  return group;
  } finally {
    if (!completed) {
      for (const geometry of allocatedGeometries) geometry.dispose();
      material.dispose();
      group.clear();
    }
  }
}

export function createGrass(options) { return finishBuild(buildGrass(options)); }
export function createGrassAsync(options, scheduling) { return finishBuildAsync(buildGrass(options), scheduling); }
