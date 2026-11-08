import * as THREE from 'three'
import { referenceProjection } from './geography'
import type { GroundCoverData } from './ground-cover-data'
import { registeredGroundGLSL } from './registered-ground'

// A continuous field of individual blades, not clumps restricted to a shore strip.
// Fixed world roots keep the cover in place during camera motion and reflection.
export function buildGroundCover(data: GroundCoverData, turf: THREE.Texture, control: THREE.Texture) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.028,0,0, .028,0,0, -.014,.55,.10, .014,.55,.10, 0,1,.27,
  ],3))
  geometry.setIndex([0,2,1,1,2,3,2,4,3])
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0,0,1,0],3))
  const material = new THREE.MeshStandardMaterial({color:'#4b703e',side:THREE.DoubleSide,roughness:1})
  const time={value:0},ready={value:0}
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uCoverTime:time,uCoverReady:ready,uCoverTurf:{value:turf},
      uCoverControl:{value:control},uCoverProjection:{value:referenceProjection}})
    shader.vertexShader=`uniform float uCoverTime; varying vec3 vCoverRoot; varying float vCoverHeight;\n${shader.vertexShader}`
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vCoverRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      vCoverHeight=position.y;
      transformed.x+=sin(vCoverRoot.x*.43+vCoverRoot.z*.21+uCoverTime*.74)*position.y*position.y*.07;`)
    shader.fragmentShader=`uniform sampler2D uCoverTurf,uCoverControl; uniform mat4 uCoverProjection;
      uniform float uCoverReady; varying vec3 vCoverRoot; varying float vCoverHeight;
      ${registeredGroundGLSL}\n${shader.fragmentShader}`
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec4 projected=uCoverProjection*vec4(vCoverRoot,1.0);
      vec2 uv=projected.xy/projected.w*.5+.5;
      float bounds=smoothstep(0.0,.06,uv.x)*(1.0-smoothstep(.94,1.0,uv.x))
        *smoothstep(0.0,.06,uv.y)*(1.0-smoothstep(.94,1.0,uv.y));
      vec3 region=texture2D(uCoverControl,clamp(uv,0.0,1.0)).rgb;
      float land=c7RegisteredLand(uv,region)*step(0.001,projected.w);
      vec3 source=texture2D(uCoverTurf,clamp(uv,0.0,1.0)).rgb;
      float vegetation=c7RegisteredVegetation(source);
      float foregroundBlend=smoothstep(0.0,0.26,uv.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,source*1.55,bounds*land*vegetation*uCoverReady*foregroundBlend);
      diffuseColor.rgb*=mix(.84,1.06,vCoverHeight);`)
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      // Bent, thin foliage shares an upward diffuse normal on both sides.
      // The normal attribute is transformed into view space by Three.js.
      normal*=faceDirection;`)
  }
  const mesh=new THREE.InstancedMesh(geometry,material,data.count)
  mesh.instanceMatrix.array.set(data.matrices.subarray(0,data.count*16))
  mesh.instanceMatrix.needsUpdate=true
  mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(...data.center),data.radius)
  mesh.receiveShadow=true;mesh.name='continuous-near-meadow'
  return {mesh,geometry,material,time,ready}
}
