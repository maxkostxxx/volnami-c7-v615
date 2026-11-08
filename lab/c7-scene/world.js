import {specializeSpotReceivers} from './spot-receivers.js';
import {grassJob,packGrass,packetBuffers,samplerFromPacket} from './grass-packet.js';
import {cachePmremHalfVectors} from './pmrem-sample-cache.js';
import {fuseStaticGroundSkyLighting} from './fused-ground-sky.js';
import {releaseBinaryDecoder,binaryDecoderDiagnostics} from './binary-transfer.js';
import {specializeLightScalars} from './static-light-scalars.js';
import {specializeStaticShadowReceivers} from './static-shadow-receiver.js';
import {createGrassAsync} from './grass.js';
import {applyTerrainChunks} from './terrain-chunks.js';
import {applyZeroIncidentGuard} from './direct-zero-guard.js';
import {compactGrassShadows} from './compact-grass-shadows.js';
import {loadStartupData} from './startup-data.js';
import {applySkyHorizon,prepareHorizonTransfer} from './sky-horizon.js';
import './shadow-disk.js';
import * as T from 'three';
import {createSky} from './sky.js';
import {adaptTerrainAsync} from './adaptive-terrain.js';
import {loadTerrainGeometry} from './terrain-cache.js';
import {createTerrainSampler} from './terrain-sampler.js';
import {createAtmosphereAsync} from './atmosphere.js';
import {createTerrainGeometryAsync,heightAt,shoreDistance,surfacePoint,referenceCamera,referenceLookAt,rearMeadowOwnerAt} from './terrain.js';
import {createTurfMaterial} from './materials.js';
import {createLake} from './lake.js';
import {createTrees,prepareTreeTextures} from './trees.js';
import {createSkyLight} from './sky-light.js';
import {createFarGrassAsync} from './far-grass.js';
import {applyNearCanopyOcclusion} from './canopy-occlusion.js';
import {applyMicrocanopy} from './microcanopy.js';
import {applyRearMeadow,prepareRearMeadowOwner} from './rear-meadow.js';
import {createRearFill} from './rear-fill.js';


// Cheap depth coverage rejects hidden terrain/leaf fragments before their
// lighting shaders run. Geometry, alpha masks and colour passes are unchanged.
// Native r186 foliage wind is frozen in trees.js; a deforming crown would need
// the same deformation in this depth material before enabling this path.
function createOpaqueDepthCoverage({ground,trees}){
 // Firefox's depth/derivative path changed edge pixels in the paired tests,
 // including with invariant positions. Retain its original rendering path.
 const supported=T.REVISION==='186'&&!/Firefox\//.test(navigator.userAgent);
 if(!supported){const state={supported:false,enabled:false,terrain:false,foliage:false,terrainMinPixels:1500000,leafMeshes:0};return{state,update(){},dispose(){}};}
 const terrainGroup=new T.Group();terrainGroup.name='C7 terrain depth coverage';
 const terrainMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,toneMapped:false});
 for(const tile of ground.userData.terrainChunks.tiles){const mesh=new T.Mesh(tile.geometry,terrainMaterial);mesh.renderOrder=-100;terrainGroup.add(mesh);}
 ground.add(terrainGroup);
 const sources=[],leaves=[],materials=new Map();
 trees.traverse(object=>{if(object.isMesh&&object.material.userData.leafUniforms)sources.push(object);});
 for(const source of sources){
  const m=source.material,key=[m.map?.uuid,m.alphaMap?.uuid,m.alphaTest,m.side,m.opacity].join('|');
  let material=materials.get(key);
  if(!material){material=new T.MeshDepthMaterial({map:m.map,alphaMap:m.alphaMap,alphaTest:m.alphaTest,side:m.side,opacity:m.opacity,colorWrite:false,depthWrite:true});materials.set(key,material);}
  const mesh=new T.Mesh(source.geometry,material);mesh.name='C7 foliage depth coverage';mesh.renderOrder=-101;
  mesh.matrixAutoUpdate=false;source.updateMatrix();mesh.matrix.copy(source.matrix);mesh.layers.mask=source.layers.mask;
  source.parent.add(mesh);leaves.push({source,mesh});
 }
 const state={supported:true,enabled:true,terrain:false,foliage:false,terrainMinPixels:1500000,leafMeshes:leaves.length};
 return{state,update(renderer){
  const target=renderer.getRenderTarget(),pixels=target?target.width*target.height:renderer.domElement.width*renderer.domElement.height;
  state.terrain=state.enabled&&pixels>=state.terrainMinPixels;state.foliage=state.enabled;
  terrainGroup.visible=state.terrain;
  for(const{source,mesh}of leaves){mesh.visible=state.foliage&&source.visible;mesh.matrix.copy(source.matrix);}
 },dispose(){
  ground.remove(terrainGroup);terrainGroup.clear();terrainMaterial.dispose();
  for(const{mesh}of leaves)mesh.removeFromParent();for(const material of materials.values())material.dispose();
 }};
}

