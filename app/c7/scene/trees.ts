import * as THREE from 'three'
import { hillHeight, shoreDistance, treeFromImage } from './geography'

export function buildTrees(lowTier: boolean) {
  // Authored groups on distinct ridges; the same trees survive both quality tiers.
  const locations = [
    treeFromImage(190,431,62),treeFromImage(254,416,39),
    treeFromImage(478,357,31),treeFromImage(548,369,16),
    treeFromImage(865,391,49),treeFromImage(884,391,38),
    treeFromImage(1075,441,59),treeFromImage(1105,432,40),
    [-145,-42,1.12],[-131,-52,0.8],[126,-35,1.12],[145,-52,0.76],
    [182,-110,1.1],[199,-126,0.9],[243,-70,1.15],[251,-79,0.8],
    [302,-148,1.2],[316,-151,0.85],[386,-51,1.05],[404,-64,0.9],
  ]
  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.32, 1, 7)
  // A spray of eight bent leaves, rather than a solid ball. The spaces between
  // leaves belong to the geometry and remain in the shadow and reflection.
  const leafGeometry = new THREE.BufferGeometry()
  const leafPositions:number[]=[],leafIndices:number[]=[]
  const leafPoint=new THREE.Vector3(),leafRotation=new THREE.Euler()
  const outline=[[0,-0.32,0],[-0.15,-0.09,0.025],[-0.13,0.17,0.015],
    [0,0.36,-0.035],[0.13,0.17,0.015],[0.15,-0.09,0.025]]
  for(let leaf=0;leaf<8;leaf++) {
    const angle=leaf*2.39996
    leafRotation.set(Math.sin(leaf*3.7)*1.2,angle,Math.cos(leaf*2.8)*1.5)
    for(const p of outline) {
      leafPoint.set(p[0],p[1],p[2]).applyEuler(leafRotation)
        .add(new THREE.Vector3(Math.cos(angle)*0.36,Math.sin(leaf*4.2)*0.3,Math.sin(angle)*0.36))
      leafPositions.push(leafPoint.x,leafPoint.y,leafPoint.z)
    }
    for(let k=1;k<5;k++)leafIndices.push(leaf*6,leaf*6+k,leaf*6+k+1)
  }
  leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute(leafPositions,3))
  leafGeometry.setIndex(leafIndices);leafGeometry.computeVertexNormals()
  const coniferGeometry = new THREE.ConeGeometry(1, 2.5, 11, 3)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#675335', roughness: 1 })
  // Instance colours are the albedo. Multiplying them by a second dark green
  // made the crowns black even in daylight.
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side:THREE.DoubleSide, forceSinglePass:true })
  leafMaterial.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec3 vLeafWorld;\nvoid main() {')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n vLeafWorld=(modelMatrix*instanceMatrix*vec4(position,1.0)).xyz;')
    shader.fragmentShader=shader.fragmentShader.replace('void main() {',`varying vec3 vLeafWorld;
      float leafHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main() {`).replace('#include <color_fragment>',`#include <color_fragment>
      float fine=leafHash(floor(vLeafWorld*7.0));
      float visible=1.0-smoothstep(0.12,0.5,length(fwidth(vLeafWorld)));
      diffuseColor.rgb*=mix(0.94,0.7+fine*0.6,visible);`)
  }
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, locations.length * 7)
  const sprays=lowTier?120:210
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, locations.length * sprays)
  const conifers = new THREE.InstancedMesh(coniferGeometry, leafMaterial, locations.length * 5)
  const dummy = new THREE.Object3D(), shade = new THREE.Color()
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3()
  let trunkCount = 0, crownCount = 0, coniferCount = 0
  for (let i = 0; i < locations.length; i++) {
    const [x,z,scale] = locations[i]
    if (shoreDistance(x,z) < 2) continue
    const ground = hillHeight(x,z) - 0.22
    const branch = (a: THREE.Vector3, b: THREE.Vector3, thickness: number) => {
      direction.subVectors(b,a)
      dummy.position.copy(a).add(b).multiplyScalar(0.5)
      dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize())
      dummy.scale.set(thickness, direction.length(), thickness)
      dummy.updateMatrix(); trunks.setMatrixAt(trunkCount++,dummy.matrix)
    }
    branch(new THREE.Vector3(x,ground,z), new THREE.Vector3(x+0.25*scale,ground+6.9*scale,z),scale)
    {
      const conical=i===0||i===6||i===7
      for(let lobe=0;lobe<sprays;lobe++) {
        const angle=lobe*2.39996+i*1.7
        const vertical=lobe/(sprays-1)
        const fullnessRadius=0.55+0.45*Math.sqrt((Math.sin(lobe*127.1+i)*43758.54)%1*.5+.5)
        const radius=(conical?2.15*(1-vertical):2.5*Math.sqrt(1-(vertical*2-1)**2))*scale*fullnessRadius
        const top=ground+((conical?1.6:3.1)+vertical*(conical?6.6:5.1)+0.3*Math.sin(lobe*2.1+i))*scale
        const lx=x+Math.cos(angle)*radius,lz=z+Math.sin(angle)*radius
        if(lobe>0 && lobe%Math.floor(sprays/6)===0) branch(new THREE.Vector3(x,ground+(2.5+vertical*2)*scale,z),new THREE.Vector3(lx,top,lz),scale*0.3)
        dummy.position.set(lx,top,lz)
        dummy.rotation.set(lobe*0.7,angle,lobe*0.4)
        const fullness=(lowTier?1.4:1.2)*(0.76+0.18*Math.sin(lobe*4.3+i))*scale*(conical?1-vertical*0.35:1)
        dummy.scale.set(fullness,fullness*1.24,fullness)
        dummy.updateMatrix();leaves.setMatrixAt(crownCount,dummy.matrix)
        shade.setHSL(0.25+0.014*Math.sin(i),0.5,0.22+0.035*Math.sin(lobe*2.6+i))
        leaves.setColorAt(crownCount++,shade)
      }
    }
  }
  trunks.count=trunkCount;leaves.count=crownCount;conifers.count=coniferCount
  for (const mesh of [trunks,leaves,conifers]) {
    mesh.instanceMatrix.needsUpdate=true
    mesh.castShadow=true;mesh.receiveShadow=true
    mesh.computeBoundingSphere()
  }
  if(leaves.instanceColor) leaves.instanceColor.needsUpdate=true
  trunks.name='rooted-tree-trunks-and-branches';leaves.name='irregular-deciduous-crowns';conifers.name='layered-conifers'
  return { trunks, leaves, conifers, trunkGeometry, leafGeometry, coniferGeometry, trunkMaterial, leafMaterial }
}
