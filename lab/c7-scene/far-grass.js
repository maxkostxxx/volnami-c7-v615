import { finishBuild, finishBuildAsync } from './cooperative-build.js';
/**
 * Reference-camera hill grass: real instanced strips, two triangles per blade.
 * No sprites, copied landscape image, alpha hash, external assets or framework.
 * The static placement concentrates the budget around visible convex crests;
 * the normal terrain material remains the continuous cover underneath.
 */
import * as THREE from 'three';

const BUDGET = 220000;
const STEP = 2.5;
const FILL_BUDGET = 80000;
const BOUNDS = { minX: -330, maxX: 330, minZ: -405, maxZ: -125 };
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Exact near-grass authored-space meadow envelope. This is an allocation and
// complementary geometry blend, never a screen-space colour mask. Source:
// grass.js coverage() and vertex height fade145..205; keep formulas in sync.
export function nearMeadowCoverage(x, z) {
  const radius = Math.hypot(x / 190, (z - 25) / 145)
    + .035 * Math.sin(x * .037) + .025 * Math.sin(z * .061);
  return 1 - smooth(.72, 1.06, radius);
}
export function nearMeadowSupport(x, y, z, camera) {
  return nearMeadowCoverage(x, z) * (1 - smooth(145, 205,
    Math.hypot(camera.x - x, camera.y - y, camera.z - z)));
}

function coverageEnvelope(reference, depthStretch, depthPivot) {
  const forward = reference.getWorldDirection(new THREE.Vector3());
  // C7's reference look-at plane is authored z=depthPivot-133. Only placement
  // uses this finite supported camera envelope; accepted roots never move.
  const target = reference.position.clone().addScaledVector(forward,
    ((depthPivot - 133) - reference.position.z) / forward.z);
  target.z = depthPivot + (target.z - depthPivot) * depthStretch;
  const physical = reference.clone();
  physical.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(reference.fov) / 2) / depthStretch));
  physical.position.z = depthPivot + (reference.position.z - depthPivot) * depthStretch;
  const offset = physical.position.clone().sub(target);
  return [-12, 0, 12].map(degrees => {
    const camera = physical.clone();camera.position.copy(target).add(offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees)));
    camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const authored = camera.position.clone();authored.z = depthPivot + (authored.z - depthPivot) / depthStretch;
    return { camera, authored, degrees };
  });
}

const vertexDeclarations = /* glsl */`
  attribute vec3 aRoot;
  attribute vec3 aTerrainNormal;
  attribute vec4 aShape;
  attribute float aCoverageRole;
  uniform float uTime;
  uniform float uWind;
  uniform float uDepthStretch;
  uniform float uDepthPivot;
  uniform float uViewportY;
  uniform float uMinPixelWidth;
  varying float vFarGrassHeight;
  varying float vFarGrassShade;
  varying vec3 vFarGrassRootWorld;
`;
const deformation = /* glsl */`
  float t = position.y;
  vec3 authoredCamera = cameraPosition;
  authoredCamera.z = uDepthPivot + (cameraPosition.z - uDepthPivot) / uDepthStretch;
  float meadowRadius = length(vec2(aRoot.x / 190.0, (aRoot.z - 25.0) / 145.0))
    + .035 * sin(aRoot.x * .037) + .025 * sin(aRoot.z * .061);
  float nearCover = 1.0 - smoothstep(.72, 1.06, meadowRadius);
  float nearFade = 1.0 - smoothstep(145.0, 205.0, distance(authoredCamera, aRoot));
  float coverageSupport = mix(1.0, 1.0 - clamp(nearCover * nearFade, 0.0, 1.0), aCoverageRole);
  vec3 worldRoot = (modelMatrix * vec4(aRoot, 1.0)).xyz;
  float eyeDistance = max(1.0, -(viewMatrix * vec4(worldRoot, 1.0)).z);
  // An opaque subpixel strip needs a small bounded LOD width correction.
  // Its geometry supplies coverage to the ordinary MSAA resolve; no fragment
  // alpha/random rejection turns these distant fibres into stippled pixels.
  float pixelWidth = 2.0 * uMinPixelWidth * eyeDistance
    / max(1.0, uViewportY * projectionMatrix[1][1]);
  float width = max(aShape.y, min(0.16, pixelWidth)) * sqrt(coverageSupport);
  vec3 side = vec3(cos(aShape.z), 0.0, sin(aShape.z));
  vec3 bendDirection = vec3(-side.z, 0.0, side.x);
  vec3 groundNormal = normalize(vec3(aTerrainNormal.xy, aTerrainNormal.z / uDepthStretch));
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), groundNormal, 0.10));
  float gust = sin(aRoot.x * 0.17 + aRoot.z * 0.11 - uTime * 0.70)
    * 0.5 + sin(aRoot.x * 0.037 - aRoot.z * 0.05 + uTime * 0.31) * 0.5;
  vec3 lean = bendDirection * (0.17 + 0.15 * aShape.w)
    + vec3(0.85, 0.0, 0.4) * (uWind * gust * 0.06);
  vec3 offset = (up * t + lean * t * t) * (aShape.x * coverageSupport)
    + side * position.x * width * pow(max(0.0, 1.0 - t), 0.70);
  vec3 farGrassPosition = aRoot + vec3(offset.xy, offset.z / uDepthStretch);
  // A grazing view sees a canopy of many thin leaves. Its lighting normal
  // follows the slope, rather than flipping half the leaves into black dots.
  vec3 stripNormal = normalize(cross(side, normalize(up + 2.0 * t * lean)));
  vec3 canopyNormal = normalize(mix(groundNormal, stripNormal, 0.025));
  vec3 objectNormal = vec3(canopyNormal.xy, canopyNormal.z * uDepthStretch);
  vFarGrassHeight = t;
  vFarGrassShade = 0.98 + 0.04 * aShape.w;
  vFarGrassRootWorld = worldRoot;
`;