// Shared real-time world. The caller owns scroll, animation, visibility and DOM.
// No RAF or global UI listeners are installed by this module.
export async function createC7Scene({canvas,width=1,height=1,low=false,mobile=false,compactHorizon=true,inputs,grassPreparationWorker,signal,noGrass=false,noAerial=false,depthStretch=2.1}={}){
 low=mobile||low;
 const geometryQuality=mobile?'mobile':low?'low':'normal';
 const scene=new T.Scene(),cleanups=[];
 let disposed=false;
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 function checkAbort(){if(signal?.aborted||disposed)throw new DOMException('C7 initialization aborted','AbortError');}
 function dispose(){
  disposed=true;releaseBinaryDecoder();
  signal?.removeEventListener('abort',onAbort);
  for(const cleanup of cleanups.splice(0).reverse())cleanup();
  const resources=new Set();
  const texture=t=>{if(t?.isTexture)resources.add(t);};
  scene.traverse(o=>{
   if(o.geometry)resources.add(o.geometry);
   for(const m of(o.material?(Array.isArray(o.material)?o.material:[o.material]):[])){
    resources.add(m);Object.values(m).forEach(texture);
    for(const u of Object.values(m.uniforms??{}))texture(u.value);
    for(const group of Object.values(m.userData??{}))if(group&&typeof group==='object')for(const u of Object.values(group))texture(u?.value);
   }
   if(o.shadow?.map)resources.add(o.shadow.map);
  });
  for(const resource of resources)resource.dispose();
  // A late initialization catch may dispose again after abort. Remove released
  // objects so only newly acquired resources are visited on that second pass.
  scene.clear();
  renderer.renderLists.dispose();renderer.dispose();
  // The canvas belongs exclusively to this world. Release the context as well
  // as authored resources so driver/internal allocations cannot survive unmount.
  if(!renderer.getContext().isContextLost())renderer.forceContextLoss();
 }
 // Let outstanding initialization finish its current await and release newly
 // acquired objects in catch. Never allow it to start drawing after abort.
 const onAbort=dispose;
 signal?.addEventListener('abort',onAbort,{once:true});
 try{checkAbort();
cleanups.push(()=>inputs?.dispose());

let rearOwnerTask=prepareRearMeadowOwner({signal}).catch(error=>{
 if(signal?.aborted)throw error;
 return null; // Keep the exact authored calculation available on decode failure.
});
rearOwnerTask.catch(()=>{});
cleanups.push(()=>{rearOwnerTask=null;});

const horizonTransfer=prepareHorizonTransfer({signal,compact:compactHorizon,inputs});
cleanups.push(()=>horizonTransfer.dispose());
const startupAbort=new AbortController(),startupCacheState={status:depthStretch===2.1?'pending':'unsupported-transform'};
cleanups.push(()=>startupAbort.abort());
let startupTask=depthStretch===2.1?loadStartupData({signal:startupAbort.signal,inputs}).then(data=>{startupCacheState.status='cached';return data;},error=>{if(startupAbort.signal.aborted)throw error;startupCacheState.status='procedural-fallback';startupCacheState.reason=error.message;return null;}):Promise.resolve(null);
startupTask.catch(()=>{});
const depthPivot=85;
const worldZ=z=>depthPivot+(z-depthPivot)*depthStretch;
// Isoluminant living-meadow pigment from the M2 material A/B. Preserve the
// warm incident light and use one shared palette for terrain and both LODs.
const meadowRoot=new T.Color().setRGB(.028073182564412137,.16062359665662096,.059222779169751896);
const meadowTip=new T.Color().setRGB(.16940667140873433,.27177882561685757,.07551854149240232);
const lensFov=fov=>T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(fov)/2)/depthStretch));
const stretchGround=object=>{object.scale.z=depthStretch;object.position.z=depthPivot*(1-depthStretch);};

renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
renderer.info.autoReset=false;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
scene.fog=null;
const camera=referenceCamera.clone(),lookAt=new T.Vector3(referenceLookAt.x,referenceLookAt.y,worldZ(referenceLookAt.z));
// Display-camera depth precision; authored reconstruction camera stays unchanged.
camera.near=2;
const time={value:0},sunDirection=new T.Vector3(-.48,.045,-.87).normalize(),sunColor=new T.Color('#ffd5a0');
const sunlight=new T.DirectionalLight(sunColor,5);sunlight.castShadow=true;sunlight.shadow.mapSize.set(mobile?2048:4096,mobile?2048:4096);Object.assign(sunlight.shadow.camera,{left:-360,right:360,top:240,bottom:-240,near:1,far:11000});sunlight.shadow.normalBias=.16;sunlight.shadow.bias=-.000002;sunlight.shadow.radius=2;scene.add(sunlight,sunlight.target);
const hemi=new T.HemisphereLight('#d9e0db','#1b321c',.015);scene.add(hemi);
const skyLight=createSkyLight({scene,sunDirection,mobile});cleanups.push(()=>skyLight.dispose());
// Stable image handles let tree/grass construction overlap texture I/O.
// The preparation handle owns disposal; the final barrier precedes all uploads.
const textureAbort=new AbortController();cleanups.push(()=>textureAbort.abort());
const treeTextures=prepareTreeTextures({signal:textureAbort.signal,mobile});cleanups.push(()=>treeTextures.dispose());
const atmosphere=createSky(sunDirection,time,{horizontalScale:depthStretch,signal:textureAbort.signal,mobile}),sky=atmosphere.mesh;scene.add(sky);
// No sky capture or texture upload occurs until the readiness barrier below.
// Observe failures immediately and release a texture arriving after disposal.
atmosphere.readyPromise.then(texture=>{if(disposed)texture.dispose();},()=>{});
async function prepareTerrain(){
 // A separate8s cache budget cancelled viable slow transfers and started the
 // expensive fallback tessellator. Allow the caller's45s world deadline to
 // govern preparation; explicit HTTP/checksum failures still use fallback.
 // The local limit also bounds callers that do not supply an AbortSignal.
 const geometry=await loadTerrainGeometry({generate:()=>createTerrainGeometryAsync({signal}),timeoutMs:45000,signal,inputs});
 try{checkAbort();return await adaptTerrainAsync(geometry,undefined,{signal});}
 catch(error){geometry.dispose();throw error;}
}
// Only overlap work when the terrain input is genuinely still in flight.
// Cached/local builds retain their established construction order.
let pendingTurf,turfTask;
const releaseTurf=material=>{for(const value of new Set(Object.values(material).filter(v=>v?.isTexture)))value.dispose();material.dispose();};
const terrainTask=prepareTerrain();terrainTask.catch(()=>{});
if(inputs?.isReady?.('./terrain-cache/geometry.bin.gz')===false){
 turfTask=createTurfMaterial({rootColor:meadowRoot,tipColor:meadowTip}).then(material=>{
  if(disposed){releaseTurf(material);throw new DOMException('Turf preparation aborted','AbortError');}
  pendingTurf=material;return material;
 });
 turfTask.catch(()=>{});
 cleanups.push(()=>{if(pendingTurf){releaseTurf(pendingTurf);pendingTurf=undefined;}});
}
const terrainGeometry=await terrainTask,terrainPositions=terrainGeometry.getAttribute('position'),terrainUv=new Float32Array(terrainPositions.count*2);for(let i=0;i<terrainPositions.count;i++){terrainUv[i*2]=terrainPositions.getX(i)/4;terrainUv[i*2+1]=terrainPositions.getZ(i)/4}terrainGeometry.setAttribute('uv',new T.BufferAttribute(terrainUv,2));
const ground=new T.Mesh(terrainGeometry,await(turfTask??createTurfMaterial({rootColor:meadowRoot,tipColor:meadowTip})));ground.castShadow=true;ground.receiveShadow=false;ground.name='terrain';ground.material.userData.turfUniforms.uTurfCanopyStrength.value=.2;stretchGround(ground);scene.add(ground);pendingTurf=undefined;checkAbort();
const lake=createLake({sunLight:sunlight,sunCoreVisibility:atmosphere.uniforms.uShowSunCore});stretchGround(lake.mesh);scene.add(lake.mesh);cleanups.push(()=>lake.target.dispose());
// Resolve silhouette coverage in the reflection itself, before the unchanged
// wave/filter shader. Query RGBA16F support; MAX_SAMPLES alone does not say
// whether this HDR attachment can use the same count. No extra main pass.
const reflectionGL=renderer.getContext();
const reflectionSamples=reflectionGL.getInternalformatParameter(reflectionGL.RENDERBUFFER,reflectionGL.RGBA16F,reflectionGL.SAMPLES);
lake.target.samples=Math.max(0,...Array.from(reflectionSamples??[]).filter(count=>count<=4));
const meadowTreeSurface=createTerrainSampler(terrainGeometry);
// Only a desktop render-worker with sufficient memory starts this helper.
// Terrain arrays are cloned once; output stem arrays transfer, never copy.
const grassOptions={quality:mobile?'mobile':low?'low':'high',depthStretch,depthPivot};
const parallelGrass=grassPreparationWorker&&!noGrass?grassJob(grassPreparationWorker,
 terrainGeometry.userData.adaptiveTerrain.preparationSampler(),grassOptions,{signal}):null;
