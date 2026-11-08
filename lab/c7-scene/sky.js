import {createCanvas,loadTexture} from './canvas-platform.js';
import * as T from 'three';

// Author radiance from reference display colours. This is the inverse of r186
// ACES, not a screen image: the directional sky is shared with reflection/IBL.
function radiance(hex,exposure=.9){
 const v=new T.Vector3().fromArray(new T.Color(hex).toArray());
 const input=new T.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.0284,.13383,.83777);
 const output=new T.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602);
 v.applyMatrix3(output.invert());for(const k of['x','y','z']){const y=v[k],a=y*.983729-1,b=y*.432951-.0245786,c=y*.238081+.000090537;v[k]=(-b-Math.sqrt(b*b-4*a*c))/(2*a)}return v.applyMatrix3(input.invert()).multiplyScalar(.6/exposure);
}
export function createSky(sunDirection,time,{horizontalScale=1,cloudStrength=.65,cloudRightDepth=.15,cirrusStrength=.35,signal,mobile=false}={}){
 // Numeric coverage extracted from the CC0 Citrus Orchard Road sky. No source
 // RGB, source light, landscape, or source sun is used by this material.
 const neutralCloud=new T.DataTexture(new Uint8Array([128,128,128,255]),1,1);
 neutralCloud.colorSpace=T.NoColorSpace;neutralCloud.needsUpdate=true;
 // Original-material aliases share one mutable value for existing callers.
 // ShaderMaterial.clone() breaks object aliases: cloned PMREM callers must
 // set uShowSunCore (and their legacy uShowSun handle) explicitly.
 const sunCoreVisibility={value:1};
 // Preserve the dawn fit. Only dusk narrows and warms the aureole to match
 // the right-hand sun profile in the client's image3 (v420/v421 evidence).
 const uniforms={uSunDusk:{value:0},uCloudMap:{value:neutralCloud},uCirrusStrength:{value:cirrusStrength},uCirrusOffset:{value:.40},uCirrusMean:{value:-.0049759163},uCloudOffset:{value:.663},uCloudElevationOffset:{value:12*Math.PI/180},uCloudElevationScale:{value:2.5},uCloudContrast:{value:.65},uCloudMean:{value:.85},uCloudRightDepth:{value:cloudRightDepth},uCloudStrength:{value:cloudStrength},uHorizontalScale:{value:horizontalScale},uSun:{value:sunDirection},uTime:time,uTop:{value:radiance('#e1dcd4')},uLeft:{value:radiance('#faebd7')},uMiddle:{value:radiance('#f1dbc4')},uRight:{value:radiance('#edb197')},uHaze:{value:radiance('#efd6b7')},uSunColor:{value:new T.Vector3(10,7,3.5)},uShowSunCore:sunCoreVisibility,uShowSun:sunCoreVisibility};
 const material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,
 vertexShader:`varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.);gl_Position=p.xyww;}`,
 fragmentShader:`varying vec3 vDirection;uniform vec3 uSun,uTop,uLeft,uMiddle,uRight,uHaze,uSunColor;uniform float uSunDusk,uTime,uShowSunCore,uHorizontalScale,uCloudStrength,uCloudOffset,uCloudElevationOffset,uCloudElevationScale,uCloudContrast,uCloudMean,uCloudRightDepth,uCirrusStrength,uCirrusOffset,uCirrusMean;uniform sampler2D uCloudMap;
 void main(){vec3 actualDirection=normalize(vDirection);vec3 d=normalize(vec3(actualDirection.x*uHorizontalScale,actualDirection.y,actualDirection.z));float az=clamp(d.x*.9+.5,0.,1.);
 // Vertical atmosphere is calibrated in actual elevation, independently of
 // the horizontal art direction. With the 22-degree lens, visible sky spans
 // only about 0..0.17 radians: the old 0.26 transition never reached cream.
 float altitude=asin(clamp(actualDirection.y,-1.,1.));
 float rightSector=smoothstep(.52,.90,az);
 float centerSector=1.-smoothstep(.0,.35,abs(az-.5));
 // The peach layer remains low and vertically compact on the right; higher
 // reflected rays near the middle reach the neutral upper atmosphere sooner.
 float transitionStart=mix(.025,.070,rightSector);
 float transitionEnd=mix(mix(.145,.128,centerSector),.137,rightSector);
 float h=smoothstep(transitionStart,transitionEnd,altitude);
 vec3 horizon=mix(uLeft,uMiddle,smoothstep(.0,.5,az));
 horizon=mix(horizon,uRight,smoothstep(.5,1.,az));
 vec3 color=mix(horizon,uTop,h);color=mix(uHaze,color,smoothstep(-.3,-.05,altitude));
 // The spherical data field provides natural irregular cloud structure. Its
 // chromatic ratios estimate coverage; they are not measured optical depths.
 // Sampling depends only on world direction, so the camera, reflection, and
 // PMREM see the same sky. The source sun was masked during the data bake;
 // the used 12–40-degree source band is also above its 3.52-degree elevation.
 float azimuth=atan(d.x,-d.z);
 float sourceElevation=clamp(uCloudElevationOffset+max(0.,altitude)*uCloudElevationScale,0.,1.53);
 // v629 (client feedback 05.11): the old .000002 drift moved a cloud by only
 // ~0.04 deg/min and read as frozen. ~0.5 deg/min is a gentle visible drift.
 vec2 cloudUv=vec2(fract(uCloudOffset+azimuth/6.2831853+uTime*.00004),.5+sourceElevation/3.14159265);
 float coverage=texture2D(uCloudMap,cloudUv).r;
 float highCloud=smoothstep(.075,.15,altitude);
 // The existing warm/neutral gradient remains the mean atmosphere. A thin
 // gray cloud layer varies its transmission by only a few display levels.
 // Calibrated shared radiance, not a reflection tint: at the reference lake
 // rays the upper atmosphere is about RGB 224/219/211 after ACES. The old
 // right depth .61 unnecessarily dimmed that same sky in the planar target.
 // Evidence: evidence/water-components-v20, water-calibration-v22.
 float baselineDepth=.18+rightSector*highCloud*uCloudRightDepth;
 float horizonFade=smoothstep(-.01,.055,altitude);
 float sunlight=max(0.,dot(actualDirection,normalize(uSun)));
 vec3 cloudBase=mix(uTop*.72,uTop*vec3(.50,.56,.63),rightSector*highCloud);
 vec3 cloudRadiance=mix(cloudBase,horizon*.98,pow(sunlight,35.)*.25*(1.-highCloud*.6));
 vec3 meanRadiance=mix(cloudRadiance,color,exp(-baselineDepth*horizonFade));
 // The authored palette is the mean cloudy atmosphere, not its clear-sky
 // component. Solve that component before applying local coverage, so more
 // readable real clouds do not darken the whole measured sky. Mean coverage
 // .85 is the CPU-measured mean in the authored forward sky sector (.8515).
 float opticalScale=uCloudContrast*uCloudStrength*horizonFade;
 float transmission=exp(-coverage*opticalScale);
 float meanTransmission=exp(-uCloudMean*opticalScale);
 vec3 scattered=meanRadiance*mix(.35,.25,rightSector*highCloud);
 vec3 clearRadiance=(meanRadiance-scattered*(1.-meanTransmission))/meanTransmission;
 color=clearRadiance*transmission+scattered*(1.-transmission);

 // CC0 scalar coverage from the existing Citrus Orchard Road texture.
 // Local morphology approval only; measured mean/water/sun guards are in
 // evidence/sky-cirrus-candidate-v23. Day/dusk and responsive are unverified.
 // Thin natural cloud structure in a second spherical layer. The offset
 // selects a different CC0 sky sector, above its masked source sun. High-pass
 // across elevation removes its broad coverage: this is density data only.
 float cirrusU=fract(uCirrusOffset+azimuth*.80/6.2831853+uTime*.00002);
 float cirrusV=.5+(.04+max(0.,altitude)*4.)/3.14159265;
 float cirrusCenter=texture2D(uCloudMap,vec2(cirrusU,cirrusV)).r;
 float cirrusAbove=texture2D(uCloudMap,vec2(cirrusU,cirrusV+.012)).r;
 float cirrusBelow=texture2D(uCloudMap,vec2(cirrusU,cirrusV-.012)).r;
 float cirrusDetail=(cirrusAbove+cirrusBelow)*.5-cirrusCenter-uCirrusMean;
 float cirrusBand=smoothstep(.010,.025,altitude)*(1.-smoothstep(.075,.11,altitude));
 // Protect the measured aureole within a spherical cone. This is independent
 // of camera/screen coordinates, and the shared source remains untouched.
 float cirrusSunAngle=acos(clamp(dot(actualDirection,normalize(uSun)),-1.,1.))*uHorizontalScale;
 float cirrusSunMask=smoothstep(.080,.14,cirrusSunAngle);
 // A bounded signed radiance modulation keeps the broad author palette;
 // uCirrusMean is CPU-fitted over the authored band to retain its weighted mean.
 color*=1.+uCirrusStrength*cirrusBand*cirrusSunMask*cirrusDetail;
 // One shared solar direction owns the attenuated disk and its aureole.
 // This is an art-directed fit to image3's radial RGB profile at exposure .9
 // and the 22.316-degree reference lens, NOT measured atmospheric physics.
 // Visible solar radiance and scene direct irradiance have separate artistic
 // calibrations; lake.uSolarSpecularScale documents the water lobe calibration.
 // Evidence: evidence/sun-profile-fit-v18. The atmospheric component stays
 // visible in PMREM and planar reflection; only direct core visibility is
 // suppressed there when the water evaluates its analytical solar highlight.
 // v617 (client feedback 01.11) / v627 (04.11): the dawn glow that made the
 // sun read stronger was later found to swamp the disc into a flat wash; the
 // aureole now hugs the disc tighter (see the block below).
 float cosine=clamp(dot(actualDirection,normalize(uSun)),-1.,1.),angle=acos(cosine);
 float scaledAngle=angle*uHorizontalScale;
 // v627 (client feedback 04.11): the dawn glow swamped the disc into a flat
 // bright wash. The aureole now hugs the disc tighter, the outer halo is
 // dimmer and narrower, the core has more headroom, and a thin dark rim
 // outlines the disc so its round silhouette reads against the glow.
 float aureoleCoverage=exp(-pow(scaledAngle/mix(.014,.0085,uSunDusk),mix(2.7,4.0,uSunDusk)));
 vec3 aureoleRadiance=vec3(1.7,1.55,1.15);
 vec3 outerAureoleRadiance=mix(vec3(1.05,1.1,.5),vec3(1.7,.05,0.0),uSunDusk);
 color=mix(color,aureoleRadiance,aureoleCoverage)
   +outerAureoleRadiance*(1.-aureoleCoverage)*exp(-scaledAngle*scaledAngle/.0032);
 // The visible core stays distinct inside the broad aureole.
 float solarEdge=max(fwidth(angle),.000001);
 float solarCore=1.-smoothstep(.005-solarEdge,.005+solarEdge,angle);
 color+=uSunColor*(1.8*solarCore*uShowSunCore);
 // A thin dark rim outlines the disc; a wider dimmed annulus separates the
 // disc from the bright sky so its round silhouette reads (v627, 04.11).
 color-=vec3(.20,.19,.14)*smoothstep(.005+solarEdge*.6,.005+solarEdge*1.6,angle)
   *(1.-smoothstep(.005+solarEdge*1.6,.005+solarEdge*2.6,angle));
 color-=vec3(.16,.15,.13)*smoothstep(.009,.014,angle)*(1.-smoothstep(.018,.030,angle));
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new T.Mesh(new T.SphereGeometry(4000,24,16),material);mesh.frustumCulled=false;mesh.renderOrder=100; // Opaque depth is already filled; skip hidden sky pixels (exact-pixel A/B).
 function update(p){uniforms.uSunDusk.value=T.MathUtils.smoothstep(p,.65,.95);const day=Math.sin(p*Math.PI),dusk=T.MathUtils.smoothstep(p,.55,1);uniforms.uTop.value.copy(radiance('#e1dcd4')).lerp(radiance('#bed6db'),day*.6).lerp(radiance('#c8b6bd'),dusk*.6);uniforms.uLeft.value.copy(radiance('#faebd7')).lerp(radiance('#e5e7dc'),day*.65).lerp(radiance('#dbb4a6'),dusk*.65);uniforms.uMiddle.value.copy(radiance('#f1dbc4')).lerp(radiance('#e7e4d5'),day*.7).lerp(radiance('#e1b7a7'),dusk*.65);uniforms.uRight.value.copy(radiance('#edb197')).lerp(radiance('#dce3db'),day*.8);uniforms.uHaze.value.copy(radiance('#efd6b7')).lerp(radiance('#d9e1ce'),day*.6)}
 const cloudUrl=new URL(mobile?'./mobile-data/cloud.webp':'./assets/sky/cloud-coverage-4k.webp',import.meta.url).href;
 const readyPromise=({loadAsync:loadTexture}).loadAsync(cloudUrl,{signal}).then(texture=>{
  // Coverage is numeric scalar data; the shader reads only .r. Keep every
  // original texel/mip/filter, but do not allocate three unused GPU channels.
  texture.format=T.RedFormat;
  texture.colorSpace=T.NoColorSpace;texture.wrapS=T.RepeatWrapping;texture.wrapT=T.ClampToEdgeWrapping;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  uniforms.uCloudMap.value=texture;neutralCloud.dispose();return texture;
 });
 // Await before the first PMREM capture; createSky itself stays synchronous.
 return{mesh,material,uniforms,update,readyPromise};
}