// The same thin-canopy BRDF as materials.js, evaluated by Three once per
// IncidentLight AFTER that source's shadow. Multiplying a combined shadow mask
// would incorrectly let the blocked horizon sun extinguish the sky sector.
// Vegetation transport reference: GPU Gems 3, chapter 16, Crysis vegetation.
// https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
const canopyDirect = /* glsl */`
  uniform float uCanopyStrength;
  uniform vec3 uCanopyTransmissionColor;
  uniform float uCanopyTransmissionMix;
  uniform float uWrap;
  uniform float uWrapStrength;
  uniform float uScatterStrength;
  uniform float uTipWeight;
  void RE_Direct_C7FarGrass(const in IncidentLight directLight,
    const in vec3 geometryPosition, const in vec3 geometryNormal,
    const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
    vec3 previousDiffuse = reflectedLight.directDiffuse;
    RE_Direct_Physical(directLight, geometryPosition, geometryNormal,
      geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    float NoL = clamp(dot(geometryNormal, directLight.direction), -1.0, 1.0);
    float wrapped = clamp((NoL + uWrap) / max(0.001, 1.0 + uWrap), 0.0, 1.0);
    float wrapExtra = max(0.0, wrapped - max(0.0, NoL));
    float forward = pow(max(0.0, dot(geometryViewDir, -directLight.direction)), 3.0);
    float grazingLight = pow(max(0.0, 1.0 - abs(NoL)), 1.5);
    float grazingView = pow(max(0.0, 1.0 - abs(dot(geometryNormal, geometryViewDir))), 2.0);
    float transmission = forward * grazingLight * mix(0.35, 1.0, grazingView);
    float thinFibre = mix(0.72, 1.0, smoothstep(0.65, 1.3, vFarGrassShade));
    vec3 transmissionColor = mix(material.diffuseColor, uTipColor * vFarGrassShade, uTipWeight);
    // Thin-leaf transmission is independent of the reflected root/tip pigment.
    // Still multiplied by this source\'s visibility, direction and incident energy.
    transmissionColor = mix(transmissionColor, uCanopyTransmissionColor, clamp(uCanopyTransmissionMix, 0.0, 1.0));
    vec3 canopy = directLight.color * (
      uWrapStrength * wrapExtra * material.diffuseColor
      + uScatterStrength * transmission * thinFibre * transmissionColor) * RECIPROCAL_PI;
    // Reassign the same small diffuse fraction as the ground's canopy model;
    // only the contribution of THIS source is scaled, never earlier lights.
    reflectedLight.directDiffuse = previousDiffuse
      + (reflectedLight.directDiffuse - previousDiffuse) * (1.0 - 0.12 * clamp(uCanopyStrength, 0.0, 1.0))
      + canopy * uCanopyStrength;
  }
  #undef RE_Direct
  #define RE_Direct RE_Direct_C7FarGrass
`;

