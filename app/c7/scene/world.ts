import * as THREE from 'three'
import { buildTrees } from './trees'
import { buildGroundCover } from './ground-cover'
import { createDebugTimer } from './debug-timer'
import { prepareGeometry } from './prepare-geometry'
import { buildLake } from './water'
import { solarState } from './solar'
import { createLandscapeAssets, type LandscapeAssetStatus } from './photo-plate'
import { referenceProjection, referenceCamera, WATER_LEVEL } from './geography'
import { registeredGroundGLSL } from './registered-ground'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a))
  return t * t * (3 - 2 * t)
}

type CameraKey = { position: [number, number, number]; target: [number, number, number]; fov: number }

const desktopKeys: CameraKey[] = [
  { position: [0, 37, 85], target: [0, 32, -48], fov: 45 },
  { position: [3, 38, 93], target: [3, 50, -48], fov: 45 },
  { position: [9, 40, 108], target: [9, 3, -48], fov: 45 },
  { position: [16, 34, 155], target: [14, 33, -48], fov: 45 },
  { position: [20, 24, 190], target: [16, 29, -48], fov: 45 },
  { position: [22, 17, 225], target: [17, 26, -48], fov: 45 },
  { position: [24, 13, 250], target: [18, 25, -48], fov: 45 },
]

const mobileKeys: CameraKey[] = [
  { position: [0, 43, 100], target: [0, 36, -48], fov: 64 },
  { position: [2, 44, 110], target: [2, 75, -48], fov: 64 },
  { position: [7, 46, 125], target: [7, 7, -48], fov: 64 },
  { position: [14, 37, 165], target: [12, 35, -48], fov: 64 },
  { position: [18, 26, 200], target: [14, 31, -48], fov: 64 },
  { position: [20, 18, 230], target: [15, 28, -48], fov: 64 },
  { position: [22, 13, 250], target: [16, 27, -48], fov: 64 },
]

const keyProgress = [0, 0.16, 0.3, 0.47, 0.66, 0.83, 1]

function sampleKeys(keys: CameraKey[], progress: number, position: THREE.Vector3, target: THREE.Vector3) {
  const p = clamp01(progress)
  let segment = keyProgress.length - 2
  for (let i = 0; i < keyProgress.length - 1; i++) {
    if (p <= keyProgress[i + 1]) {
      segment = i
      break
    }
  }
  const segmentStart = keyProgress[segment]
  const segmentEnd = keyProgress[segment + 1]
  const span = segmentEnd - segmentStart
  const t = clamp01((p - segmentStart) / span)
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  const sample = (kind: 'position' | 'target', axis: 0 | 1 | 2) => {
    const a = keys[segment][kind][axis]
    const b = keys[segment + 1][kind][axis]
    const before = segment > 0 ? keys[segment - 1][kind][axis] : a
    const after = segment + 2 < keys.length ? keys[segment + 2][kind][axis] : b
    const inSlope = segment > 0
      ? (b - before) / (keyProgress[segment + 1] - keyProgress[segment - 1])
      : (b - a) / span
    const outSlope = segment + 2 < keys.length
      ? (after - a) / (keyProgress[segment + 2] - keyProgress[segment])
      : (b - a) / span
    return h00 * a + h10 * span * inSlope + h01 * b + h11 * span * outSlope
  }
  const sampleFov = () => {
    const a = keys[segment].fov
    const b = keys[segment + 1].fov
    const before = segment > 0 ? keys[segment - 1].fov : a
    const after = segment + 2 < keys.length ? keys[segment + 2].fov : b
    const inSlope = segment > 0
      ? (b - before) / (keyProgress[segment + 1] - keyProgress[segment - 1])
      : (b - a) / span
    const outSlope = segment + 2 < keys.length
      ? (after - a) / (keyProgress[segment + 2] - keyProgress[segment])
      : (b - a) / span
    return h00 * a + h10 * span * inSlope + h01 * b + h11 * span * outSlope
  }
  position.set(
    sample('position', 0),
    sample('position', 1),
    sample('position', 2),
  )
  target.set(
    sample('target', 0),
    sample('target', 1),
    sample('target', 2),
  )
  return sampleFov()
}

