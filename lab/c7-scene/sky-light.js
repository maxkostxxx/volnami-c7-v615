import * as T from 'three';

// Discrete quadrature of the warm, low sky. Unlike uniform IBL, these rays
// retain terrain visibility: a valley cannot see the same low sector as a
// ridge. The visible solar disc and its direct source remain in main.js.
// Basis: Sucker Punch, Real-Time Samurai Cinema (SIGGRAPH 2021), sky visibility.
// The angular samples/energy below are authored for this scene, not measured.
export function createSkyLight({scene,sunDirection,mobile=false}) {
  // Merge the two lower and two upper quadrature samples, preserving
  // total radiance and their weighted first angular moments.
  const samples=[[5/3,34/3,.3],[-5,14,.4],[5/3,50/3,.3]];
  const lights=samples.map(([offset,elevation,weight])=>{
    const light=new T.DirectionalLight('#fff0ca',1);light.name='Low sky irradiance sample';
    light.castShadow=true;light.shadow.mapSize.set(mobile?2048:4096,mobile?2048:4096);
    Object.assign(light.shadow.camera,{left:-450,right:450,top:300,bottom:-300,near:1,far:11000});
    // A broad PCF footprint leaked low-sky energy through the narrow near
    // crest. Softness comes from the angular sky samples, not a 5m blur.
    // See evidence/near-shadow-radius-v21: identical sources, radius6→1.
    light.shadow.bias=-.000002;light.shadow.normalBias=.18;light.shadow.radius=1;
    light.target.position.set(0,0,-250);scene.add(light,light.target);
    return {light,offset,elevation,weight};
  });
  const params={strength:11};
  function update(phase){
    const daylight=Math.sin(Math.PI*phase),azimuth=Math.atan2(sunDirection.x,-sunDirection.z);
    const baselineColour=new T.Color('#fff0ca').lerp(new T.Color('#fff8ea'),daylight);
    const colour=new T.Color('#ffd29a').lerp(new T.Color('#fff8ea'),daylight);
    const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
    const photometricGain=luminance(baselineColour)/luminance(colour)*1.12;
    for(const sample of lights){
      const az=azimuth+T.MathUtils.degToRad(sample.offset);
      // At sunrise/sunset the lower sky sector preserves a narrow lit crest
      // and a darker camera-facing slope. Ease to the unchanged noon sector.
      // Authored angular quadrature, not a measured atmospheric reconstruction.
      const el=T.MathUtils.degToRad(sample.elevation-5*(1-daylight)+daylight*18);
      sample.light.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)).multiplyScalar(5000).add(sample.light.target.position);
      sample.light.color.copy(colour);sample.light.intensity=params.strength*(1-daylight*.8)*sample.weight*photometricGain;
    }
  }
  function dispose(){for(const{light}of lights){scene.remove(light,light.target);light.dispose();}}
  return {lights:lights.map(s=>s.light),params,update,dispose};
}
