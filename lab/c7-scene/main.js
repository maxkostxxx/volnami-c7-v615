import './shadow-disk.js';
import * as T from 'three';
import {createSky} from './sky.js';
import {adaptTerrain} from './adaptive-terrain.js';
import {loadTerrainGeometry} from './terrain-cache.js';
import {createTerrainSampler} from './terrain-sampler.js';
import {createAtmosphere} from './atmosphere.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createTerrainGeometry,heightAt,shoreDistance,surfacePoint,referenceCamera,referenceLookAt,rearMeadowOwnerAt} from './terrain.js';
import {createTurfMaterial} from './materials.js';
import {createLake} from './lake.js';
import {createTrees} from './trees.js';
import {createSkyLight} from './sky-light.js';
import {createFarGrass} from './far-grass.js';
import {applyNearCanopyOcclusion} from './canopy-occlusion.js';
import {applyMicrocanopy} from './microcanopy.js';
import {applyRearMeadow} from './rear-meadow.js';
import {createRearFill} from './rear-fill.js';

const query=new URLSearchParams(location.search),canvas=document.querySelector('canvas');
const depthStretch=Number(query.get('depth')??2.1),depthPivot=85;
const worldZ=z=>depthPivot+(z-depthPivot)*depthStretch;
// Isoluminant living-meadow pigment from the M2 material A/B. Preserve the
// warm incident light and use one shared palette for terrain and both LODs.
const meadowRoot=new T.Color().setRGB(.028073182564412137,.16062359665662096,.059222779169751896);
const meadowTip=new T.Color().setRGB(.16940667140873433,.27177882561685757,.07551854149240232);
const lensFov=fov=>T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(fov)/2)/depthStretch));
const stretchGround=object=>{object.scale.z=depthStretch;object.position.z=depthPivot*(1-depthStretch);};
if(query.has('clean'))document.body.classList.add('clean');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
renderer.info.autoReset=false;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new T.Scene();scene.fog=null;
const camera=referenceCamera.clone(),lookAt=new T.Vector3(referenceLookAt.x,referenceLookAt.y,worldZ(referenceLookAt.z));
// Display-camera depth precision; authored reconstruction camera stays unchanged.
camera.near=2;
const controls=new OrbitControls(camera,canvas);controls.target.copy(lookAt);controls.enabled=false;controls.enableDamping=true;
const time={value:0},sunDirection=new T.Vector3(-.48,.045,-.87).normalize(),sunColor=new T.Color('#ffd5a0');
const sunlight=new T.DirectionalLight(sunColor,5);sunlight.castShadow=true;sunlight.shadow.mapSize.set(4096,4096);Object.assign(sunlight.shadow.camera,{left:-360,right:360,top:240,bottom:-240,near:1,far:11000});sunlight.shadow.normalBias=.16;sunlight.shadow.bias=-.000002;sunlight.shadow.radius=2;scene.add(sunlight,sunlight.target);
const hemi=new T.HemisphereLight('#d9e0db','#1b321c',.015);scene.add(hemi);
const skyLight=createSkyLight({scene,sunDirection});
const atmosphere=createSky(sunDirection,time,{horizontalScale:depthStretch}),sky=atmosphere.mesh;scene.add(sky);
await atmosphere.readyPromise;
const terrainGeometry=adaptTerrain(await loadTerrainGeometry({generate:createTerrainGeometry})),terrainPositions=terrainGeometry.getAttribute('position'),terrainUv=new Float32Array(terrainPositions.count*2);for(let i=0;i<terrainPositions.count;i++){terrainUv[i*2]=terrainPositions.getX(i)/4;terrainUv[i*2+1]=terrainPositions.getZ(i)/4}terrainGeometry.setAttribute('uv',new T.BufferAttribute(terrainUv,2));
const ground=new T.Mesh(terrainGeometry,await createTurfMaterial({rootColor:meadowRoot,tipColor:meadowTip}));ground.castShadow=true;ground.receiveShadow=true;ground.name='terrain';ground.material.userData.turfUniforms.uTurfCanopyStrength.value=.2;stretchGround(ground);scene.add(ground);
const lake=createLake({sunLight:sunlight,sunCoreVisibility:atmosphere.uniforms.uShowSunCore});stretchGround(lake.mesh);scene.add(lake.mesh);
const meadowTreeSurface=createTerrainSampler(terrainGeometry);
const observed=[[190,431,66,'column',30],[254,416,39,'round',25],[478,357,31,'round',25],[548,369,16,'round',14],[577,367,17,'round',16],[865,391,49,'column',31],[884,391,38,'round',19],[990,399,29,'column',20],[1075,441,59,'column',29],[1105,432,40,'column',20]];
const placements=observed.map(([x,y,h,shape,w],i)=>{const p=surfacePoint(x,y),metresPerPixel=2*(85-p.z)*Math.tan(Math.PI/8)/720;return{x:p.x,y:meadowTreeSurface(p.x,p.z),z:worldZ(p.z),height:h*metresPerPixel,width:w*metresPerPixel,shape,leafCount:i===0?32:undefined,crownLowering:i===0?.15:.55,seed:i===0?313:31+i*17}});
// The footer reference has one near tree to the left and a pair to the
// right. These live behind the initial camera and enter through real parallax.
for(const tree of [
 {x:-37,z:103,height:12,width:6.8,shape:'round',seed:271},
 {x:45,z:105,height:13,width:6.5,shape:'column',seed:293},
 {x:49,z:111,height:11.5,width:5.9,shape:'round',seed:311},
]) placements.push({...tree,y:meadowTreeSurface(tree.x,tree.z),z:worldZ(tree.z)});
const trees=await createTrees(placements,{heightAt:meadowTreeSurface,worldZ,depthStretch,depthPivot});trees.userData.setLeafTintRelaxation(1);scene.add(trees);
let grass=null;
if(!query.has('no-grass')){const{createGrass}=await import('./grass.js');grass=createGrass({heightAt,rootHeightAt:meadowTreeSurface,shoreDistance,sunDirection,sunColor,time,quality:'high',depthStretch,depthPivot});grass.userData.uniforms.uCanopyStrength.value=.2;grass.userData.uniforms.uRootColor.value.copy(meadowRoot);grass.userData.uniforms.uTipColor.value.copy(meadowTip);stretchGround(grass);scene.add(grass)}
const farGrass=createFarGrass({heightAt,rootHeightAt:meadowTreeSurface,rootNormalAt:terrainGeometry.userData.adaptiveTerrain.normalAt,shoreDistance,time,depthStretch,depthPivot,referenceCamera});farGrass.userData.uniforms.uCanopyStrength.value=.2;farGrass.userData.uniforms.uRootColor.value.copy(meadowRoot);farGrass.userData.uniforms.uTipColor.value.copy(meadowTip);stretchGround(farGrass);scene.add(farGrass);if(grass){farGrass.userData.uniforms.uRootColor.value=grass.userData.uniforms.uRootColor.value;farGrass.userData.uniforms.uTipColor.value=grass.userData.uniforms.uTipColor.value;}
ground.material.userData.turfUniforms.uTurfWrapStrength.value=0;ground.material.userData.turfUniforms.uTurfScatterStrength.value=.5;
farGrass.userData.uniforms.uWrapStrength.value=0;farGrass.userData.uniforms.uScatterStrength.value=.5;
if(grass){grass.userData.uniforms.uCanopyWrapStrength.value=0;grass.userData.uniforms.uScatter.value=.5;}
// Authored pale thin-leaf transmission; ordinary meadow reflectance stays green.
// The contribution remains shadowed per source and contains no emissive light.
ground.material.userData.turfUniforms.uCanopyTransmissionMix.value=1;
for(const g of [grass,farGrass])if(g)g.userData.uniforms.uCanopyTransmissionMix.value=1;
const nearCanopy=applyNearCanopyOcclusion({ground,grass,depthStretch,depthPivot,opticalDepth:1});
const microcanopy=applyMicrocanopy(ground.material,{strength:.5,depthStretch,depthPivot});
const aerial=createAtmosphere({heightAt,sunDirection,skyRadiance:atmosphere.uniforms.uHaze.value,params:{depthStretch,depthPivotZ:depthPivot,hazeSaturation:.8,mistNearZ:-285,mistFarZ:-355,mistExtinction:.08,mistCenterX:-60,mistWidthX:35,mistOutsideWeight:0,hazeMaxLuminance:1}});if(!query.has('no-aerial')){aerial.apply(ground);aerial.apply(trees);if(grass)aerial.apply(grass);aerial.apply(farGrass);}
const rearMeadow=applyRearMeadow({ground,grass,farGrass,ownerAt:rearMeadowOwnerAt,depthStretch,depthPivot});
const rearFill=createRearFill({scene});
// Exact-index tiles share the fully wrapped terrain material. The parent
// retains full geometry bounds for shadow fitting; only its own draw is empty.
const{applyTerrainChunks}=await import('./terrain-chunks.js');applyTerrainChunks(ground);
const{applyZeroIncidentGuard}=await import('./direct-zero-guard.js');applyZeroIncidentGuard([ground,grass,farGrass]);
const{applySkyHorizon}=await import('./sky-horizon.js');const skyHorizon=await applySkyHorizon({ground,grass,farGrass,trees,depthStretch,renderer,skyLight,rearMeadow});
const pmrem=new T.PMREMGenerator(renderer),envScene=new T.Scene(),envSky=sky.clone();
// Keep the linear-output sky program alive throughout the solar cycle.
// Share live atmospheric uniforms, isolating only the two disabled sun terms.
envSky.material=sky.material.clone();
envSky.material.uniforms={...sky.material.uniforms,uShowSun:{value:0},uShowSunCore:{value:0}};
envScene.add(envSky);let env=null;
let solar=Number(query.get('sun')??0),travel=Number(query.get('travel')??0),lastSolar=-1,dirty=true;
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
 const horizonDrop=T.MathUtils.lerp(.03861850296119363,.05450711909413477,phase)*Math.cos(angle)**2;
 sunDirection.set(-.49/depthStretch*Math.cos(angle),(.022+.85*day-horizonDrop)/depthStretch,-.87).normalize();
 sunColor.set('#ffd5a0').lerp(new T.Color('#fff6e2'),day);
 sunlight.color.copy(sunColor);sunlight.intensity=6-day*2;
 sunlight.position.copy(sunDirection).multiplyScalar(5000);sunlight.target.position.set(0,0,0);
 sunlight.shadow.camera.updateProjectionMatrix();
 atmosphere.update(phase);skyLight.update(phase);rearFill.update(phase);fitWorldShadows();skyHorizon.update();
 trees.userData.updateLighting([sunlight,...skyLight.lights]);
 lake.material.uniforms.uSunDirection.value.copy(sunDirection);
 lake.material.uniforms.uSunColor.value.copy(sunColor);
 lake.material.uniforms.uSunPower.value=sunlight.intensity;
 env?.dispose();env=pmrem.fromScene(envScene,.04,.1,10000,{size:128});
 scene.environment=env.texture;scene.environmentIntensity=.22+.08*day+.08*(1-day)*(1-phase);
 renderer.shadowMap.needsUpdate=true;lastSolar=solar;
}
// Portrait retains the initial world eye position, so the same ridge hides
// half of the rising sun. Only its framing target and lens change.
function setCamera(){const aspect=innerWidth/innerHeight,portrait=T.MathUtils.smoothstep(.88-aspect,0,.4),framing=portrait*(1-T.MathUtils.smoothstep(travel,.45,1));camera.fov=lensFov(T.MathUtils.lerp(45,62,portrait));if(aspect>16/9)camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov)/2)*(16/9)/aspect));camera.aspect=aspect;// A narrow final crop follows the left meadow tree through real camera
// translation; the first 60% of the journey and all wide layouts retain their path.
const meadowShift=-34*(1-T.MathUtils.smoothstep(aspect,.9,1.15))*T.MathUtils.smoothstep(travel,.6,1);
camera.position.set(travel*8+meadowShift,37+travel*4+14*Math.sin(Math.PI*travel)**2,worldZ(85+portrait*0+travel*95));lookAt.set(travel*5-50*framing+meadowShift,referenceLookAt.y-framing*5,worldZ(referenceLookAt.z+travel*14));camera.lookAt(lookAt);camera.updateProjectionMatrix();camera.updateMatrixWorld();controls.target.copy(lookAt)}
function resize(){renderer.setPixelRatio(1.5);renderer.setSize(innerWidth,innerHeight);lake.target.setSize(Math.min(1920,innerWidth),Math.min(1080,innerHeight));setCamera();dirty=true}
addEventListener('resize',resize);resize();setLight();
// Render-target pixels are lost with the context; regenerate IBL and shadows.
canvas.addEventListener('webglcontextrestored',()=>{lastSolar=-1;dirty=true;rearFill.invalidateShadows();});
document.querySelector('#sun').value=solar;document.querySelector('#travel').value=travel;
document.querySelector('#sun').oninput=e=>{solar=Number(e.target.value);dirty=true};document.querySelector('#travel').oninput=e=>{travel=Number(e.target.value);controls.enabled=false;setCamera();dirty=true};document.querySelector('#orbit').onclick=()=>{controls.enabled=!controls.enabled};document.querySelector('#reset').onclick=()=>{controls.enabled=false;travel=0;setCamera();dirty=true};
const frozen=query.has('freeze')||matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 grass?.userData.update?.(passCamera);
 farGrass.userData.update?.(passCamera,passRenderer);
};
let lastReflection=-1,lastFrame=performance.now(),frames=0;
// The water, wind and clouds are analytic time fields, not a stepped physics
// simulation. A dt cap made them run slower when a GPU missed frames.
// Hidden tabs pause; returning resumes from the current animation time.
addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(!document.hidden)dirty=true;});
function render(ms){if(document.hidden||(frozen&&!dirty&&!controls.enabled&&Math.abs(lastSolar-solar)<=.001))return;renderer.info.reset();const dt=Math.max(0,(ms-lastFrame)/1000);lastFrame=ms;if(!frozen)time.value+=dt;if(controls.enabled){controls.update();lookAt.copy(controls.target);dirty=true}if(Math.abs(lastSolar-solar)>.001)setLight();const environmentCalls=renderer.info.render.calls,environmentTriangles=renderer.info.render.triangles;lake.material.uniforms.uTime.value=time.value;
 const waterHidden=waterOcclusion.test(camera),reflected=!waterHidden&&(dirty||time.value-lastReflection>.1);if(waterHidden)dirty=false;if(reflected){lake.reflect(renderer,scene,camera,lookAt);lastReflection=time.value;dirty=false}const reflectionCalls=renderer.info.render.calls-environmentCalls,reflectionTriangles=renderer.info.render.triangles-environmentTriangles;renderer.render(scene,camera);frames++;window.sceneLab.state={solar,travel,time:time.value,frames,depthStretch,waterOccluded:waterHidden,waterOcclusionMargin:waterOcclusion.stats.margin,fov:camera.fov,reflectionRendered:reflected,environmentCalls,environmentTriangles,reflectionCalls,reflectionTriangles,camera:camera.position.toArray(),target:lookAt.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,mainCalls:renderer.info.render.calls-reflectionCalls-environmentCalls,mainTriangles:renderer.info.render.triangles-reflectionTriangles-environmentTriangles,trees:trees.userData.stats,grass:grass?.userData.stats,farGrass:farGrass.userData.stats};}
window.sceneLab={skyHorizon,waterOcclusion,scene,camera,renderer,ground,lake,trees,grass,farGrass,skyLight,placements,sunlight,hemi,atmosphere,aerial,rearMeadow,rearFill,depthStretch,set({sun=solar,move=travel,orbit=0,time:clock=0}={}){solar=sun;travel=move;controls.enabled=false;setCamera();camera.position.x+=orbit;camera.lookAt(lookAt);time.value=clock;dirty=true;render(performance.now());return this.state;},state:{}};
await renderer.compileAsync(scene,camera);lastFrame=performance.now();render(lastFrame);document.body.classList.add('ready');renderer.setAnimationLoop(render);