// Match the ground's slow scalar colour field in physical world coordinates.
// Far blades describe the same meadow volume; large root/tip albedo contrast
// or an independent AO multiplier would reintroduce dots even with equal light.
const turfField = /* glsl */`
  float farTurfHash(vec2 p) { p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y); }
  float farTurfNoise(vec2 p) { vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(farTurfHash(i),farTurfHash(i+vec2(1,0)),f.x),mix(farTurfHash(i+vec2(0,1)),farTurfHash(i+1.),f.x),f.y); }
  float farTurfField(vec2 p) { return farTurfNoise(p)*.57+farTurfNoise(p*2.07+18.)*.28+farTurfNoise(p*4.13-6.)*.15; }
`;

function materialFor(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    name: 'C7 distant hill grass PBR', color: 0xffffff, roughness: 0.98, specularIntensity: 0.35,
    metalness: 0, side: THREE.DoubleSide, transparent: false, alphaToCoverage: false,
    depthWrite: true, toneMapped: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexDeclarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', deformation);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = farGrassPosition;');
    shader.fragmentShader = /* glsl */`
      uniform vec3 uRootColor;
      uniform vec3 uTipColor;
      uniform float uTipAlbedoStrength;
      varying float vFarGrassHeight;
      varying float vFarGrassShade;
      varying vec3 vFarGrassRootWorld;
    ` + turfField + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', 'normal *= 1.0;'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      float farTurfPatch = farTurfField(vFarGrassRootWorld.xz * 0.065);
      // MSAA may extrapolate height below zero outside a subpixel triangle.
      // Fractional pow of that value is undefined and produced dark flecks.
      diffuseColor.rgb *= mix(uRootColor, uTipColor, pow(clamp(vFarGrassHeight, 0.0, 1.0), 1.45) * uTipAlbedoStrength)
        * vFarGrassShade * mix(0.98, 1.02, farTurfPatch);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      '#include <lights_physical_pars_fragment>\n' + canopyDirect);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'c7-far-grass-world-coverage-pbr-4-transmission';
  return material;
}

/**
 * Returns an unscaled Group in terrain's authored coordinates. The caller sets
 * scale.z=depthStretch, position.z=depthPivot*(1-depthStretch), just as terrain.
 * Every blade offset and normal is compensated to retain physical proportions.
 * Optional referenceCamera is cloned in authored coordinates for placement;
 * omitting it preserves the original reference camera and allocation.
 *
 * userData.uniforms exposes uRootColor/uTipColor/uTime/uWind/uMinPixelWidth.
 * Colors default to the near meadow palette and can share its Color instances.
 * userData.stats reports exact budget, geometry, draw calls and build duration.
 * userData.dispose() releases all owned geometries/material and clears the group.
 * The group does not own the supplied height functions, time or shared Colors.
 */