cleanups.push(()=>{parallelGrass?.dispose();grassPreparationWorker?.terminate();});
const grassPreparation=parallelGrass?.promise.catch(()=>null);

const observed=[[190,431,66,'column',32],[254,416,39,'round',25],[478,357,31,'round',25],[548,369,16,'round',14],[577,367,17,'round',16],[865,391,49,'column',32],[884,391,38,'column',19],[990,399,29,'column',24],[1075,441,59,'column',35],[1105,432,40,'column',25]];
const placements=observed.map(([x,y,h,shape,w],i)=>{const p=surfacePoint(x,y),metresPerPixel=2*(85-p.z)*Math.tan(Math.PI/8)/720;return{x:p.x,y:meadowTreeSurface(p.x,p.z),z:worldZ(p.z),height:h*metresPerPixel,width:w*metresPerPixel,shape,crownNormalBlend:i<2?.65:0,leafCount:i===0?32:undefined,crownLowering:i===0?.15:.55,crownDepthScale:i===5?.8:1,seed:i===0?313:31+i*17}});
// The footer reference has one near tree to the left and a pair to the
// right. These live behind the initial camera and enter through real parallax.
for(const tree of [
 {x:-37,z:103,height:12,width:6.8,shape:'round',seed:271},
 {x:45,z:105,height:13,width:6.5,shape:'column',seed:293},
 {x:49,z:111,height:11.5,width:5.9,shape:'round',seed:311},
]) placements.push({...tree,y:meadowTreeSurface(tree.x,tree.z),z:worldZ(tree.z)});
// The triangle sampler's tiny barycentric tolerance can exceed vertex extrema
// by roundoff. One metre of conservative headroom dwarfs that error here.
terrainGeometry.computeBoundingBox();
const trees=await createTrees(placements,{preparedTextures:treeTextures,deferTextureReady:true,releaseConstructionData:true,mobile,heightAt:meadowTreeSurface,terrainMaxHeight:terrainGeometry.boundingBox.max.y+1,worldZ,depthStretch,depthPivot,signal});trees.userData.setLeafTintRelaxation(1);scene.add(trees);cleanups.push(()=>trees.userData.dispose());checkAbort();
let grass=null;
let grassResult=await grassPreparation;checkAbort();
if(!noGrass){grass=await createGrassAsync({heightAt,rootHeightAt:meadowTreeSurface,shoreDistance,sunDirection,sunColor,time,quality:mobile?'mobile':low?'low':'high',depthStretch,depthPivot,preparedPacket:grassResult?.packet},{signal});grass.userData.uniforms.uCanopyStrength.value=.2;grass.userData.uniforms.uRootColor.value.copy(meadowRoot);grass.userData.uniforms.uTipColor.value.copy(meadowTip);stretchGround(grass);scene.add(grass);cleanups.push(()=>grass.userData.dispose());checkAbort()}
if(grassResult){
 grass.userData.preparation={mode:'worker',...grassResult.timing};
 // Fulfilled promises keep their result alive. Geometry/patches now own all
 // required arrays; drop packet records so static preparation can release the
 // original vec3 normals after replacing them with its packed vec4 attribute.
 grassResult.packet.records.length=0;grassResult=null;
}
else if(grass)grass.userData.preparation={mode:'serial'};
await grass?.userData.prepareStatic?.(renderer,{signal});checkAbort();
let startupData=await startupTask;startupTask=null;checkAbort();
const farGrass=await createFarGrassAsync({heightAt,rootHeightAt:meadowTreeSurface,rootNormalAt:terrainGeometry.userData.adaptiveTerrain.normalAt,shoreDistance,time,depthStretch,depthPivot,referenceCamera,placement:startupData?.placement,densityScale:mobile ? .2 : .25},{signal});farGrass.userData.uniforms.uCanopyStrength.value=.2;farGrass.userData.uniforms.uRootColor.value.copy(meadowRoot);farGrass.userData.uniforms.uTipColor.value.copy(meadowTip);stretchGround(farGrass);scene.add(farGrass);checkAbort();if(grass){farGrass.userData.uniforms.uRootColor.value=grass.userData.uniforms.uRootColor.value;farGrass.userData.uniforms.uTipColor.value=grass.userData.uniforms.uTipColor.value;}
ground.material.userData.turfUniforms.uTurfWrapStrength.value=0;ground.material.userData.turfUniforms.uTurfScatterStrength.value=.5;
farGrass.userData.uniforms.uWrapStrength.value=0;farGrass.userData.uniforms.uScatterStrength.value=.5;
if(grass){grass.userData.uniforms.uCanopyWrapStrength.value=0;grass.userData.uniforms.uScatter.value=.5;}
// Authored pale thin-leaf transmission; ordinary meadow reflectance stays green.
// The contribution remains shadowed per source and contains no emissive light.
ground.material.userData.turfUniforms.uCanopyTransmissionMix.value=1;
for(const g of [grass,farGrass])if(g)g.userData.uniforms.uCanopyTransmissionMix.value=1;
const nearCanopy=applyNearCanopyOcclusion({ground,grass,depthStretch,depthPivot,opticalDepth:1});
const microcanopy=applyMicrocanopy(ground.material,{strength:.4,depthStretch,depthPivot});
const aerial=await createAtmosphereAsync({visibilityField:startupData?.atmosphere,heightAt,sunDirection,skyRadiance:atmosphere.uniforms.uHaze.value,params:{depthStretch,depthPivotZ:depthPivot,hazeSaturation:.8,mistNearZ:-285,mistFarZ:-355,mistExtinction:.08,mistCenterX:-60,mistWidthX:35,mistRightWidthX:85,mistOutsideWeight:0,hazeMaxLuminance:1}},{signal});if(!noAerial){aerial.apply(ground);aerial.apply(trees);if(grass)aerial.apply(grass);aerial.apply(farGrass);}
cleanups.push(()=>aerial.dispose());startupData=null;checkAbort();
const rearOwnerData=await rearOwnerTask;rearOwnerTask=null;checkAbort();
const rearMeadow=applyRearMeadow({ground,grass,farGrass,ownerAt:rearMeadowOwnerAt,ownerData:rearOwnerData,depthStretch,depthPivot});
cleanups.push(()=>rearMeadow.dispose());
const rearFill=createRearFill({scene,mobile});cleanups.push(()=>rearFill.dispose());
// v629 (client feedback 05.11): soften directional shadow visibility so shaded
// hills read as smooth green slopes instead of hard black patches. Light energy,
// shadow cameras, geometry and PCF kernels stay unchanged; only the visibility
// term is scaled (three r186 LightShadow.intensity -> getShadow shadowIntensity).
sunlight.shadow.intensity=.55;
for(const light of [...skyLight.lights,...rearFill.lights])light.shadow.intensity=.55;
// Three r186 PCF samples native depth textures, never the colour attachment.
// Keep full depth precision/resolution while reducing unused RGBA8 storage to
// R8. WebGLRenderTarget still requires one colour attachment in this renderer.
// This is deliberately bound to the reviewed renderer/shadow implementation.
if(T.REVISION==='186'&&renderer.shadowMap.type===T.PCFShadowMap){
 for(const light of [sunlight,...skyLight.lights,...rearFill.lights]){
  const {x:w,y:h}=light.shadow.mapSize;
  const depth=new T.DepthTexture(w,h,T.UnsignedIntType);
  depth.format=T.DepthFormat;depth.compareFunction=T.LessEqualCompare;
  depth.minFilter=depth.magFilter=T.LinearFilter;
  depth.name=light.name+'.shadowMap';
  light.shadow.map=new T.WebGLRenderTarget(w,h,{
   format:T.RedFormat,type:T.UnsignedByteType,depthTexture:depth,
   minFilter:T.LinearFilter,magFilter:T.LinearFilter,generateMipmaps:false,
  });
 }
 // Preserve alpha-cutout, side and displacement handling in getDepthMaterial.
 // A separate material per source prevents changing a compiled leaf program
 // into a solid terrain program when Three switches shadow casters.
 const depthMaterials=new Map();
 scene.traverse(object=>{
  if(!object.isMesh||!object.castShadow||object.customDepthMaterial||Array.isArray(object.material))return;
  let depth=depthMaterials.get(object.material);
  if(!depth){depth=new T.MeshDepthMaterial({colorWrite:false});depthMaterials.set(object.material,depth);}
  object.customDepthMaterial=depth;
 });
 cleanups.push(()=>{for(const material of depthMaterials.values())material.dispose();});
}

