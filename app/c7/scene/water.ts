import * as THREE from 'three'

// Six low-amplitude geometric waves. Height and analytic slope share all
// frequencies, phases and shoreline attenuation in both shader stages.
const surface = `
  vec3 waterSurface(vec2 q, float time, float distanceToShore, vec2 shoreGradient) {
    float t = clamp(distanceToShore / 5.0, 0.0, 1.0);
    float fade = t * t * (3.0 - 2.0 * t);
    vec2 fadeGradient = 6.0 * t * (1.0 - t) / 5.0 * shoreGradient;
    vec3 total=vec3(0.0);
    // Irregular wind spectrum; one function evaluates both displaced vertices
    // and fragment normals. No independent cosmetic normal animation.
    vec4 waves[6]=vec4[6](vec4(.14,.06,.018,.34),vec4(-.23,.31,.012,.42),
      vec4(1.7,.8,.003,.83),vec4(-2.1,1.9,.0022,1.02),
      vec4(4.9,2.3,.0008,1.54),vec4(-3.7,6.1,.0006,1.81));
    for(int i=0;i<6;i++) {
      vec4 w=waves[i];float phase=dot(q,w.xy)-time*w.w+float(i)*2.73;
      total+=vec3(w.z*sin(phase),w.z*cos(phase)*w.xy);
    }
    float height=total.x;
    vec2 slope=fade*total.yz+height*fadeGradient;
    return vec3(height * fade, slope);
  }
`

export function buildLake(geometry: THREE.BufferGeometry, reflection: THREE.Texture) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uProgress: { value: 0 },
      uSun: { value: new THREE.Vector3() }, uCamera: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color('#ffe0b8') },
      uSunIntensity: { value: 1 },
      uWorldReflection: { value: reflection },
      uReflectionViewProjection: { value: new THREE.Matrix4() },
      uReflectionStrength: { value: 0 }, uOpacity: { value: 1 },
      uReflectionOnly: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aShoreDistance;
      attribute float aDepth;
      attribute vec2 aShoreGradient;
      varying vec3 vWorld;
      varying float vShore, vDepth;
      varying vec2 vShoreGradient;
      ${surface}
      void main() {
        vShore = aShoreDistance; vDepth = aDepth; vShoreGradient = aShoreGradient;
        vec3 p = position;
        p.y += waterSurface(p.xz, uTime, aShoreDistance, aShoreGradient).x;
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uReflectionStrength, uOpacity, uReflectionOnly, uSunIntensity;
      uniform vec3 uSun, uCamera, uSunColor;
      uniform sampler2D uWorldReflection;
      uniform mat4 uReflectionViewProjection;
      varying vec3 vWorld;
      varying float vShore, vDepth;
      varying vec2 vShoreGradient;
      ${surface}
      void main() {
        vec3 wave = waterSurface(vWorld.xz, uTime, vShore, vShoreGradient);
        vec3 n = normalize(vec3(-wave.y, 1.0, -wave.z));
        vec3 eye = normalize(uCamera - vWorld);
        float cosine = max(0.001, dot(n, eye));
        // Exact unpolarized Fresnel for the air-to-water interface (n=1.333).
        float eta = 1.0 / 1.333;
        float transmittedCos = sqrt(max(0.0, 1.0 - eta * eta * (1.0 - cosine * cosine)));
        float rs = (cosine - 1.333 * transmittedCos) / (cosine + 1.333 * transmittedCos);
        float rp = (1.333 * cosine - transmittedCos) / (1.333 * cosine + transmittedCos);
        float fresnel = (rs * rs + rp * rp) * 0.5;
        vec4 projected = uReflectionViewProjection * vec4(vWorld, 1.0);
        vec2 reflectedUv = projected.xy / max(projected.w, 0.001) * 0.5 + 0.5;
        reflectedUv += wave.yz * vec2(0.12, 0.07) * smoothstep(0.0, 4.0, vShore);
        float valid = step(0.0, reflectedUv.x) * step(reflectedUv.x, 1.0)
          * step(0.0, reflectedUv.y) * step(reflectedUv.y, 1.0);
        vec3 reflected = texture2D(uWorldReflection, clamp(reflectedUv, 0.001, 0.999)).rgb;
        // Homogeneous depth approximation, not screen-space refraction or an exact ray query.
        float pathLength = min(35.0, vDepth / max(0.18, transmittedCos));
        vec3 transmittance = exp(-vec3(0.42, 0.20, 0.13) * pathLength);
        vec3 bed = vec3(0.115, 0.145, 0.071);
        vec3 water = mix(vec3(0.012, 0.028, 0.023), bed, transmittance);
        vec3 color = mix(water, reflected, fresnel * valid * uReflectionStrength);
        color = mix(color, reflected, uReflectionOnly);
        vec3 light = normalize(uSun - vWorld);
        vec3 halfVector = normalize(light + eye);
        // The planar image describes resolved waves. GGX describes smaller
        // capillary slopes, so low sunlight has a broad, warm reflection rather
        // than disappearing when the perfect mirror point is beyond the bank.
        float noL=max(0.001,dot(n,light)),noH=max(0.0,dot(n,halfVector));
        float voH=max(0.0,dot(eye,halfVector));
        float alpha=0.16*0.16,alpha2=alpha*alpha;
        float denominator=noH*noH*(alpha2-1.0)+1.0;
        float distribution=alpha2/(3.14159265*denominator*denominator);
        float gv=2.0*cosine/(cosine+sqrt(alpha2+(1.0-alpha2)*cosine*cosine));
        float gl=2.0*noL/(noL+sqrt(alpha2+(1.0-alpha2)*noL*noL));
        float specularF=0.02037+0.97963*pow(1.0-voH,5.0);
        float glint=distribution*gv*gl*specularF/(4.0*cosine);
        color += uSunColor * uSunIntensity * glint * step(0.0,light.y);
        gl_FragColor = vec4(color, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'shared-boundary-lake'
  mesh.renderOrder = 2
  return { mesh, geometry, material }
}