function* buildFarGrass({ heightAt, rootHeightAt = heightAt, rootNormalAt, shoreDistance, time, depthStretch = 1, depthPivot = 85, referenceCamera, placement, densityScale=1 }) {
  if (typeof heightAt !== 'function' || typeof shoreDistance !== 'function') {
    throw new TypeError('createFarGrass requires heightAt(x,z) and shoreDistance(x,z).');
  }
  if (!Number.isFinite(depthStretch) || depthStretch <= 0 || !Number.isFinite(depthPivot)) {
    throw new RangeError('createFarGrass requires positive depthStretch and finite depthPivot.');
  }
  if (referenceCamera !== undefined && !referenceCamera?.isCamera) {
    throw new TypeError('createFarGrass referenceCamera must be a Three.js camera.');
  }
  const started = performance.now(), rng = random(0xC7FA481);
  const group = new THREE.Group();
  group.name = 'C7 distant crest grass';
  const uniforms = {
    uTime: time ?? { value: 0 }, uWind: { value: 0.28 },
    uDepthStretch: { value: depthStretch }, uDepthPivot: { value: depthPivot }, uViewportY: { value: 720 },
    uMinPixelWidth: { value: 0.55 },
    uRootColor: { value: new THREE.Color('#436d41') },
    uTipColor: { value: new THREE.Color('#6e8f53') },
    uTipAlbedoStrength: { value: 0.18 },
    uCanopyStrength: { value: 1 },
    uCanopyTransmissionColor: { value: new THREE.Color().setRGB(.4735315,.5711248,.3231432) },
    uCanopyTransmissionMix: { value: 0 }, uWrap: { value: 0.38 },
    uWrapStrength: { value: 0.6 }, uScatterStrength: { value: 0.3 },
    uTipWeight: { value: 0.55 },
  };
  const material = materialFor(uniforms);
  let completed = false;
  try {
  const normal = new THREE.Vector3(), projected = new THREE.Vector3();
  const {cells,totalWeight,fillCells,fillWeight}=placement??(yield* buildFarGrassPlacement({heightAt,shoreDistance,depthStretch,depthPivot,referenceCamera}));

  // Wide patches keep this layer to a few dozen draw calls. Their boundaries
  // do not affect density: counts come from the continuous per-cell weights.
  const patches = new Map();
  let cumulative = 0, allocated = 0, minHeight = Infinity, maxHeight = 0;
  for (const cell of cells) {
    yield;
    cumulative += cell.weight;
    const next = Math.round(BUDGET * densityScale * cumulative / Math.max(totalWeight, 1e-9));
    const count = next - allocated; allocated = next;
    const key = `${Math.floor((cell.x - BOUNDS.minX) / 80)}:${Math.floor((cell.z - BOUNDS.minZ) / 55)}`;
    if (!patches.has(key)) patches.set(key, { roots: [], normals: [], shapes: [], box: new THREE.Box3() });
    const patch = patches.get(key);
    let tx = 0, tz = 0, th = 0, ta = 0, shade = 0;
    for (let i = 0; i < count; i++) {
      // Three connected shoots make a tuft, while each tuft has a different
      // orientation; random per-blade dark/light colours are deliberately absent.
      if (i % 3 === 0) {
        tx = cell.x + rng() * STEP; tz = cell.z + rng() * STEP;
        th = rng(); ta = rng() * Math.PI * 2; shade = rng();
      }
      const x = tx + (rng() - 0.5) * 0.11;
      const z = tz + (rng() - 0.5) * 0.11 / depthStretch;
      const y = rootHeightAt(x, z);
      if (!Number.isFinite(y) || shoreDistance(x, z) < 0.4 || (y < 1.3 && heightAt(x, z) < 1.2)) continue;
      // Shorter distant blades keep the crest texture below a woolly rim.
      // The RNG sequence and all root/width/orientation samples stay unchanged.
      const h = 0.15 + 0.10 * (th * 0.8 + rng() * 0.2);
      patch.roots.push(x, y - 0.008, z);
      // Continuous normals avoid a visible 2.5m lighting grid on smooth hills.
      const ne = 0.35;
      if(rootNormalAt)rootNormalAt(x,z,normal);
      else normal.set(heightAt(x - ne, z) - heightAt(x + ne, z), 2 * ne,
        heightAt(x, z - ne) - heightAt(x, z + ne)).normalize();
      patch.normals.push(normal.x, normal.y, normal.z);
      patch.shapes.push(h, 0.027 + rng() * 0.013, ta + (rng() - 0.5) * 0.9, shade);
      patch.box.expandByPoint(projected.set(x, y, z));
      minHeight = Math.min(minHeight, h); maxHeight = Math.max(maxHeight, h);
    }
  }

  const fillRng = random(0xC7F111);
  const fillPatches = new Map();let fillCumulative = 0, fillAllocated = 0;
  for (const cell of fillCells) {
    yield;
    fillCumulative += cell.weight;const next = Math.round(FILL_BUDGET * densityScale * fillCumulative / Math.max(fillWeight, 1e-9));
    const count = next - fillAllocated;fillAllocated = next;
    const key = Math.floor((cell.x - BOUNDS.minX) / 60) + ':' + Math.floor((cell.z - BOUNDS.minZ) / 45);
    if (!fillPatches.has(key)) fillPatches.set(key, { roots: [], normals: [], shapes: [], box: new THREE.Box3(), isFill: true });
    const patch = fillPatches.get(key);let tx = 0, tz = 0, th = 0, ta = 0, shade = 0;
    for (let i = 0; i < count; i++) {
      if (i % 3 === 0) { tx = cell.x + fillRng() * STEP;tz = cell.z + fillRng() * STEP;th = fillRng();ta = fillRng() * Math.PI * 2;shade = fillRng(); }
      const x = tx + (fillRng() - .5) * .11, z = tz + (fillRng() - .5) * .11 / depthStretch, y = rootHeightAt(x, z);
      if (!Number.isFinite(y) || shoreDistance(x, z) < .4 || (y < 1.3 && heightAt(x, z) < 1.2)) continue;
      const h = .15 + .10 * (th * .8 + fillRng() * .2);
      patch.roots.push(x, y - .008, z);
      const ne = .35;if(rootNormalAt)rootNormalAt(x,z,normal);
      else normal.set(heightAt(x - ne, z) - heightAt(x + ne, z), 2 * ne,
        heightAt(x, z - ne) - heightAt(x, z + ne)).normalize();patch.normals.push(normal.x, normal.y, normal.z);
      patch.shapes.push(h, .027 + fillRng() * .013, ta + (fillRng() - .5) * .9, shade);
      patch.box.expandByPoint(projected.set(x, y, z));
      minHeight = Math.min(minHeight, h);maxHeight = Math.max(maxHeight, h);
    }
  }

  let blades = 0, fillBlades = 0, attributeBytes = 0;
  const viewport = new THREE.Vector4();
  for (const patch of [...patches.values(), ...fillPatches.values()]) {
    yield;
    const count = patch.roots.length / 3;
    if (!count) continue;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0,
    ], 3));
    // Keep Three from automatically selecting FLAT_SHADED and discarding our
    // vertex-generated canopy normals. The hook replaces these placeholders.
    const normals = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    // Two triangles retain the tapered silhouette without a middle strip.
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    for (const [name, values, size] of [['aRoot', patch.roots, 3], ['aTerrainNormal', patch.normals, 3], ['aShape', patch.shapes, 4]]) {
      const array = new Float32Array(values);
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, size));
      attributeBytes += array.byteLength;
    }
    geometry.setAttribute('aCoverageRole', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(patch.isFill ? 1 : 0), 1));
    attributeBytes += count * 4;
    geometry.instanceCount = count;
    geometry.boundingBox = patch.box.expandByVector(new THREE.Vector3(0.3, 0.65, 0.3 / depthStretch));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = patch.isFill ? 'Meadow coverage fill patch' : 'Distant grass patch';
    mesh.userData.coverageFill = !!patch.isFill;
    mesh.castShadow = false; mesh.receiveShadow = false;
    // getCurrentViewport includes pixel ratio and works for both the main
    // camera and the lower-resolution planar-reflection render target.
    mesh.onBeforeRender = renderer => {
      renderer.getCurrentViewport(viewport);
      uniforms.uViewportY.value = Math.max(1, viewport.w);
    };
    group.add(mesh); blades += count;if (patch.isFill) fillBlades += count;
  }
  group.userData.uniforms = uniforms;
  group.userData.stats = {
    blades, budget: BUDGET + FILL_BUDGET, crestBlades: blades - fillBlades, fillBlades, fillBudget: FILL_BUDGET, fillCells: fillCells.length, coverageEnvelopeDegrees: [-12, 0, 12], triangles: blades * 2, patches: group.children.length,
    instanceAttributeBytes: attributeBytes, placementCells: cells.length,
    physicalHeightRange: blades ? [minHeight, maxHeight] : [],
    depthStretch, depthPivot, buildMilliseconds: performance.now() - started,
    note: 'Geometry only; GPU compilation, visual quality and device performance need scene QA.',
  };
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of group.children) mesh.geometry.dispose();
    material.dispose(); group.clear();
  };
  completed = true;
  return group;
  } finally {
    if (!completed) {
      group.traverse(object => object.geometry?.dispose());
      material.dispose();
      group.clear();
    }
  }
}