// Exact-index tiles share the fully wrapped terrain material. The parent
// retains full geometry bounds for shadow fitting; only its own draw is empty.
applyTerrainChunks(ground);
applyZeroIncidentGuard([ground,grass,farGrass]);
const skyHorizon=await applySkyHorizon({ground,grass,farGrass,trees,depthStretch,renderer,skyLight,rearMeadow,signal,transfer:horizonTransfer,compact:compactHorizon,deferReady:true});
cleanups.push(()=>skyHorizon.dispose());checkAbort();
// Progressive horizon decode can finish after the first-frame release below.
// Its late WASM decoder must not remain cached for the rest of the visit.
// Consumers already hold their own decoder while decoding; releasing the
// module cache does not invalidate an in-flight consumer.
skyHorizon.readyPromise.then(releaseBinaryDecoder,releaseBinaryDecoder);
compactGrassShadows([grass,farGrass]);
// Specialize only where the complete-site throughput gain is measured.
// Firefox/WebKit retain their established programs: first compilation of the
// specialized variant added 2–4 seconds in the cross-engine cold-context check.
if(/Chrom(?:e|ium)\//.test(globalThis.navigator?.userAgent??'')){
 specializeLightScalars(ground,[ground.material.userData.turfUniforms,skyHorizon.uniforms,rearMeadow.uniforms]);
 for(const g of[grass,farGrass])if(g)specializeLightScalars(g,[g.userData.uniforms,skyHorizon.uniforms,rearMeadow.uniforms]);
 cleanups.push(specializeStaticShadowReceivers([ground,farGrass],{onStaticCompile(shader,material){if(material===ground.material)fuseStaticGroundSkyLighting(shader,{compact:compactHorizon});}}));
}
skyHorizon.uniforms.uSkyHorizonMix.value=0; // fade-in from fields-absent
const depthCoverage=createOpaqueDepthCoverage({ground,trees});cleanups.push(()=>depthCoverage.dispose());
const spotReceivers=!mobile&&/Chrom(?:e|ium)\//.test(globalThis.navigator?.userAgent??'')
 ?specializeSpotReceivers({scene,camera,renderer,ground,trees,grass,farGrass,rearFill},T.ShaderChunk):null;
