// Shared interpretation of the existing source/control textures. The terrain
// and the rooted grass must not disagree about which texels represent ground.
// This is a material mask; it neither edits an asset nor moves the shoreline.
export const registeredGroundGLSL = `
float c7RegisteredLand(vec2 uv, vec3 region) {
  float land=(1.0-smoothstep(0.08,0.35,region.g))
    *(1.0-smoothstep(0.15,0.55,region.b));
  // Dark red at the near bank includes reflected water. Bright red marks the
  // actual foreground meadow; darker red remains valid on the distant hills.
  float foreground=1.0-smoothstep(0.25,0.34,uv.y);
  return land*mix(1.0,smoothstep(0.65,0.94,region.r),foreground);
}
float c7RegisteredVegetation(vec3 source) {
  // Relative chroma excludes pale water/sky leakage even when it is bright.
  return smoothstep(0.08,0.24,(source.g-source.b)/max(0.05,source.g))
    *smoothstep(0.70,0.90,source.g/max(0.001,source.r));
}
`
