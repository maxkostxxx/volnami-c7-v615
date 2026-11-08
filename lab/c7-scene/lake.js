import * as T from 'three';
import {bank,WATER_LEVEL,shoreDistance} from './terrain.js';

export function createLake({sunLight,sunCoreVisibility,solarSpecularScale=.022,solarGlowScale=.08,microRippleStrength=.5,reflectionFootprint=.002}={}){
 // Preserve all original water rings and append a3m overlap under dry
 // ground. Independent terrain triangles cross the lake level outside the
 // sampled polygon; depth testing now closes the exposed underwater strip.
 const positions=[],distances=[],indices=[],N=bank.length,R=80;
 for(let j=0;j<=R+1;j++)for(let i=0;i<=N;i++){const b=bank[i%N],radius=Math.hypot(b.x,b.z+50),t=j<=R?j/R:1+3/Math.max(1,radius),x=b.x*t,z=-50+(b.z+50)*t;positions.push(x,WATER_LEVEL,z);distances.push(Math.max(0,-shoreDistance(x,z)));if(j<R+1&&i<N){const a=j*(N+1)+i,b=a+N+1;indices.push(a,a+1,b,a+1,b+1,b)}}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('aDistance',new T.Float32BufferAttribute(distances,1));geometry.setIndex(indices);
 const target=new T.WebGLRenderTarget(1280,720,{type:T.HalfFloatType,generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
 target.texture.colorSpace=T.LinearSRGBColorSpace;
 const wave=`
 uniform float uLongWaveStrength;
 vec3 waves(vec2 p,float t,float d){
   float fade=smoothstep(0.,3.,d);vec3 w=vec3(0.);
   vec4 a[4]=vec4[4](vec4(.19,.07,.008,.22),vec4(-.13,.27,.006,.29),vec4(1.1,.45,.0014,.6),vec4(-1.7,1.3,.0008,.76));
   for(int i=0;i<4;i++){
     float phase=dot(p,a[i].xy)-t*a[i].w+float(i)*1.83;
     float response=1.;
     #ifdef C7_WATER_FRAGMENT
       vec2 gradient=vec2(dFdx(phase),dFdy(phase));
       response=exp(-.125*dot(gradient,gradient));
     #endif
     w+=vec3(sin(phase),cos(phase)*a[i].xy)*(a[i].z*response);
   }
   return w*(fade*uLongWaveStrength);
 }`;
 // Dark organic substrate in linear RGB. The former bright bed produced a
 // pale shoreline rim at low depth; Fresnel, scattering and incident light
 // remain unchanged. This is authored reflectance, not measured sediment.
 const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{uLongWaveStrength:{value:.12},uSunShadowMap:{value:null},uSunShadowMatrix:{value:new T.Matrix4()},uSunShadowTexel:{value:new T.Vector2()},uSunShadowBias:{value:0},uSunNormalBias:{value:0},uSunShadowReady:{value:0},uTime:{value:0},uReflection:{value:target.texture},uMatrix:{value:new T.Matrix4()},uSunDirection:{value:new T.Vector3()},uSunColor:{value:new T.Color()},uSunPower:{value:5},uSolarSpecularScale:{value:solarSpecularScale},uSolarGlowScale:{value:solarGlowScale},uEnvironment:{value:target.texture},uEnvironmentReady:{value:0},uEnvironmentTexel:{value:new T.Vector2(1/768,1/1024)},uEnvironmentMaxMip:{value:8},uWaterView:{value:0},uAbsorption:{value:new T.Vector3(.08,.035,.018)},uScattering:{value:new T.Vector3(.045,.045,.045)},uBedAlbedo:{value:new T.Vector3(.06,.055,.035)}},
 vertexShader:`uniform float uTime;attribute float aDistance;varying vec3 vWorld;varying float vDistance;${wave}void main(){vDistance=aDistance;vWorld=(modelMatrix*vec4(position,1.)).xyz;vWorld.y+=waves(vWorld.xz,uTime,aDistance).x;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
 fragmentShader:`uniform float uTime,uSunPower,uSolarSpecularScale,uSolarGlowScale,uEnvironmentReady,uEnvironmentMaxMip,uWaterView;uniform sampler2D uReflection,uEnvironment;uniform mat4 uMatrix;uniform vec2 uEnvironmentTexel;uniform vec3 uSunDirection,uSunColor,uAbsorption,uScattering,uBedAlbedo;varying vec3 vWorld;varying float vDistance;
 #include <common>
 #define ENVMAP_TYPE_CUBE_UV
 #define CUBEUV_TEXEL_WIDTH uEnvironmentTexel.x
 #define CUBEUV_TEXEL_HEIGHT uEnvironmentTexel.y
 #define CUBEUV_MAX_MIP uEnvironmentMaxMip
 #include <cube_uv_reflection_fragment>
 #define C7_WATER_FRAGMENT
 ${wave}
 // Reuse the r186 native depth-comparison texture rendered for the sun.
 // Occlusion modulates only direct solar energy, never the sky reflection.
 uniform highp sampler2DShadow uSunShadowMap;
 uniform mat4 uSunShadowMatrix;
 uniform vec2 uSunShadowTexel;
 uniform float uSunShadowBias,uSunNormalBias,uSunShadowReady;
 float waterSunVisibility(){
   if(uSunShadowReady<.5)return 1.;
   vec4 q=uSunShadowMatrix*vec4(vWorld+vec3(0.,uSunNormalBias,0.),1.);
   q.xyz/=q.w;q.z+=uSunShadowBias;
   if(q.x<0.||q.x>1.||q.y<0.||q.y>1.||q.z<0.||q.z>1.)return 1.;
   vec2 t=uSunShadowTexel;
   return (texture(uSunShadowMap,q.xyz)
     +texture(uSunShadowMap,vec3(q.xy+vec2(t.x,0.),q.z))
     +texture(uSunShadowMap,vec3(q.xy-vec2(t.x,0.),q.z))
     +texture(uSunShadowMap,vec3(q.xy+vec2(0.,t.y),q.z))
     +texture(uSunShadowMap,vec3(q.xy-vec2(0.,t.y),q.z)))*.2;
 }
 const float IOR=1.333;
 float waterFresnel(float c){float ct=sqrt(1.-(1.-c*c)/(IOR*IOR));float rs=(c-IOR*ct)/(c+IOR*ct),rp=(IOR*c-ct)/(IOR*c+ct);return .5*(rs*rs+rp*rp);}
 // Homogeneous single scattering. Each light traverses the water down to the
 // scattering point and then back along the refracted eye ray. The integral
 // is analytic, including extinction on both legs, not an unlit water tint.
 void illuminateWater(vec3 incident,vec3 light,float depth,float cosEye,
   inout vec3 bedIrradiance,inout vec3 scattered){
   float cosAir=max(0.,light.y);if(cosAir<=0.)return;
   float cosWater=sqrt(1.-(1.-cosAir*cosAir)/(IOR*IOR));
   float transmission=1.-waterFresnel(cosAir);
   vec3 sigma=uAbsorption+uScattering;
   bedIrradiance+=incident*(transmission*cosAir)*exp(-sigma*depth/cosWater);
   float path=depth/cosEye,rate=1.+cosEye/cosWater;
   vec3 integral=(1.-exp(-sigma*path*rate))/(sigma*rate);
   // Isotropic phase 1/(4*pi); refraction's solid-angle Jacobian cancels
   // the n^2 radiance factor, leaving cosAir/cosWater for incident flux.
   scattered+=incident*(transmission*cosAir/cosWater)*uScattering*integral/(4.*PI);
 }
 void main(){vec3 w=waves(vWorld.xz,uTime,vDistance);vec3 n=normalize(vec3(-w.y,1.,-w.z)),v=normalize(cameraPosition-vWorld);float cosI=max(.001,dot(n,v));float cosT=sqrt(1.-(1.-cosI*cosI)/(IOR*IOR));float f=waterFresnel(cosI);
 vec4 clip=uMatrix*vec4(vWorld,1.);vec2 uv=clip.xy/clip.w*.5+.5;uv+=w.yz*vec2(.25,.14);vec3 reflection=texture2D(uReflection,clamp(uv,.001,.999)).rgb;
 float depth=min(12.,vDistance*.35);vec3 sigma=uAbsorption+uScattering;
 vec3 bedIrradiance=vec3(0.),scattered=vec3(0.);
 // Eight deterministic samples of the actual sky PMREM, with solar core hidden.
 // PMREM contains linear scene radiance; the reflection target is linear too.
 // Tone mapping occurs once, after reflection + transmission have been added.
 for(int i=0;i<8;i++){
   float y=(float(i)+.5)/8.,angle=float(i)*2.39996323;
   vec3 light=vec3(sqrt(1.-y*y)*cos(angle),y,sqrt(1.-y*y)*sin(angle));
   vec3 radiance=textureCubeUV(uEnvironment,light,.4).rgb*uEnvironmentReady;
   illuminateWater(radiance*(2.*PI/8.),light,depth,cosT,bedIrradiance,scattered);
 }
 float directVisibility=waterSunVisibility();
 illuminateWater(uSunColor*uSunPower*directVisibility,normalize(uSunDirection),depth,cosT,bedIrradiance,scattered);
 // A bounded atmospheric glow remains visible around the occluding bank;
 // only the analytic highlight uses it, never direct underwater irradiance.
 float glowVisibility=max(0.,.3-directVisibility);
 vec3 bed=uBedAlbedo*bedIrradiance/PI*exp(-sigma*depth/cosT);
 // Refraction back into air scales radiance by eta^2. Fresnel remains exact;
 // neither planar reflection nor its coefficient receives an artistic boost.
 vec3 transmitted=(bed+scattered)/(IOR*IOR);
 vec3 col=reflection*f+transmitted*(1.-f);
 // The reference's soft visible sun and the landscape's direct irradiance
 // are art-directed, not a measured, energy-matched atmospheric model. Scale
 // only that same sun's analytic GGX lobe to the reference path brightness;
 // do not alter the exact water Fresnel or radiance in planar reflection.
 // Evidence: evidence/water-components-v20 and water-calibration-v22.
 vec3 l=normalize(uSunDirection),h=normalize(l+v);float noH=max(0.,dot(n,h)),noL=max(.001,dot(n,l)),a2=.00012;float denom=noH*noH*(a2-1.)+1.;float D=a2/(3.14159265*denom*denom);float gv=2.*cosI/(cosI+sqrt(a2+(1.-a2)*cosI*cosI)),gl=2.*noL/(noL+sqrt(a2+(1.-a2)*noL*noL));float F=.02037+.97963*pow(1.-max(0.,dot(v,h)),5.);col+=uSunColor*(uSunPower*(uSolarSpecularScale*directVisibility+uSolarGlowScale*glowVisibility)*step(0.,dot(n,l)))*D*gv*gl*F/(4.*cosI);
 if(uWaterView>.5&&uWaterView<1.5)col=reflection;
 if(uWaterView>1.5&&uWaterView<2.5)col=vec3(f);
 if(uWaterView>2.5&&uWaterView<3.5)col=transmitted;
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 // Submillimetre analytic waves and a normalized reflection-only footprint.
 // See evidence/water-ripple-v29: mean sky/Fresnel/solar energy guards.
 // Fixed indices let the driver fold direction/refraction constants. The
 // eight authored samples and their accumulation order stay unchanged.
 if(/Chrom(?:e|ium)\//.test(globalThis.navigator?.userAgent??''))unrollWaterSkySamples(material);
 applyWaterRipples(material,{strength:microRippleStrength,footprint:reflectionFootprint});
 // The full-normal angular wave projection introduced in v367 can cross
 // the earlier 0.60m reflection clipping margin at the distant bank. Retain
 // 2m below the water plane in this auxiliary pass to avoid exposed sky in
 // those filtered contact samples. v387 isolates this from surface shading
 // and from the reflection filter. This remains an empirical raster guard,
 // not a physical underwater mirror or a proof for every possible camera.
 // Main geometry, water level, waves, Fresnel and solar visibility are fixed.
 geometry.computeBoundingBox();
 const reflectionPoint=new T.Vector3(),savedViewport=new T.Vector4(),savedScissor=new T.Vector4();
 // Only texels reached by the real water surface can contribute to its image.
 // Keep the original projection for sampling; crop the rendering frustum and
 // viewport together, preserving the original pixel grid and camera aspect.
 // A wide guard includes wave displacement, the five filter taps and mip edges.
 function cropReflection(view){
  mesh.updateWorldMatrix(true,false);const box=geometry.boundingBox;
  let minX=1,minY=1,maxX=-1,maxY=-1;
  for(const x of[box.min.x,box.max.x])for(const z of[box.min.z,box.max.z]){
   reflectionPoint.set(x,WATER_LEVEL,z).applyMatrix4(mesh.matrixWorld).applyMatrix4(view.matrixWorldInverse);
   if(reflectionPoint.z>=-view.near)return;
   reflectionPoint.applyMatrix4(view.projectionMatrix);
   minX=Math.min(minX,reflectionPoint.x);maxX=Math.max(maxX,reflectionPoint.x);
   minY=Math.min(minY,reflectionPoint.y);maxY=Math.max(maxY,reflectionPoint.y);
  }
  const width=target.width,height=target.height,padX=Math.max(64,Math.ceil(width*.08)),padY=Math.max(64,Math.ceil(height*.08));
  const x=Math.max(0,Math.floor((minX*.5+.5)*width)-padX),y=Math.max(0,Math.floor((minY*.5+.5)*height)-padY);
  const right=Math.min(width,Math.ceil((maxX*.5+.5)*width)+padX),top=Math.min(height,Math.ceil((maxY*.5+.5)*height)+padY);
  const w=right-x,h=top-y;if(w<=0||h<=0||(w===width&&h===height))return;
  const aspect=view.aspect;view.setViewOffset(width,height,x,height-top,w,h);view.aspect=aspect;view.updateProjectionMatrix();
  target.viewport.set(x,y,w,h);target.scissor.copy(target.viewport);target.scissorTest=true;
 }
 const mesh=new T.Mesh(geometry,material);mesh.name='lake';const camera=new T.PerspectiveCamera();const clipPlane=new T.Plane(new T.Vector3(0,1,0),-WATER_LEVEL+2.0);
 function reflect(renderer,scene,view,lookAt){
  const environment=scene.environment;
  if(environment?.mapping===T.CubeUVReflectionMapping){material.uniforms.uEnvironment.value=environment;material.uniforms.uEnvironmentReady.value=1;const image=environment.image;material.uniforms.uEnvironmentTexel.value.set(1/image.width,1/image.height);material.uniforms.uEnvironmentMaxMip.value=Math.log2(image.height/4)}
  else material.uniforms.uEnvironmentReady.value=0;
  camera.copy(view);camera.position.y=2*WATER_LEVEL-view.position.y;camera.up.set(0,-1,0);camera.lookAt(lookAt.x,2*WATER_LEVEL-lookAt.y,lookAt.z);camera.updateMatrixWorld();material.uniforms.uMatrix.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  savedViewport.copy(target.viewport);savedScissor.copy(target.scissor);const priorScissorTest=target.scissorTest;cropReflection(camera);
  const priorTarget=renderer.getRenderTarget(),priorClipping=renderer.clippingPlanes,priorVisibility=mesh.visible,priorCore=sunCoreVisibility?.value;
  // Direct solar reflection is evaluated by the water GGX lobe. The planar
  // target retains atmospheric aureole/clouds but excludes the direct disc,
  // avoiding a second contribution from the same emitter.
  try{mesh.visible=false;if(sunCoreVisibility)sunCoreVisibility.value=0;renderer.clippingPlanes=[clipPlane];renderer.setRenderTarget(target);renderer.render(scene,camera);}
  finally{target.viewport.copy(savedViewport);target.scissor.copy(savedScissor);target.scissorTest=priorScissorTest;renderer.setRenderTarget(priorTarget);renderer.clippingPlanes=priorClipping;mesh.visible=priorVisibility;if(sunCoreVisibility)sunCoreVisibility.value=priorCore;}
  // The reflection pass has refreshed shared shadow maps before the main draw.
  if(sunLight?.shadow.map?.depthTexture){
   const shadow=sunLight.shadow,u=material.uniforms;
   u.uSunShadowMap.value=shadow.map.depthTexture;
   u.uSunShadowMatrix.value.copy(shadow.matrix);
   u.uSunShadowTexel.value.set(shadow.radius/shadow.map.width,shadow.radius/shadow.map.height);
   u.uSunShadowBias.value=shadow.bias;u.uSunNormalBias.value=shadow.normalBias;
   u.uSunShadowReady.value=1;
  }
 }
 return{mesh,material,target,reflect};
}

// Preserve the quadrature exactly; only expose its fixed indices to the driver.
function unrollWaterSkySamples(material){
 const start=material.fragmentShader.indexOf(' for(int i=0;i<8;i++){'),end=material.fragmentShader.indexOf('\n float directVisibility=',start);
 if(start<0||end<start)throw Error('Water sky quadrature changed');
 const body=material.fragmentShader.slice(start,end).replace(' for(int i=0;i<8;i++){','').replace(/\}\s*$/,'');
 material.fragmentShader=material.fragmentShader.slice(0,start)+Array.from({length:8},(_,i)=>'{'+body.replace(/\bi\b/g,String(i))+'}').join('\n')+material.fragmentShader.slice(end);
}

// Small surface-wave/planar-footprint refinement; reference-calibrated amplitudes.
// Sum-of-sines heightfield derivatives follow GPU Gems1 chapter1 (Mark Finch).
// The submillimetre waves are physical world-space fields, not image noise.
const rippleWaves=[[.18,1.7,.00042,.2],[-.31,2.7,.00023,2.3],[.11,4.3,.000095,4.8],[.57,1.15,.00031,1.2],[-.44,3.45,.00012,3.7]];
function applyWaterRipples(material,{strength=0,footprint=0}={}){
 if(material.uniforms.uMicroRippleStrength)throw new Error('Water candidate already present');
 const u={uMicroRippleStrength:{value:strength},uReflectionFootprint:{value:footprint}};Object.assign(material.uniforms,u);
 const helper=`
 uniform float uMicroRippleStrength,uReflectionFootprint;
 vec3 microRipples(vec2 p,float time,float shore){
   vec4 spectrum[5]=vec4[5](${rippleWaves.map(a=>'vec4('+a.map(v=>Number(v).toFixed(7)).join(',')+')').join(',')});
   vec3 value=vec3(0.);
   for(int i=0;i<5;i++){
     vec2 k=spectrum[i].xy;
     float phase=dot(p,k)-time*sqrt(9.81*length(k))+spectrum[i].w;
     // Analytic average of this sinusoid under a Gaussian pixel footprint:
     // sigma=.5native pixel, Fourier response exp(-sigma^2*|grad phase|^2/2).
     // Derivatives run unconditionally in the fixed loop, before any branch.
     // The same response filters height and slope; spectrum/amplitudes stay fixed.
     vec2 phaseGradient=vec2(dFdx(phase),dFdy(phase));
     float pixelResponse=exp(-.125*dot(phaseGradient,phaseGradient));
     value+=vec3(sin(phase),cos(phase)*k)*(spectrum[i].z*pixelResponse);
   }
   return value*(uMicroRippleStrength*smoothstep(0.,5.,shore));
 }
 vec2 reflectedDirectionUv(vec3 ray){vec4 p=uMatrix*vec4(ray,0.);return p.xy/p.w*.5+.5;}
 vec3 filteredReflection(vec2 uv,vec3 reflected){
   vec3 right=normalize(cross(vec3(0.,1.,0.),reflected));
   vec3 up=normalize(cross(reflected,right));
   vec2 center=reflectedDirectionUv(reflected);
   vec2 dx=(reflectedDirectionUv(normalize(reflected+right*uReflectionFootprint))-center);
   vec2 dy=(reflectedDirectionUv(normalize(reflected+up*uReflectionFootprint))-center);
   // Normalized radiance footprint on the reflection target only; no main-
   // scene postprocess, chroma change, Fresnel gain or altered solar power.
   return texture2D(uReflection,clamp(uv,.001,.999)).rgb*.40
     +(texture2D(uReflection,clamp(uv+dx,.001,.999)).rgb+texture2D(uReflection,clamp(uv-dx,.001,.999)).rgb)*.15
     +(texture2D(uReflection,clamp(uv+dy,.001,.999)).rgb+texture2D(uReflection,clamp(uv-dy,.001,.999)).rgb)*.15;
 }
 `;
 const marker=' void main(){vec3 w=waves(vWorld.xz,uTime,vDistance);vec3 n=';
 if(!material.fragmentShader.includes(marker))throw new Error('Water normal insertion point missing');
 material.fragmentShader=material.fragmentShader.replace(marker,helper+'\n void main(){vec3 baseWave=waves(vWorld.xz,uTime,vDistance);vec3 w=baseWave+microRipples(vWorld.xz,uTime,vDistance);vec3 n=');
 const reflection='uv+=w.yz*vec2(.25,.14);vec3 reflection=texture2D(uReflection,clamp(uv,.001,.999)).rgb;';
 if(!material.fragmentShader.includes(reflection))throw new Error('Water reflection insertion point missing');
 material.fragmentShader=material.fragmentShader.replace(reflection,`vec3 baseRay=reflect(-v,vec3(0.,1.,0.)),rippleRay=reflect(-v,n);
 // Project the angular deviation of the complete wave normal from the flat
 // plane, including long waves. This remains a planar reflection approximation.
 uv+=reflectedDirectionUv(rippleRay)-reflectedDirectionUv(baseRay);
 vec3 reflection=filteredReflection(uv,rippleRay);`);
 material.needsUpdate=true;return u;
}