if(spotReceivers)cleanups.push(()=>spotReceivers.dispose());
const pmrem=new T.PMREMGenerator(renderer),envScene=new T.Scene(),envSky=sky.clone();
// Restrict the reviewed optimization to Chromium. Other engines retain the
// existing programs and first-compilation behavior.
if(/Chrom(?:e|ium)\//.test(globalThis.navigator?.userAgent??'')){const restorePmrem=cachePmremHalfVectors(pmrem,renderer);if(restorePmrem)cleanups.push(restorePmrem);}
// Keep the linear-output sky program alive throughout the solar cycle.
// Share live atmospheric uniforms, isolating only the two disabled sun terms.
envSky.material=sky.material.clone();
envSky.material.uniforms={...sky.material.uniforms,uShowSun:{value:0},uShowSunCore:{value:0}};
envScene.add(envSky);let env=null;
// r186 fromScene always allocates its output, although capture/filter passes
// overwrite the complete target. Retain that output for this one generator.
// Keep the adapter version-bound: a Three upgrade uses the stock allocation
// path until its target lifecycle is reviewed. No global library mutation.
const reuseEnvironment=T.REVISION==='186'&&typeof pmrem._allocateTargets==='function';
if(reuseEnvironment){
 const allocateEnvironment=pmrem._allocateTargets.bind(pmrem);
 pmrem._allocateTargets=()=>env??allocateEnvironment();
}
cleanups.push(()=>{env?.dispose();pmrem.dispose();envSky.material.dispose();});
let solar=0,travel=0,lastSolar=-1,dirty=true;
// Fit sun and sky shadow cameras to the same complete terrain/crown bounds.
// A fixed solar frustum clipped the day shadow across a visible rear hill.
// Terrain vertex positions stay fixed after construction; a camera/light change
// needs a new light-space fit, not another scan of every terrain vertex.
function fitWorldShadows(){if(!ground.geometry.boundingBox)ground.geometry.computeBoundingBox();ground.updateWorldMatrix(true,false);const box=ground.geometry.boundingBox.clone().applyMatrix4(ground.matrixWorld);box.max.y+=40;box.expandByScalar(5);for(const light of [sunlight,...skyLight.lights]){light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);light.shadow.updateMatrices(light);const c=light.shadow.camera,b=new T.Box3();for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])b.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));Object.assign(c,{left:b.min.x,right:b.max.x,bottom:b.min.y,top:b.max.y,near:Math.max(.1,-b.max.z),far:-b.min.z});c.updateProjectionMatrix();}}
function setLight(){
 // Ease the authored solar cycle so emergence and occlusion occupy visible
 // travel time. The endpoint elevations follow the terrain silhouette of
 // the reference camera; these are art-direction values, not astronomy.
 const phase=solar*solar*(3-2*solar),angle=phase*Math.PI,day=Math.sin(angle);
 const daylightEnergy=1+.35*day*day;
 // Start on the actual terrain horizon from the shared initial eye. The
 // correction ends by travel .07, leaving the accepted day and sunset intact.
 // Horizon fitted by ray intersection with the current adaptive terrain.
 const dawnOcclusion=(.039314407587051396-.005)*(1-T.MathUtils.smoothstep(solar,0,.07));
 const horizonDrop=T.MathUtils.lerp(.005,.05450711909413477,phase)*Math.cos(angle)**2+dawnOcclusion;
 sunDirection.set(-.49/depthStretch*Math.cos(angle),(.022+.85*day-horizonDrop)/depthStretch,-.87).normalize();
 sunColor.set('#ffd5a0').lerp(new T.Color('#fff6e2'),day);
 sunlight.color.copy(sunColor);sunlight.intensity=(6-day*2)*daylightEnergy;
 // v627 (client feedback 04.11): at dawn the hemisphere floor was near zero,
 // so far vegetation silhouettes on the hills read as black dots. Keep a
 // dawn minimum and ease it out by solar ~.30; day and dusk are untouched.
 hemi.intensity=(.015+.055*(1-T.MathUtils.smoothstep(phase,.04,.30)))*daylightEnergy;
 sunlight.position.copy(sunDirection).multiplyScalar(5000);sunlight.target.position.set(0,0,0);
 sunlight.shadow.camera.updateProjectionMatrix();
 aerial.setParams({westMistExtinction:.0032*(1-T.MathUtils.smoothstep(phase,.06,.35))});
 atmosphere.update(phase);
 // Scale the authored linear sky and its incident sources together. PMREM and
 // planar reflection consume these same values; exposure stays fixed.
 for(const key of ['uTop','uLeft','uMiddle','uRight','uHaze'])atmosphere.uniforms[key].value.multiplyScalar(daylightEnergy);
 skyLight.update(phase);
 for(const light of skyLight.lights)light.intensity*=daylightEnergy;
 rearFill.update(phase);fitWorldShadows();skyHorizon.update();
 trees.userData.updateLighting([sunlight,...skyLight.lights]);
 lake.material.uniforms.uSunDirection.value.copy(sunDirection);
 lake.material.uniforms.uSunColor.value.copy(sunColor);
 lake.material.uniforms.uSunPower.value=sunlight.intensity;
 if(!reuseEnvironment)env?.dispose();env=pmrem.fromScene(envScene,.04,.1,10000,{size:128});
 scene.environment=env.texture;scene.environmentIntensity=.22+.08*day+.08*(1-day)*(1-phase)+.13*(1-day);
 trees.userData.updateEnvironment(scene.environment,scene.environmentIntensity,phase);
 renderer.shadowMap.needsUpdate=true;lastSolar=solar;
 // A light change also changes the reflected sky and terrain, even when
 // camera and animation time are held fixed.
 dirty=true;
}
// Portrait retains the initial world eye position, so the same ridge hides
// half of the rising sun. Only its framing target and lens change.
function setCamera(){const aspect=width/height,portrait=T.MathUtils.smoothstep(.88-aspect,0,.4),framing=portrait*(1-T.MathUtils.smoothstep(travel,.45,1));camera.fov=lensFov(T.MathUtils.lerp(45,62-10*(1-T.MathUtils.smoothstep(travel,.1,.45)),portrait));if(aspect>16/9)camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov)/2)*(16/9)/aspect));camera.aspect=aspect;// Portrait follows the setting sun; wide views move slightly left to keep
// the solar disc clear of the near crown. The first 65% retains its path.
const sunsetFraming=(1-T.MathUtils.smoothstep(aspect,.9,1.15))*T.MathUtils.smoothstep(travel,.65,.9);
// Final lateral offset selected from projected crown/sun separation on320/390/430.
const meadowShift=T.MathUtils.lerp(-34*(1-T.MathUtils.smoothstep(aspect,.9,1.15))*T.MathUtils.smoothstep(travel,.6,1),-11*(1-T.MathUtils.smoothstep(aspect,.9,1.15)),sunsetFraming)-6*T.MathUtils.smoothstep(aspect,.9,1.15)*T.MathUtils.smoothstep(travel,.65,.85);
camera.position.set(travel*8+meadowShift,37+travel*4+14*Math.sin(Math.PI*travel)**2,worldZ(85+portrait*0+travel*95));lookAt.set(travel*5-50*framing+meadowShift,referenceLookAt.y-framing*5,worldZ(referenceLookAt.z+travel*14));// Keep the physical setting sun in the narrow portrait view. Only yaw
// changes continuously after0.65; the physical solar direction and geometry stay intact.

