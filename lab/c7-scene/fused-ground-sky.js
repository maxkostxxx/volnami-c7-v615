// The authored ground has separate surface and raised-canopy transport.
// Evaluate their shared horizon texels and tree visibility in one local scope,
// retaining separate weights and the original summation order for each lobe.
// Called only by the reviewed r186 static receiveShadow=false path. A live
// receiver edit restores the original shader through its existing deopt hook.
// No shadow pass, field precision, light, material or geometry is removed.
export function fuseStaticGroundSkyLighting(shader,{compact=false}={}){
 function block(s,anchor,replacement){const at=s.indexOf(anchor);if(at<0)throw Error('Missing fused anchor '+anchor);const re=/#(?:if\b|ifdef\b|ifndef\b|endif\b)[^\n]*/g;re.lastIndex=at;let level=0,end,hit;while((hit=re.exec(s))){level+=hit[0].startsWith('#endif')?-1:1;if(!level){end=re.lastIndex;break;}}if(!end)throw Error('Missing fused block end');return s.slice(0,at)+replacement+s.slice(end);}
 let pair=`
 float c7Segment(float q){if(q<=-1.)return 0.;if(q>=1.)return 1.;return .5+(asin(q)+q*sqrt(max(0.,1.-q*q)))/3.141592653589793;}
 vec4 c7HorizonPair(vec3 world,int lightIndex){
  float z=85.+(world.z-85.)/2.1;
  vec2 p=vec2(world.x,z),source=uSkyHorizonSources[lightIndex-1];
  float sourceWeight=clamp(uSkyHorizonMix,0.,1.)*step(0.,source.x)*step(source.x,16.);
  if(sourceWeight<=0.)return vec4(1.,0.,1.,0.);
  vec2 uv=(p-vec2(-600.,-800.))/vec2(340.,360.);
  float edge=smoothstep(0.,20.,p.x+600.)*(1.-smoothstep(-280.,-260.,p.x))*smoothstep(0.,20.,p.y+800.)*(1.-smoothstep(-460.,-440.,p.y));
  vec2 weight=vec2(edge*clamp(uSkyHorizonMix,0.,1.)*clamp(uLocalMix,0.,1.)*step(0.,source.x)*step(source.x,16.));
  vec2 angles=vec2(0.);float radius=uSkyHorizonRadius;
  if(weight.x>0.){
   uv=clamp(uv,vec2(.5/256.,.5/128.),vec2(1.-.5/256.,1.-.5/128.));
   float layer=clamp(source.x,0.,16.),low=floor(layer);
   vec4 a=texture(uLocalHorizon,vec3(uv,low)),b=texture(uLocalHorizon,vec3(uv,min(16.,low+1.)));
   angles=mix(a.rg,b.rg,fract(layer));
   vec2 uncertainty=mix(a.ba,b.ba,fract(layer));
   weight*=1.-smoothstep(vec2(uLocalGuard.x),vec2(uLocalGuard.y),uncertainty);
  }else{
   uv=(p-vec2(-330.,-405.))/vec2(660.,280.);
   edge=smoothstep(0.,8.,p.x+330.)*(1.-smoothstep(322.,330.,p.x))*smoothstep(0.,8.,p.y+405.)*(1.-smoothstep(-133.,-125.,p.y));
   weight=vec2(clamp(uSkyHorizonMix,0.,1.)*edge*step(0.,source.x)*step(source.x,16.));
   if(weight.x<=0.)return vec4(1.,0.,1.,0.);
   uv=clamp(uv,vec2(.5/512.,.5/256.),vec2(1.-.5/512.,1.-.5/256.));
   float layer=clamp(source.x,0.,16.),low=floor(layer),high=min(16.,low+1.);
   vec4 a=texture(uSkyHorizon,vec3(uv,low)),b=texture(uSkyHorizon,vec3(uv,high));
   angles=mix(a.rg,b.rg,fract(layer));
   vec2 distances=mix(a.ba,b.ba,fract(layer));
   weight*=smoothstep(vec2(2.),vec2(8.),distances);
   radius=max(.00001,uSkyHorizonRadius);
  }
  vec2 q=clamp((source.y-angles)/radius,-1.,1.);
  vec2 visibility=vec2(c7Segment(q.x),c7Segment(q.y));
  if((weight.x>0.&&q.x>-1.)||(weight.y>0.&&q.y>-1.))visibility*=c7TreeShadowUncached(world,lightIndex);
  return vec4(visibility.x,weight.x,visibility.y,weight.y);
 }
 `;
 if(compact)pair=pair.replaceAll('vec2(.5/256.,.5/128.)','vec2(.5/128.,.5/64.)').replaceAll('vec2(1.-.5/256.,1.-.5/128.)','vec2(1.-.5/128.,1.-.5/64.)').replaceAll('vec2(.5/512.,.5/256.)','vec2(.5/256.,.5/128.)').replaceAll('vec2(1.-.5/512.,1.-.5/256.)','vec2(1.-.5/256.,1.-.5/128.)');

 let s=shader.fragmentShader;
  const init=s.indexOf('  vec3 turfV = normalize(cameraPosition - vTurfWorld);'),tail=s.indexOf('  float turfVisibility = turfVisibleEnergy');
  if(init<0||tail<init)throw Error('Fused canopy anchors changed');
  const endInit=s.indexOf('  #if NUM_DIR_LIGHTS > 0',init),declarations=s.slice(init,endInit);
  s=s.slice(0,init)+s.slice(tail);
  const incident='IncidentLight directLight;';if(!s.includes(incident))throw Error('Fused direct anchor');s=s.replace(incident,incident+'\n'+declarations);
  const direct=`
   #if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
     {
      getDirectionalLightInfo(directionalLights[i],directLight);
      float surfaceVisibility=1.,visibility=1.;
      #if UNROLLED_LOOP_INDEX > 0 && UNROLLED_LOOP_INDEX < 4
       vec4 h=c7HorizonPair(vTurfWorld,UNROLLED_LOOP_INDEX);surfaceVisibility=mix(1.,h.x,h.y);visibility=mix(1.,h.z,h.w);
       if(!c7GroundSurfaceNeedsShadow(geometryNormal,directLight.direction))directLight.color=vec3(0.);
      #endif
      directLight.color*=surfaceVisibility;
      RE_Direct(directLight,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
      vec3 L=inverseTransformDirection(directionalLights[i].direction,viewMatrix),incident=directionalLights[i].color;
      float energy=dot(incident,vec3(.2126,.7152,.0722));
      turfTotalEnergy+=energy;turfVisibleEnergy+=energy*visibility;
      turfCanopyRadiance+=turfThinCanopy(L,incident,turfN,turfV,material.diffuseColor,turfLuminance)*visibility;
     }
    }
    #pragma unroll_loop_end
   #endif
  `;
  s=block(s,'#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',direct);
  shader.fragmentShader=s.replace('void main() {',pair+'\nvoid main() {');

}
