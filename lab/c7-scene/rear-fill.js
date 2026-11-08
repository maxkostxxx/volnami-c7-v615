import * as T from 'three';

// Art-directed dawn bounce for the pale rear meadow. This is not a recovered
// physical emitter from the reference image. Three independently shadowed
// positions approximate a broad source; PCF further softens sparse sampling.
// Four-map asset turf uses the centroid fallback to stay within16fragment
// samplers. The default procedural/fine-field scene was measured at15for
// terrain and16for bark. Fallback softness still needs combined visual QA.
const SAMPLE_POSITIONS = [
  [-310, 155, -534.5],
  [-260, 200, -534.5],
  [-210, 155, -534.5],
];
const CENTROID_POSITION = [-260, 175, -534.5];
const TARGET = [-75, 48, -786.5];
const TOTAL_INTENSITY = 200000;

export function rearFillWeight(phase) {
  if (!Number.isFinite(phase)) throw new TypeError('Rear fill phase must be finite');
  const p = T.MathUtils.clamp(phase, 0, 1);
  return (1 - p) ** 2 * (1 - .8 * Math.sin(Math.PI * p));
}

/**
 * createRearFill({scene, assetFallback=false})
 * Returns {group, lights, update(phase), state, dispose()}.
 * Call update with the same0..1solar phase used by the main sun. Its weight is
 * 1at dawn, .05at midday and0at dusk. Main's normal per-phase shadow refresh
 * remains authoritative. Positions are physical world coordinates authored
 * for the current common2.1depth stretch, never viewport coordinates.
 */
export function createRearFill({scene, assetFallback=false,mobile=false}={}) {
  if (!scene?.isScene) throw new TypeError('Rear fill requires a Three Scene');
  const group = new T.Group();
  group.name = 'C7 dawn rear fill';
  const positions = assetFallback ? [CENTROID_POSITION] : SAMPLE_POSITIONS;
  const lights = positions.map((position, index) => {
    const light = new T.SpotLight('#fffbea', TOTAL_INTENSITY / positions.length,
      650, T.MathUtils.degToRad(14), 1, 2);
    light.name = `C7 dawn rear fill ${assetFallback ? 'centroid' : 'sample'} ${index}`;
    light.position.fromArray(position);
    light.target.position.fromArray(TARGET);
    light.castShadow = true;
    // Positions, cone, and all shadow casters are static in this scene.
    // Intensity changes do not change the depth map. Refresh after context loss.
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    light.shadow.mapSize.set(mobile?1024:2048, mobile?1024:2048);
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 650;
    light.shadow.bias = -.000002;
    light.shadow.normalBias = .03;
    light.shadow.radius = assetFallback ? 30 : 20;
    group.add(light, light.target);
    return light;
  });
  scene.add(group);
  const state = {phase:0, weight:1, totalIntensity:TOTAL_INTENSITY,
    sampleCount:lights.length, assetFallback:!!assetFallback};
  let disposed = false;
  function update(phase) {
    const weight = rearFillWeight(phase);
    if (disposed) return 0;
    for (const light of lights) light.intensity = TOTAL_INTENSITY * weight / lights.length;
    Object.assign(state, {phase:T.MathUtils.clamp(phase,0,1), weight,
      totalIntensity:TOTAL_INTENSITY * weight});
    return weight;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(group);
    for (const light of lights) light.shadow.dispose();
    group.clear();
  }
  return {group, lights, update, state, dispose, invalidateShadows(){for(const light of lights)light.shadow.needsUpdate=true;}};
}