const currentSolarPhase=solar*solar*(3-2*solar);
const currentSunSlope=(-.49/depthStretch*Math.cos(Math.PI*currentSolarPhase))/.87;
const solarTargetX=camera.position.x+(camera.position.z-lookAt.z)*currentSunSlope;
lookAt.x=T.MathUtils.lerp(lookAt.x,solarTargetX,sunsetFraming);
// Once the observed sunset ends, compose the contact chapter with the
// existing hills below its text. A lens-relative pitch keeps the same
// landscape band across aspect ratios; smoothstep retains reversible C1 motion.
const contactFraming=T.MathUtils.smoothstep(travel,.89,.93);
camera.fov*=1+.1*contactFraming;
// Bring both right-hand crowns inside the wide contact composition.
lookAt.x+=18*contactFraming*T.MathUtils.smoothstep(aspect,.9,1.15);
lookAt.y+=.52*contactFraming*Math.hypot(lookAt.x-camera.position.x,lookAt.z-camera.position.z)*Math.tan(T.MathUtils.degToRad(camera.fov)/2);
camera.lookAt(lookAt);camera.updateProjectionMatrix();camera.updateMatrixWorld()}
function resize(w,h,lowTier=low){
 width=Math.max(1,w);height=Math.max(1,h);low=mobile||lowTier;
 renderer.setPixelRatio(low?1:1.5);renderer.setSize(width,height,false);
 lake.target.setSize(Math.min(low?960:1280,width),Math.min(low?540:720,height));
 setCamera();dirty=true;
}
function restore(){lastSolar=-1;dirty=true;rearFill.invalidateShadows();}
// A conservative full-lake occlusion test, independent of the viewport.
// The actual terrain at one fixed Z is a piecewise-linear ridge. Every
// possible lake point lies inside its geometry AABB. Project that box onto
// the ridge plane from the eye; hide the reflection only when the entire
// projected box is below the lowest terrain point, with a20cm safety margin.
const waterOcclusion=(()=>{
 const barrierZ=110,p=terrainGeometry.attributes.position,index=terrainGeometry.index,points=[];
 for(let k=0;k<index.count;k+=3){
  const ids=[index.getX(k),index.getX(k+1),index.getX(k+2)];
  for(let e=0;e<3;e++){
   const a=ids[e],b=ids[(e+1)%3],za=p.getZ(a),zb=p.getZ(b);
   if(za===barrierZ)points.push([p.getX(a),p.getY(a)]);
   if((za<barrierZ&&zb>barrierZ)||(za>barrierZ&&zb<barrierZ)){
    const t=(barrierZ-za)/(zb-za);points.push([T.MathUtils.lerp(p.getX(a),p.getX(b),t),T.MathUtils.lerp(p.getY(a),p.getY(b),t)]);
   }
  }
 }
 points.sort((a,b)=>a[0]-b[0]);const ridge=[];
 for(const p of points){const last=ridge.at(-1);if(last&&Math.abs(last[0]-p[0])<1e-8)last[1]=Math.min(last[1],p[1]);else ridge.push(p);}
 lake.mesh.geometry.computeBoundingBox();const bounds=lake.mesh.geometry.boundingBox.clone(),eye=new T.Vector3(),stats={barrierZ,knots:ridge.length,occluded:false,margin:null};
 function ridgeAt(x){let lo=0,hi=ridge.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(ridge[m][0]<=x)lo=m;else hi=m;}return T.MathUtils.lerp(ridge[lo][1],ridge[hi][1],(x-ridge[lo][0])/(ridge[hi][0]-ridge[lo][0]));}
 function test(camera){
  camera.getWorldPosition(eye);eye.z=depthPivot+(eye.z-depthPivot)/depthStretch;
  stats.occluded=false;stats.margin=null;
  if(eye.z<=barrierZ+.001||bounds.max.z>=barrierZ-.001||ridge.length<2)return false;
  // The heightfield crossing argument starts from an eye above its domain.
  // Free orbit can leave that domain or go underground: fail open there.
  const eyeGround=terrainGeometry.userData.adaptiveTerrain.heightAt(eye.x,eye.z);
  if(!Number.isFinite(eyeGround)||eye.y<=eyeGround+.2)return false;
  let minX=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const x of[bounds.min.x,bounds.max.x])for(const z of[bounds.min.z,bounds.max.z]){
   const t=(eye.z-barrierZ)/(eye.z-z);const px=T.MathUtils.lerp(eye.x,x,t),py=T.MathUtils.lerp(eye.y,bounds.max.y,t);
   minX=Math.min(minX,px);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);
  }
  if(minX<ridge[0][0]||maxX>ridge.at(-1)[0])return false;
  let minY=Math.min(ridgeAt(minX),ridgeAt(maxX));
  for(const[x,y]of ridge)if(x>minX&&x<maxX)minY=Math.min(minY,y);
  stats.margin=minY-maxY;stats.occluded=stats.margin>.2;return stats.occluded;
 }
 return{test,stats};
})();
// Frustum visibility, distance density and topology belong to the camera of
// each draw. The reflected eye may be farther from the meadow than the main
// eye; update before Three builds that pass's render list, then again for the
// main pass. Shadow casters are unaffected (grass does not cast shadows).
scene.onBeforeRender=(passRenderer,passScene,passCamera)=>{
 spotReceivers?.update();
 depthCoverage.update(passRenderer);
 grass?.userData.update?.(passCamera);
 farGrass.userData.update?.(passCamera,passRenderer);
};
let lastReflection=-1,lastReflectionMs=-1e9,frames=0,state={};
// Historical counter names remain for existing consumers. Their scopes are
// submitted draws, not exclusive GPU timings: setLight also draws the atlas,
// and Three can update shared shadow maps inside either scene render.
const counterScopes=Object.freeze({environmentCalls:'lighting setup: tree atlas + PMREM',reflectionCalls:'reflection render including any shared shadow updates',mainCalls:'main render including any pending shadow updates',frames:'submitted main scene renders; not GPU completion or presentation'});
function draw(){
 if(disposed)return state;
 renderer.info.reset();
 // A light pose must depend on its current solar phase, never approach direction.
 if(lastSolar!==solar)setLight();
 const environmentCalls=renderer.info.render.calls,environmentTriangles=renderer.info.render.triangles;
 // Apply streamed lighting before both views sample it.
 horizonFadeStep();
 lake.material.uniforms.uTime.value=time.value;
 const waterHidden=waterOcclusion.test(camera);
 // v634 (client feedback 06.11): camera/light changes refresh the planar
 // reflection on every scroll frame, so the reflected shore cannot lag a frame.
 // The 30 Hz cap applies only to idle wave animation. Smaller target (desktop
 // 1920->1280) and a wider footprint keep this cheaper than v628 and smooth
 // the reflected shore edge. Saved target and uMatrix are updated together.
 const nowMs=performance.now();
 const wantReflection=!waterHidden&&(dirty||time.value-lastReflection>.1);
 const reflected=wantReflection&&(dirty||nowMs-lastReflectionMs>=1000/30);
 if(waterHidden)dirty=false;
 if(reflected){lake.reflect(renderer,scene,camera,lookAt);lastReflection=time.value;lastReflectionMs=nowMs;dirty=false;}
 const reflectionCalls=renderer.info.render.calls-environmentCalls,reflectionTriangles=renderer.info.render.triangles-environmentTriangles;
 renderer.render(scene,camera);frames++;
 state={solar,travel,time:time.value,frames,depthStretch,waterOccluded:waterHidden,waterOcclusionMargin:waterOcclusion.stats.margin,fov:camera.fov,reflectionRendered:reflected,environmentCalls,environmentTriangles,reflectionCalls,reflectionTriangles,camera:camera.position.toArray(),target:lookAt.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,mainCalls:renderer.info.render.calls-reflectionCalls-environmentCalls,mainTriangles:renderer.info.render.triangles-reflectionTriangles-environmentTriangles,trees:trees.userData.stats,grass:grass?.userData.stats,farGrass:farGrass.userData.stats};
 return state;
}
function renderState({sun=solar,move=travel,time:clock=time.value,orbit=0}={},force=false){
 if(disposed)return state;
 if(![sun,move,clock,orbit].every(Number.isFinite))throw new TypeError('Non-finite C7 state');
 const nextMove=T.MathUtils.clamp(move,0,1);
 const changed=travel!==nextMove||force||orbit!==0;
 // Light stages follow a fixed 256-step solar grid; camera travel stays
 // continuous. Each grid step is one PMREM/atlas/shadow regeneration, so a
 // slow scroll no longer recomputes the whole lighting rig every frame.
 solar=Math.round(T.MathUtils.clamp(sun,0,1)*256)/256;travel=nextMove;time.value=clock;
 // v617-p1 (client feedback 01.11): at dawn the low crown shadow resolves into
 // black dapples on the lawn. Keep the shadow soft while the sun is low so the
 // shade reads as one even tone; day shadows return to the crisp PCF kernel.
 sunlight.shadow.radius=2+10*(1-T.MathUtils.smoothstep(solar,.18,.34));
 if(changed){setCamera();camera.position.x+=orbit;camera.lookAt(lookAt);dirty=true;}
 return draw();
}
// Finish sunset while the authored clear-flight window is still visible,
// before the contact copy. Monotone: linear dawn pacing, then an eased
// Hermite within the final window; one solar value still owns disc, direct
// light, sky, shadows and reflection.
// v617 (client feedback 01.11): the first half of the scroll runs dawn on a
// 20% faster clock, so the morning establishes itself earlier; the final
// sunset window keeps the authored curve but is entered on a higher phase.
function solarForTravel(progress){
 const start=.83,end=.905;
 const flat=progress+Math.min(progress,.5)*.2;
 if(progress<=start)return flat;
 if(progress>=end)return 1;
 const t=(progress-start)/(end-start),m=(end-start)/(1-start);
 const s0=start+Math.min(start,.5)*.2;
 return s0+(1-s0)*((-2*t*t*t+3*t*t)+m*(t*t*t-2*t*t+t));
}
let heroIdle=true; // v617: while the visitor stays at the top, the sun keeps climbing
const world={solarForTravel,depthCoverage,skyHorizon,waterOcclusion,scene,camera,renderer,ground,lake,trees,grass,farGrass,skyLight,placements,sunlight,hemi,atmosphere,aerial,rearMeadow,rearFill,depthStretch,
 spotReceivers,
 get state(){return state;},
 set(values){return renderState(values,true);},
 renderState,
 renderCamera(clock,target){time.value=clock;lookAt.copy(target);dirty=true;return draw();},
 render(progress,clock){
  if(progress>.01)heroIdle=false;
  const idle=heroIdle&&progress===0?Math.min(.05,Math.max(0,clock)*.005):0;
  return renderState({sun:Math.max(solarForTravel(progress),idle),move:progress,time:clock},progress===0&&clock===0);
},
 resize,restore,dispose,
 ready:()=>!disposed,
 status:()=>disposed?'failed':'ready',
 // Geometry density is fixed at initialization to avoid rebuilding the meadow
 // during rotation. Mobile keeps its DPR1 budget; desktop output follows resize.
 diagnostics:()=>({...state,counterScopes,grassPreparation:grass?.userData.preparation,startupDecoder:binaryDecoderDiagnostics(),startupCache:{...startupCacheState},programs:renderer.info.programs?.length??0,version:'v613-deferred-image-readiness',horizonQuality:compactHorizon?'compact':'full',profile:mobile?'mobile':'full',quality:low?'low':'normal',geometryQuality,lens:{fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far},memory:{...renderer.info.memory},depthCoverage:{...depthCoverage.state}}),
};
// Upload immutable image/data textures before the first combined render.
// Yield per texture so driver uploads do not accumulate in one UI task.
// Render targets own their allocation and must not pass through initTexture.
await Promise.all([atmosphere.readyPromise,trees.userData.readyPromise]);checkAbort();
// Atlas/PMREM now have their real images; horizon samplers have stable
// identities. Compile the final programs concurrently with field decode.
resize(width,height,low);setLight();spotReceivers?.update();
const programsReady=renderer.compileAsync(scene,camera);programsReady.catch(()=>{});
// Progressive first frame (v628): horizon fields stream in after the first
// draw; uSkyHorizonMix fades 0->1 over HORIZON_FADE_MS so hill shadows ease
// in. The final frame equals the formerly blocking build.
let horizonFade=-1;const HORIZON_FADE_MS=800;
skyHorizon.readyPromise.then(()=>{
 if(disposed)return;
 // A zero clock can mean reduced motion, with no later draw to finish the fade.
 // Publish the settled fields immediately and refresh the main/reflected pair.
 if(time.value===0){
  horizonFade=-1;skyHorizon.uniforms.uSkyHorizonMix.value=1;
  if(frames)world.set({sun:solar,move:travel,time:0});
 }else horizonFade=performance.now();
},()=>{});
const horizonFadeStep=()=>{
 if(horizonFade<0)return;
 const done=(performance.now()-horizonFade)/HORIZON_FADE_MS;
 const next=Math.max(0,Math.min(1,done));
 if(done>=1)horizonFade=-1;
 if(skyHorizon.uniforms.uSkyHorizonMix.value!==next){skyHorizon.uniforms.uSkyHorizonMix.value=next;dirty=true;}
};
const preparedTextures=new Set();
const collectTexture=value=>{
 if(value?.isTexture&&!value.isRenderTargetTexture)preparedTextures.add(value);
};
scene.traverse(object=>{
 for(const material of(object.material?(Array.isArray(object.material)?object.material:[object.material]):[])){
  Object.values(material).forEach(collectTexture);
  for(const group of[material.uniforms,...Object.values(material.userData)])
   if(group&&typeof group==='object')for(const uniform of Object.values(group))collectTexture(uniform?.value);
 }
});
for(const uniform of Object.values(skyHorizon.uniforms))collectTexture(uniform?.value);
for(const texture of preparedTextures){
 checkAbort();renderer.initTexture(texture);
}
// One pause for message processing instead of one timeout per texture:
// per-texture yields cost ~0.3s of pure timer overhead on the worker.
await new Promise(resolve=>setTimeout(resolve,0));checkAbort();
await programsReady;checkAbort();
world.set({sun:0,move:0,time:0});
releaseBinaryDecoder();
return world;

 }catch(error){dispose();throw error;}
}

// CPU-only entry for the one-shot preparation worker. The same generator,
// seed, topology and interpolation run here; renderer creation is not invoked.
export async function prepareC7Grass(packet,options){
 const start=performance.now();
 const group=await createGrassAsync({...options,heightAt,rootHeightAt:samplerFromPacket(packet),shoreDistance,time:{value:0}});
 try {const built=performance.now(),result=packGrass(group),buffers=packetBuffers(result);
  return {group,packet:result,buffers,timing:{buildMs:built-start,outputBytes:buffers.reduce((n,b)=>n+b.byteLength,0)}};
 }catch(error){group.userData.dispose();throw error;}
}
