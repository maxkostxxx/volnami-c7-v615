// Skip only strictly zero shadowed incident light. A negative NoL alone is
// insufficient: blades can still transmit light through their canopy model.
// The existing per-source PCF, material parameters and canopy formulas remain.
// Evidence: direct-zero-guard-v62 (tiny RGB roundoff, not byte-exact) and
// direct-zero-animation-v63 (paired complete-animation measurements).
const zeroIncidentGuard = /* glsl */`
#if defined(RE_Direct)
void RE_Direct_C7NonzeroIncident(const in IncidentLight directLight,
  const in vec3 geometryPosition, const in vec3 geometryNormal,
  const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
  const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  if (all(equal(directLight.color, vec3(0.0)))) return;
  RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir,
    geometryClearcoatNormal, material, reflectedLight);
}
#undef RE_Direct
#define RE_Direct RE_Direct_C7NonzeroIncident
#endif
`;

function appendZeroIncidentGuard(fragmentShader) {
  if (fragmentShader.includes('RE_Direct_C7NonzeroIncident')) throw Error('Guard already applied');
  const main = /void\s+main\s*\(\s*\)\s*\{/g;
  const matches = [...fragmentShader.matchAll(main)];
  if (matches.length !== 1) throw Error('Expected exactly one fragment main');
  const index = matches[0].index;
  return fragmentShader.slice(0, index) + zeroIncidentGuard + '\n' + fragmentShader.slice(index);
}

const applied = new WeakSet();

/** Apply once after existing ground/blade material hooks, before compilation. */
export function applyZeroIncidentGuard(groups) {
  const materials = new Set();
  for (const group of groups) group?.traverse(object => {
    if (object.material) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) materials.add(material);
  });
  for (const material of materials) {
    if (applied.has(material)) continue;
    const priorCompile = material.onBeforeCompile;
    const priorCacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = function(shader, renderer) {
      priorCompile.call(this, shader, renderer);
      shader.fragmentShader = appendZeroIncidentGuard(shader.fragmentShader);
    };
    material.customProgramCacheKey = function() {
      return priorCacheKey.call(this) + '-exact-zero-incident-v62';
    };
    material.needsUpdate = true;
    applied.add(material);
  }
}
