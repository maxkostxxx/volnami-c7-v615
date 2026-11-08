// One world-space profile drives blade dimensions and unresolved leaf area.
export const SHORT_MEADOW_START = 45;
export const SHORT_MEADOW_END = 95;
export const SHORT_MEADOW_SCALE = .45;
// Blade height scales by s and width by sqrt(s), so leaf area scales by s^1.5.
export const meadowLeafAreaGLSL = z => `pow(mix(1.0, ${SHORT_MEADOW_SCALE.toFixed(8)}, smoothstep(${SHORT_MEADOW_START.toFixed(8)}, ${SHORT_MEADOW_END.toFixed(8)}, ${z})), 1.5)`;