export function createFarGrass(options) { return finishBuild(buildFarGrass(options)); }
export function createFarGrassAsync(options, scheduling) { return finishBuildAsync(buildFarGrass(options), scheduling); }

// Offline authoring and runtime fallback use the same deterministic placement.
function* buildFarGrassPlacement({heightAt,shoreDistance,depthStretch=1,depthPivot=85,referenceCamera}) {
  const normal = new THREE.Vector3(), view = new THREE.Vector3(), projected = new THREE.Vector3();
  const reference = referenceCamera?.clone() ?? new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 8000);
  if (!referenceCamera) {
    reference.position.set(0, 37, depthPivot);
    reference.lookAt(0, 32, depthPivot - 133);
  }
  reference.updateMatrixWorld();
  const cells = [];
  let totalWeight = 0;

  // Only placement is camera-conditioned. Every accepted shoot remains fixed
  // in 3D when the live camera or sun moves. A conservative visibility margin
  // keeps fuzzy hill silhouettes, which a strict coarse visibility test loses.
  for (let z = BOUNDS.minZ; z < BOUNDS.maxZ; z += STEP) {
    for (let x = BOUNDS.minX; x < BOUNDS.maxX; x += STEP) {
      yield;
      const cx = x + STEP / 2, cz = z + STEP / 2, y = heightAt(cx, cz);
      if (y < 2 || shoreDistance(cx, cz) < 0.8) continue;
      projected.set(cx, y, cz).project(reference);
      if (Math.abs(projected.x) > 1.12 || projected.y > 0.28 || projected.y < -0.43) continue;
      const e = 1;
      const hx0 = heightAt(cx - e, cz), hx1 = heightAt(cx + e, cz);
      const hz0 = heightAt(cx, cz - e), hz1 = heightAt(cx, cz + e);
      normal.set(hx0 - hx1, 2 * e, hz0 - hz1).normalize();
      const physicalNormal = normal.clone();
      physicalNormal.z /= depthStretch; physicalNormal.normalize();
      view.set(-cx, 37 - y, (depthPivot - cz) * depthStretch).normalize();
      const facing = physicalNormal.dot(view);
      if (facing < -0.055) continue;
      let occluded = false;
      for (let dz = 6; cz + dz < -115; dz += 10) {
        const t = dz / (depthPivot - cz);
        if (heightAt(cx * (1 - t), cz + dz) > THREE.MathUtils.lerp(y, 37, t) + 0.8) {
          occluded = true; break;
        }
      }
      if (occluded) continue;
      const convexity = y - (heightAt(cx, cz - 4) + heightAt(cx, cz + 4)) * 0.5;
      const crest = Math.exp(-Math.pow(Math.max(0, facing) / 0.22, 2));
      const edge = smooth(-405, -375, cz) * (1 - smooth(-151, -125, cz));
      const weight = edge * (0.07 + 0.75 * crest + 0.18 * smooth(0.015, 0.32, convexity));
      if (weight < 0.005) continue;
      totalWeight += weight;
      cells.push({ x, z, weight });
    }
  }

  // Preserve all original crest roots/RNG sequences. A separate bounded
  // population covers dry cells that the single-reference allocation omitted.
  // Its geometry fades out exactly where near meadow support becomes full.
  const existingCells = new Set(cells.map(c => c.x + ':' + c.z));
  const envelope = coverageEnvelope(reference, depthStretch, depthPivot), fillCells = [];
  let fillWeight = 0;
  for (let z = BOUNDS.minZ; z < 100; z += STEP) for (let x = BOUNDS.minX; x < BOUNDS.maxX; x += STEP) {
    yield;
    if (existingCells.has(x + ':' + z)) continue;
    const cx = x + STEP / 2, cz = z + STEP / 2, y = heightAt(cx, cz);
    if (!Number.isFinite(y) || y < 1.2 || shoreDistance(cx, cz) < .4) continue;
    const edge = smooth(-330, -305, cx) * (1 - smooth(305, 330, cx))
      * smooth(-405, -375, cz) * (1 - smooth(75, 100, cz));
    if (edge < .005) continue;
    normal.set(heightAt(cx - 1, cz) - heightAt(cx + 1, cz), 2,
      (heightAt(cx, cz - 1) - heightAt(cx, cz + 1)) / depthStretch).normalize();
    let needed = 0, grazing = 0;
    for (const pose of envelope) {
      const support = 1 - nearMeadowSupport(cx, y, cz, pose.authored);
      if (support < .005) continue;
      projected.set(cx, y, depthPivot + (cz - depthPivot) * depthStretch).project(pose.camera);
      if (Math.abs(projected.x) > 1.18 || Math.abs(projected.y) > 1.06 || projected.z > 1) continue;
      const distance = Math.hypot(pose.authored.x - cx, pose.authored.z - cz);
      let hidden = false;
      for (let d = 6; d < distance - 4; d += 8) {
        const t = d / distance, px = THREE.MathUtils.lerp(cx, pose.authored.x, t), pz = THREE.MathUtils.lerp(cz, pose.authored.z, t);
        if (heightAt(px, pz) > THREE.MathUtils.lerp(y, pose.authored.y, t) + .8) { hidden = true; break; }
      }
      if (hidden) continue;
      view.set(pose.authored.x - cx, pose.authored.y - y, (pose.authored.z - cz) * depthStretch).normalize();
      const facing = normal.dot(view);
      if (facing < -.08) continue;
      needed = Math.max(needed, support);
      grazing = Math.max(grazing, Math.exp(-Math.pow(Math.max(0, facing) / .3, 2)));
    }
    const weight = edge * needed * (.35 + .65 * grazing);
    if (weight < .005) continue;
    fillCells.push({ x, z, weight });fillWeight += weight;
  }
  return {cells,totalWeight,fillCells,fillWeight};
}
export function createFarGrassPlacement(options){return finishBuild(buildFarGrassPlacement(options));}