function buildTerrain(geometry: THREE.BufferGeometry, turf: THREE.Texture, control: THREE.Texture, referenceDepth: THREE.Texture) {
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const shade = new THREE.Color()
  const low = new THREE.Color('#365f35')
  const high = new THREE.Color('#63844e')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    const variation = 0.5 + Math.sin(x * 0.13 + z * 0.074) * 0.18
    shade.copy(low).lerp(high, Math.min(0.75, 0.22 + y * 0.004 + variation * 0.23))
    shade.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shadowSide: THREE.FrontSide,
    forceSinglePass: true,
    dithering: true,
    transparent: true,
    roughness: 1,
  })
  const registration={value:0}
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTurf = { value: turf }
    shader.uniforms.uRegisteredMask={value:control}
    shader.uniforms.uReferenceDepth={value:referenceDepth}
    shader.uniforms.uReferenceProjection={value:referenceProjection}
    shader.uniforms.uRegistration=registration
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'varying vec3 vC7World;\nattribute float aShoreDistance;\nvarying float vBankDistance;\nvoid main() {',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vC7World = (modelMatrix * vec4(position, 1.0)).xyz;\n vBankDistance=aShoreDistance;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `varying vec3 vC7World;
      varying float vBankDistance;
      uniform sampler2D uTurf;
      uniform sampler2D uRegisteredMask;
      uniform sampler2D uReferenceDepth;
      uniform mat4 uReferenceProjection;
      uniform float uRegistration;
      ${registeredGroundGLSL}
      float c7Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float c7Noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(c7Hash(i), c7Hash(i + vec2(1.0, 0.0)), f.x),
          mix(c7Hash(i + vec2(0.0, 1.0)), c7Hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float turfSample(vec2 cell, vec2 point) {
        float angle=c7Hash(cell)*6.2831853;
        mat2 rotation=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
        // An existing grass-only patch supplies fibre detail, never scenery.
        // Four world-anchored samples overlap continuously across tile edges.
        vec2 uv=vec2(.87,.045)+rotation*(point-cell)*vec2(.035,.018);
        vec3 grass=texture2D(uTurf,uv).rgb;
        return clamp(dot(grass,vec3(.2126,.7152,.0722))/.06,.55,1.8);
      }
      float turfDetail(vec2 point) {
        vec2 cell=floor(point),f=fract(point);f=f*f*(3.0-2.0*f);
        return mix(mix(turfSample(cell,point),turfSample(cell+vec2(1,0),point),f.x),
          mix(turfSample(cell+vec2(0,1),point),turfSample(cell+vec2(1,1),point),f.x),f.y);
      }
      void main() {`,
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 ground = vC7World.xz;
      float meadow = c7Noise(ground * 0.078) * 0.49
        + c7Noise(ground * 0.31) * 0.29
        + c7Noise(ground * 1.46) * 0.22;
      float blades = c7Noise(ground * 7.8);
      float grazed = sin(ground.x * 0.22 + sin(ground.y * 0.09) * 2.1);
      // Filter fibres smaller than a pixel; stochastic overlapping samples
      // prevent a repeated square grid in the near meadow and bare bank.
      float footprint=length(fwidth(ground));
      float fineWeight=1.0-smoothstep(0.08,0.35,footprint);
      float mediumWeight=1.0-smoothstep(0.6,2.0,footprint);
      float grassDetail=mix(0.5,c7Noise(ground*8.7),fineWeight);
      float grassPatch=mix(0.5,c7Noise(ground*0.63),mediumWeight);
      float turf=mix(1.0,turfDetail(ground*.34),.5*(1.0-smoothstep(.35,1.4,footprint)));
      diffuseColor.rgb *= (0.72 + meadow*.2 + grassPatch*.18 + grassDetail*.16)*turf;
      // Register existing image detail to the actual terrain. Projection is
      // fixed in world coordinates; it does not fade with scroll or follow the eye.
      vec4 registeredPosition=uReferenceProjection*vec4(vC7World,1.0);
      vec2 registeredUv=registeredPosition.xy/registeredPosition.w*0.5+0.5;
      vec3 region=texture2D(uRegisteredMask,clamp(registeredUv,0.0,1.0)).rgb;
      float inside=smoothstep(0.0,0.055,registeredUv.x)*(1.0-smoothstep(0.945,1.0,registeredUv.x))
        *smoothstep(0.0,0.035,registeredUv.y)*(1.0-smoothstep(0.96,1.0,registeredUv.y));
      // Projected colour belongs only to the surface visible from the source
      // camera. A fixed terrain depth pass prevents rear slopes from receiving
      // duplicate hills/trees from an occluding foreground ridge.
      float referenceZ=registeredPosition.z/registeredPosition.w*0.5+0.5;
      float referenceDistance=450.0/(1500.0-referenceZ*1499.7);
      float registeredVisible=0.0;
      // A pixel-sized depth neighbourhood and a tolerance in world metres
      // avoid dark zipper seams from nearest-depth quantization on a crest.
      // Visibility stays fixed to the source camera, independent of the viewer.
      for(int sampleIndex=0;sampleIndex<5;sampleIndex++) {
        vec2 offset=sampleIndex==0?vec2(0.0):vec2(
          cos(float(sampleIndex)*1.5707963)/1280.0,
          sin(float(sampleIndex)*1.5707963)/720.0);
        float nearestZ=texture2D(uReferenceDepth,clamp(registeredUv+offset,0.0,1.0)).r;
        float nearestDistance=450.0/(1500.0-nearestZ*1499.7);
        registeredVisible+=1.0-smoothstep(1.5,12.0,referenceDistance-nearestDistance);
      }
      registeredVisible*=0.2;
      inside*=registeredVisible*step(0.001,registeredPosition.w);
      float land=c7RegisteredLand(registeredUv,region);
      // Remove tree pixels from the surface albedo; their separate rooted meshes
      // carry the silhouette and parallax. This is a runtime mask, no asset rewrite.
      vec4 trees[9]=vec4[9](vec4(0.148,0.445,0.016,0.047),vec4(0.198,0.45,0.013,0.032),
        vec4(0.374,0.53,0.014,0.027),vec4(0.427,0.493,0.01,0.018),vec4(0.45,0.5,0.011,0.02),
        vec4(0.678,0.49,0.022,0.047),vec4(0.772,0.465,0.015,0.031),
        vec4(0.84,0.425,0.017,0.045),vec4(0.863,0.426,0.014,0.034));
      vec3 registered=texture2D(uTurf,clamp(registeredUv,0.0,1.0)).rgb;
      for(int tree=0;tree<9;tree++) {
        vec2 offset=(registeredUv-trees[tree].xy)/trees[tree].zw;
        float removal=1.0-smoothstep(0.7,1.35,length(offset));
        if(removal>0.0) {
          vec3 fill=vec3(0.0);float weights=0.0;
          for(int sampleIndex=0;sampleIndex<12;sampleIndex++) {
            float angle=float(sampleIndex)*0.5235988;
            vec2 q=vec2(cos(angle),sin(angle))*1.85;
            vec2 sampleUv=trees[tree].xy+q*trees[tree].zw;
            vec3 candidate=texture2D(uTurf,sampleUv).rgb;
            vec3 mask=texture2D(uRegisteredMask,sampleUv).rgb;
            float vegetationSample=smoothstep(0.005,0.035,candidate.g-candidate.b)
              *(1.0-smoothstep(0.08,0.35,mask.g))*(1.0-smoothstep(0.15,0.55,mask.b));
            float w=vegetationSample/(0.3+dot(q-offset,q-offset));
            fill+=candidate*w;weights+=w;
          }
          registered=mix(registered,fill/max(0.001,weights),removal);

        }
      }
      float wetEdge=smoothstep(0.7,4.5,vBankDistance);
      // Reject nearly neutral source-water pixels on the photographed grass
      // silhouette. Absolute green differences admit a pale seam at the bank.
      float vegetation=c7RegisteredVegetation(registered);
      float foregroundBlend=smoothstep(0.0,0.26,registeredUv.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,registered*1.55,inside*land*wetEdge*vegetation*uRegistration*foregroundBlend);`,
    ).replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      // This height field represents the upward-facing ground, including in
      // the mirror camera. Back-face culling leaves holes in its mirror view;
      // flipping the ground normal would light the same grass as an underside.
      normal *= faceDirection;`,
    ).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float reliefVisibility = 1.0 - smoothstep(0.35, 1.45, length(fwidth(vC7World.xz)));
      float reliefShade = meadow * 0.65 + grazed * 0.1 + turf * 0.25;
      normal = normalize(normal + vec3(-dFdx(reliefShade), -dFdy(reliefShade), 0.0)
        * 0.9 * reliefVisibility);`,
    )
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'continuous-rolling-hills'
  return { mesh, geometry, material, registration }
}

function buildSky() {
  const geometry = new THREE.SphereGeometry(480, 48, 24)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Color() },
      uPhotoMap: { value: null },
      uPhotoMix: { value: 0 },
      uSkyLevel: { value: 1 },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSunDirection;
      uniform vec3 uGlow;
      uniform sampler2D uPhotoMap;
      uniform float uPhotoMix;
      uniform float uSkyLevel;
      varying vec3 vDirection;
      void main() {
        float h = normalize(vDirection).y;
        float upper = smoothstep(-0.19, 0.26, h);
        vec3 color = mix(uHorizon, uTop, upper);
        color = mix(uBottom, color, smoothstep(-0.42, -0.025, h));
        vec2 photoUv = vec2(clamp(0.5 + normalize(vDirection).x * 0.48, 0.02, 0.98),
          clamp(0.68 + h * 0.6, 0.62, 0.98));
        vec3 photoSky = texture2D(uPhotoMap, photoUv).rgb;
        color = mix(color, photoSky, uPhotoMix * smoothstep(-0.16, 0.04, h));
        float sun = max(0.0, dot(normalize(vDirection), normalize(uSunDirection)));
        // Radiance around the same physical emitter: a broad warm aureole and
        // a small bright core. The mirror camera sees this atmosphere too.
        color += uGlow * (pow(sun, 12.0) * 0.12 + pow(sun, 90.0) * 0.35
          + pow(sun, 480.0) * 0.8 + pow(sun, 1800.0) * 1.0);
        gl_FragColor = vec4(color * uSkyLevel, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'atmospheric-sky'
  mesh.renderOrder = -100
  return { mesh, geometry, material }
}

function buildClouds(lowTier: boolean) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#f5ddd2') },
      uOpacity: { value: 0.18 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x),
          mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
      }
      void main() {
        float warp = noise(vUv * vec2(5.7, 7.3) + uTime * 0.008) - 0.5;
        float band = 1.0 - smoothstep(0.07, 0.27, abs(vUv.y - 0.5 + warp * 0.16));
        float wisps = 0.42 + 0.58 * noise(vUv * vec2(16.0, 4.0) - uTime * 0.004);
        float ends = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
        float alpha = band * wisps * ends * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const clouds: THREE.Mesh[] = []
  const count = lowTier ? 7 : 10
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Mesh(geometry, material)
    const x = cloudDriftX(i, count, 0, 0, 0)
    const y = 82 + Math.sin(i * 2.74) * 9
    const z = -175 - (i % 3) * 41
    cloud.position.set(x, y, z)
    cloud.scale.set(115 + (i % 4) * 24, 28 + (i % 3) * 8, 1)
    cloud.rotation.z = Math.sin(i * 2.1) * 0.09
    cloud.name = `moving-cloud-${i + 1}`
    clouds.push(cloud)
  }
  return { clouds, geometry, material }
}

const cloudDriftX = (index: number, count: number, time: number,
  portrait: number, cameraX: number) => {
  const span = lerp(1100, 400, portrait)
  const start = lerp(-450, -200, portrait)
  const phase = index * span / count + Math.sin(index * 5.13) * 21 + time * 0.38
  return cameraX * portrait + start + ((phase % span) + span) % span
}

export type C7World = {
  render: (progress: number, time: number) => void
  resize: (width: number, height: number, lowTier?:boolean) => void
  restore: () => void
  ready: () => boolean
  status: () => LandscapeAssetStatus
  dispose: () => void
  diagnostics: () => { calls: number; triangles: number; camera: [number, number, number];
    cloudX: number[]; performance: {cpuMs:number; setup:Record<string,number>; firstFrameCpuMs:number; gpu:{supported:boolean;samples:number;ms:number|null;disjoint:number}; buffer:number[]; scale:number; renderCount:number; reflectionCount:number}; solar:number[]; photo: { status: LandscapeAssetStatus; opacity: number; progress: number; sun: number; portrait: number } }
}

export async function createC7World(canvas: HTMLCanvasElement, lowTier: boolean, onAssetsReady: () => void, signal:AbortSignal): Promise<C7World> {
  const workerStarted=performance.now()
  const prepared=await prepareGeometry(lowTier,signal)
  if(signal.aborted){prepared.land.dispose();prepared.water.dispose();throw new DOMException('Aborted','AbortError')}
  const workerElapsed=performance.now()-workerStarted
  const setupStart=performance.now(),setup:Record<string,number>={workerElapsedMs:workerElapsed,workerCpuMs:prepared.cpuMs}
  let setupCheckpoint=setupStart
  const markSetup=(name:string)=>{const now=performance.now();setup[name]=now-setupCheckpoint;setupCheckpoint=now}
  const query = new URLSearchParams(location.search)
  const debug = query.has('c7-debug')
  const neutral = debug && query.get('c7-light') === 'neutral'
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowTier,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  })
  const timer=createDebugTimer(renderer.getContext() as WebGL2RenderingContext,debug)
  let cpuMs=0, firstFrameCpuMs=0, renderCount=0, reflectionCount=0
  renderer.info.autoReset = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.setClearColor('#988477')
  markSetup('renderer')

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(43, 1, 0.3, 3000)
  const sky = buildSky()
  let alive = true
  let assetRevision=0
  const assets=createLandscapeAssets(lowTier,()=>{if(alive){assetRevision++;onAssetsReady()}})
  sky.material.uniforms.uPhotoMap.value = assets.photo
  const reflectionTarget = new THREE.WebGLRenderTarget(512, 512, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 0,
  })
  reflectionTarget.texture.generateMipmaps = true
  const reflectionCamera = new THREE.PerspectiveCamera(43, 1, 0.3, 3000)
  const reflectionPreview = debug && query.has('c7-reflection-view') ? new THREE.Scene() : null
  const previewMaterial = reflectionPreview ? new THREE.MeshBasicMaterial({map:reflectionTarget.texture}) : null
  const previewGeometry = reflectionPreview ? new THREE.PlaneGeometry(2,2) : null
  if(reflectionPreview && previewGeometry && previewMaterial)reflectionPreview.add(new THREE.Mesh(previewGeometry,previewMaterial))
  const previewCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  const reflectionMatrix = new THREE.Matrix4()
  const reflectedTarget = new THREE.Vector3()
  const reflectionClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_LEVEL)
  const referenceTarget=new THREE.WebGLRenderTarget(1280,720,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter})
  referenceTarget.depthTexture=new THREE.DepthTexture(1280,720,THREE.UnsignedIntType)
  const terrain = buildTerrain(prepared.land, assets.photo, assets.control,referenceTarget.depthTexture)
  markSetup('terrainAndTargets')
  const referenceScene=new THREE.Scene()
  const referenceMaterial=new THREE.MeshDepthMaterial({side:THREE.DoubleSide})
  referenceScene.add(new THREE.Mesh(terrain.geometry,referenceMaterial))
  let referenceDirty=true
  terrain.mesh.receiveShadow = true
  const lake = buildLake(prepared.water, reflectionTarget.texture)
  markSetup('lake')
  lake.material.uniforms.uReflectionOnly.value = debug && query.get('c7-reflection') === 'only' ? 1 : 0
  const cloudLayer = buildClouds(lowTier)
  const trees = buildTrees(lowTier)
  markSetup('treesAndClouds')
  const cover = buildGroundCover(prepared.cover,assets.photo,assets.control)
  cover.mesh.visible=!(debug&&query.has('c7-cover-off'))
  markSetup('groundCover')
  scene.add(sky.mesh, terrain.mesh, lake.mesh, cover.mesh,
    trees.trunks, trees.leaves, trees.conifers,
    ...cloudLayer.clouds)

  const sunMaterial = new THREE.MeshBasicMaterial({color:'#fff8dc',fog:false})
  const sun = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 18), sunMaterial)
  sun.name = 'sun-behind-terrain'
  sun.visible = !neutral
  sun.renderOrder = 10
  scene.add(sun)
  const ambient = new THREE.HemisphereLight('#f5d8cb', '#52664b', 1.2)
  const sunlight = new THREE.DirectionalLight('#ffd5aa', 2.7)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(lowTier ? 1024 : 2048, lowTier ? 1024 : 2048)
  Object.assign(sunlight.shadow.camera, { left: -260, right: 360, top: 300, bottom: -240, near: 1, far: 3200 })
  sunlight.shadow.normalBias = 0.12
  sunlight.shadow.bias = -0.00008
  sunlight.target.position.set(0, 0, -50)
  scene.add(ambient, sunlight, sunlight.target)
  scene.fog = new THREE.Fog('#9c8b81', 320, 1100)

  const cameraPosition = new THREE.Vector3()
  const cameraTarget = new THREE.Vector3()
  const mobilePosition = new THREE.Vector3()
  const mobileTarget = new THREE.Vector3()
  const sunDirection = new THREE.Vector3()
  const skyTop = new THREE.Color()
  const skyHorizon = new THREE.Color()
  const skyBottom = new THREE.Color()
  const sunlightColor = new THREE.Color()
  const fogColor = new THREE.Color()
  const dawnTop = new THREE.Color('#e3d5c3')
  const dawnHorizon = new THREE.Color('#ffc285')
  const dawnBottom = new THREE.Color('#e9b8a1')
  const dayTop = new THREE.Color('#dce6e1')
  const dayHorizon = new THREE.Color('#fff0d5')
  const dayBottom = new THREE.Color('#e8ddc4')
  const duskTop = new THREE.Color('#b5a7b9')
  const duskHorizon = new THREE.Color('#f9ac89')
  const duskBottom = new THREE.Color('#d88f81')
  const dawnLight = new THREE.Color('#ffd19a')
  const dayLight = new THREE.Color('#fff3d5')
  const duskLight = new THREE.Color('#ff9878')
  const dawnSunCore = new THREE.Color('#fff8dc')
  const daySunCore = new THREE.Color('#fffef3')
  const duskSunCore = new THREE.Color('#ffba7e')
  const dawnFog = new THREE.Color('#d8c7a1')
  const dayFog = new THREE.Color('#dce3cc')
  const duskFog = new THREE.Color('#ba967a')
  const cloudWhite = new THREE.Color('#fffaf2')
  let width = 1
  let height = 1
  let resolutionScale = 1
  let lastRenderTime = -1
  let frameInterval = 1 / 60
  let slowFrames = 0,fastFrames = 0
  let outputLowTier=lowTier
  const bufferSize = new THREE.Vector2()
  let latestProgress=0
  let lastReflectedProgress = Number.NaN
  let lastReflectionTime = -Infinity
  let reflectedAssetRevision=-1
  let shadowProgress=Number.NaN,shadowAssetRevision=-1

  const setResolution = () => {
    const pixelBudgetRatio = Math.sqrt(1_500_000 / (width * height))
    const baseRatio = Math.min(devicePixelRatio, outputLowTier ? 1 : 1.25, pixelBudgetRatio)
    renderer.setPixelRatio(Math.min(devicePixelRatio, baseRatio * resolutionScale))
    renderer.setSize(width, height, false)
    renderer.getDrawingBufferSize(bufferSize)
    const reflectionScale = outputLowTier ? 1 : 0.9
    reflectionTarget.setSize(
      Math.max(192, Math.min(1024, Math.round(bufferSize.x * reflectionScale))),
      Math.max(192, Math.min(640, Math.round(bufferSize.y * reflectionScale))),
    )
    lastReflectedProgress = Number.NaN

  }

  const resize = (nextWidth: number, nextHeight: number, nextLowTier=lowTier) => {
    if(outputLowTier!==nextLowTier){
      outputLowTier=nextLowTier
      sunlight.shadow.map?.dispose();sunlight.shadow.map=null
      sunlight.shadow.mapSize.set(outputLowTier?1024:2048,outputLowTier?1024:2048)
      shadowAssetRevision=-1
    }
    width = Math.max(1, nextWidth)
    height = Math.max(1, nextHeight)
    setResolution()
    referenceDirty=true
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  let compilation:'idle'|'pending'|'ready'|'failed'='idle',preparationId=0
  let preparationDeadline:ReturnType<typeof setTimeout>|undefined
  const prepareShaders=async()=>{
    const id=++preparationId,started=performance.now()
    compilation='pending'
    const active=()=>alive&&id===preparationId&&compilation==='pending'
    preparationDeadline=setTimeout(()=>{if(active()){compilation='failed';onAssetsReady()}},5000)
    try {
      // Decoded images are still CPU-side. Upload each texture in its own
      // preparation task, so the first visible draw does not also pay for both
      // uploads and mipmaps. Keep the same cancellation/deadline gate.
      for(const [name,texture] of [['photo',assets.photo],['control',assets.control]] as const) {
        await new Promise<void>(resolve=>setTimeout(resolve,0))
        if(!active())return
        const uploadStart=performance.now()
        renderer.initTexture(texture)
        setup[`${name}UploadMs`]=performance.now()-uploadStart
      }
      await new Promise<void>(resolve=>setTimeout(resolve,0))
      if(!active())return
      await renderer.compileAsync(scene,camera)
      if(!active())return
      renderer.clippingPlanes=[reflectionClip]
      renderer.setRenderTarget(reflectionTarget)
      await renderer.compileAsync(scene,reflectionCamera)
      if(!active())return
      renderer.clippingPlanes=[]
      renderer.setRenderTarget(referenceTarget)
      await renderer.compileAsync(referenceScene,referenceCamera)
      if(!active())return
      setup.shaderPreparationMs=performance.now()-started
      compilation='ready';onAssetsReady()
    }catch(error){if(active()){compilation='failed';console.error('C7 shader preparation failed',error);onAssetsReady()}}
    finally{if(id===preparationId){clearTimeout(preparationDeadline);renderer.clippingPlanes=[];renderer.setRenderTarget(null)}}
  }
  const status=():LandscapeAssetStatus=>assets.status()==='failed'||compilation==='failed'?'failed'
    :assets.ready()&&compilation==='ready'?'ready':'loading'
  const restore=()=>{preparationId++;clearTimeout(preparationDeadline);compilation='idle';referenceDirty=true;lastReflectedProgress=NaN;shadowAssetRevision=-1}
  const render = (progress: number, time: number) => {
    if(status()!=='ready'){
      if(assets.ready()&&compilation==='idle')void prepareShaders()
      return
    }
    const cpuStart=debug?performance.now():0
    timer.begin()
    renderCount++
    renderer.info.reset()
    if(referenceDirty) {
      renderer.setRenderTarget(referenceTarget)
      renderer.render(referenceScene,referenceCamera)
      renderer.setRenderTarget(null)
      referenceDirty=false
    }
    const p = clamp01(progress)
    latestProgress=p
    const shadowDirty=!Number.isFinite(shadowProgress)||Math.abs(p-shadowProgress)>.001||shadowAssetRevision!==assetRevision
    renderer.shadowMap.needsUpdate=shadowDirty
    if(shadowDirty){shadowProgress=p;shadowAssetRevision=assetRevision}
    if (lastRenderTime >= 0 && time > lastRenderTime) {
      const interval = Math.min(0.1, time - lastRenderTime)
      frameInterval += (interval - frameInterval) * 0.08
      slowFrames=frameInterval>.035?slowFrames+1:0
      fastFrames=frameInterval<.022?fastFrames+1:0
      const nextScale=slowFrames>=90?Math.max(.72,resolutionScale-.1)
        :fastFrames>=360?Math.min(1,resolutionScale+.05):resolutionScale
      if(nextScale!==resolutionScale){
        resolutionScale=nextScale;slowFrames=0;fastFrames=0;setResolution()
      }
    }
    lastRenderTime = time
    const portrait = ease(0.88, 0.58, width / height)
    const desktopFov = sampleKeys(desktopKeys, p, cameraPosition, cameraTarget)
    const mobileFov = sampleKeys(mobileKeys, p, mobilePosition, mobileTarget)
    cameraPosition.lerp(mobilePosition, portrait)
    cameraTarget.lerp(mobileTarget, portrait)
    camera.position.copy(cameraPosition)
    // Preserve perspective and round silhouettes on portrait displays.
    camera.aspect=width/height
    camera.fov = lerp(desktopFov, mobileFov, portrait)
    const coverFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)*0.5)
      *Math.min(1,(16/9)/(width/height))))
    camera.fov=coverFov
    camera.updateProjectionMatrix()
    camera.lookAt(cameraTarget)
    camera.updateMatrixWorld()
    reflectionCamera.position.set(camera.position.x, 2 * WATER_LEVEL - camera.position.y, camera.position.z)
    reflectedTarget.set(cameraTarget.x, 2 * WATER_LEVEL - cameraTarget.y, cameraTarget.z)
    reflectionCamera.up.set(0, -1, 0)
    reflectionCamera.fov = camera.fov
    reflectionCamera.aspect = camera.aspect
    reflectionCamera.updateProjectionMatrix()
    reflectionCamera.lookAt(reflectedTarget)
    reflectionCamera.updateMatrixWorld()
    reflectionMatrix.multiplyMatrices(reflectionCamera.projectionMatrix, reflectionCamera.matrixWorldInverse)

    // Intermediate portrait/tablet lenses need an angular-width bound too;
    // blending phone/desktop coordinates alone put the sun outside the viewport.
    // This changes the one physical emitter, including its light and reflection.
    const solarHorizontalLimit=Math.min(1,camera.aspect*Math.tan(camera.fov*Math.PI/360)
      /(1.6*Math.tan(Math.PI/8)))
    const { day, dusk } = solarState(p,sun.position,portrait,solarHorizontalLimit)
    skyTop.copy(dawnTop).lerp(dayTop, day).lerp(duskTop, dusk)
    skyHorizon.copy(dawnHorizon).lerp(dayHorizon, day).lerp(duskHorizon, dusk)
    skyBottom.copy(dawnBottom).lerp(dayBottom, day).lerp(duskBottom, dusk)
    sunlightColor.copy(dawnLight).lerp(dayLight, day).lerp(duskLight, dusk)
    fogColor.copy(dawnFog).lerp(dayFog, day).lerp(duskFog, dusk)
    const skyUniforms = sky.material.uniforms
    ;(skyUniforms.uTop.value as THREE.Color).copy(skyTop)
    ;(skyUniforms.uHorizon.value as THREE.Color).copy(skyHorizon)
    ;(skyUniforms.uBottom.value as THREE.Color).copy(skyBottom)
    ;(skyUniforms.uGlow.value as THREE.Color).copy(sunlightColor)
    skyUniforms.uPhotoMix.value = assets.ready()
      ? 0.12 * (1 - day * 0.73 - dusk * 0.5)
      : 0
    skyUniforms.uSkyLevel.value = lerp(1.15,1.1,day)*(1-dusk*.08)

    sun.scale.setScalar(1)
    sunMaterial.color.copy(dawnSunCore).lerp(daySunCore, day).lerp(duskSunCore, dusk).multiplyScalar(8)
    sunDirection.copy(sun.position).sub(camera.position).normalize()
    ;(skyUniforms.uSunDirection.value as THREE.Vector3).copy(sunDirection)
    sky.mesh.position.copy(camera.position)

    sunlight.position.copy(sun.position)
    sunlight.target.position.set(0,0,-50)
    sunlight.color.copy(sunlightColor)
    sunlight.intensity = lerp(3.6, 3.5, day) * (1 - dusk * 0.46)
    ambient.color.copy(skyTop)
    // Sky RGB describes chromaticity; intensity owns its irradiance. Avoid
    // multiplying the low display luminance into the fill a second time.
    const skyLuminance=0.2126*ambient.color.r+0.7152*ambient.color.g+0.0722*ambient.color.b
    ambient.color.multiplyScalar(1/Math.max(0.08,skyLuminance))
    ambient.groundColor.set('#4d6037')
    ambient.intensity = lerp(1.18, 1.3, day) * (1 - dusk * 0.15)
    if (neutral) {
      sunlight.position.set(-280, 420, 170)
      sunlight.color.set('#ffffff'); sunlight.intensity = 2.5
      ambient.color.set('#d7e2ef'); ambient.intensity = 1.1
      skyUniforms.uTop.value.set('#bfc7cc');skyUniforms.uHorizon.value.set('#cbd0d2')
      skyUniforms.uBottom.value.set('#cbd0d2');skyUniforms.uGlow.value.set('#000000')
      skyUniforms.uPhotoMix.value=0
      skyUniforms.uSkyLevel.value=1
    }
    if(neutral)fogColor.set('#c2c9c9')
    ;(scene.fog as THREE.Fog).color.copy(fogColor)
    ;(scene.fog as THREE.Fog).near = neutral ? 320 : lerp(280,320,day)
    ;(scene.fog as THREE.Fog).far = neutral ? 1100 : lerp(1100,850,dusk)
    renderer.setClearColor(fogColor)

    const projection=debug?query.get('c7-projection'):null
    terrain.registration.value=assets.ready()&&projection!=='off'&&projection!=='cover'?0.92:0
    cover.ready.value=assets.ready()&&projection!=='off'&&projection!=='terrain'?0.92:0
    cover.time.value=time
    // All objects persist: their visibility is controlled by geometry/frustum,
    // not a scroll-driven material dissolve.
    terrain.material.opacity=1
    terrain.material.depthWrite=true
    trees.trunkMaterial.opacity=1
    trees.leafMaterial.opacity=1
    lake.material.uniforms.uOpacity.value=1

    lake.material.uniforms.uTime.value = time
    lake.material.uniforms.uProgress.value = p
    ;(lake.material.uniforms.uSun.value as THREE.Vector3).copy(neutral ? sunlight.position : sun.position)
    ;(lake.material.uniforms.uSunColor.value as THREE.Color).copy(sunlight.color)
    lake.material.uniforms.uSunIntensity.value = sunlight.intensity
    ;(lake.material.uniforms.uCamera.value as THREE.Vector3).copy(camera.position)
    cloudLayer.material.uniforms.uTime.value = time
    ;(cloudLayer.material.uniforms.uColor.value as THREE.Color).copy(neutral ? cloudWhite : skyHorizon).lerp(cloudWhite, 0.32 + day * 0.12)
    cloudLayer.material.uniforms.uOpacity.value = 0.18 + day * 0.06 + dusk * 0.03
    for (let i = 0; i < cloudLayer.clouds.length; i++) {
      const cloud = cloudLayer.clouds[i]
      cloud.rotation.y = Math.sin(time * 0.016 + i) * 0.018
      cloud.position.x = cloudDriftX(i, cloudLayer.clouds.length, time, portrait, camera.position.x)
    }
    const reflectionPresence = 1
    if (reflectionPresence > 0.001 &&
      (reflectedAssetRevision!==assetRevision || !Number.isFinite(lastReflectedProgress) || Math.abs(p - lastReflectedProgress) > 0.003
        || time - lastReflectionTime > (outputLowTier ? 0.2 : 0.1))) {
      ;(lake.material.uniforms.uReflectionViewProjection.value as THREE.Matrix4).copy(reflectionMatrix)
      lake.mesh.visible = false
      sky.mesh.position.copy(reflectionCamera.position)
      renderer.clippingPlanes = [reflectionClip]
      renderer.setRenderTarget(reflectionTarget)
      try {
        renderer.render(scene, reflectionCamera)
        reflectionCount++
      } finally {
        renderer.setRenderTarget(null)
        renderer.clippingPlanes = []
        sky.mesh.position.copy(camera.position)
        lake.mesh.visible = true
      }
      lastReflectedProgress = p
      lastReflectionTime = time
      reflectedAssetRevision=assetRevision
    }
    lake.material.uniforms.uReflectionStrength.value = reflectionPresence > 0.001
      && !(debug && query.get('c7-reflection') === 'off') ? reflectionPresence
      : 0
    renderer.render(scene, camera)
    if(reflectionPreview)renderer.render(reflectionPreview,previewCamera)
    timer.end()
    if(debug){cpuMs=performance.now()-cpuStart;if(renderCount===1)firstFrameCpuMs=cpuMs}
  }

  const dispose = () => {
    alive = false
    preparationId++;clearTimeout(preparationDeadline)
    timer.dispose()
    assets.dispose()
    reflectionTarget.dispose()
    referenceTarget.dispose();referenceMaterial.dispose()
    previewGeometry?.dispose();previewMaterial?.dispose()
    terrain.geometry.dispose()
    terrain.material.dispose()
    cover.geometry.dispose();cover.material.dispose()
    lake.geometry.dispose()
    lake.material.dispose()
    sky.geometry.dispose()
    sky.material.dispose()
    cloudLayer.geometry.dispose()
    cloudLayer.material.dispose()
    trees.trunkGeometry.dispose()
    trees.leafGeometry.dispose()
    trees.coniferGeometry.dispose()
    trees.trunkMaterial.dispose()
    trees.leafMaterial.dispose()
    sun.geometry.dispose()
    sun.material.dispose()
    sunlight.shadow.map?.dispose()
    renderer.renderLists.dispose()
    renderer.dispose()
  }

  markSetup('lightsAndState')
  setup.total=performance.now()-setupStart
  return {
    render,
    resize,
    restore,
    ready: () => status()==='ready',
    status,
    dispose,
    diagnostics: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      camera: [camera.position.x, camera.position.y, camera.position.z],
      target:cameraTarget.toArray(),lens:{fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far},
      performance:{cpuMs,firstFrameCpuMs,setup,gpu:timer.read(),buffer:[bufferSize.x,bufferSize.y],scale:resolutionScale,renderCount,reflectionCount},
      solar:[sun.position.x,sun.position.y,sun.position.z],
      cloudX: cloudLayer.clouds.map((cloud) => cloud.position.x), photo: {status:assets.status(),opacity:0,progress:latestProgress,sun:1,portrait:width<height?1:0} }),
  }
}
