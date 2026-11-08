import * as THREE from 'three'

// One datum and one closed bank for land, water, depth and tree placement.
// Points are observations of A/image3 (1280×720), not a new background asset.
export const WATER_LEVEL = 0.72
const reference = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 1500)
reference.position.set(0, 37, 85)
reference.lookAt(0, 32, -48)
reference.updateMatrixWorld()
export const referenceCamera = reference
export const referenceProjection = new THREE.Matrix4().multiplyMatrices(
  reference.projectionMatrix, reference.matrixWorldInverse)

function imageRay(x: number, y: number) {
  return new THREE.Vector3(x / 640 - 1, 1 - y / 360, 0.5)
    .unproject(reference).sub(reference.position).normalize()
}

const bankPixels = [
  [0, 583], [194, 529], [133, 492], [251, 474], [402, 476],
  [532, 483], [656, 481], [819, 466], [959, 482], [1135, 473],
  [1280, 480], [1340, 555], [1280, 595], [1090, 612], [924, 653],
  [748, 698], [624, 707], [476, 686], [309, 642], [142, 603],
]
const bankCurve = new THREE.CatmullRomCurve3(bankPixels.map(([x, y]) => {
  const ray = imageRay(x, y)
  return reference.position.clone().addScaledVector(ray, (WATER_LEVEL - reference.position.y) / ray.y)
}), true, 'centripetal')
export const shore = bankCurve.getPoints(512).slice(0, -1)
const center = new THREE.Vector2(0, -50)
const bounds={minX:Math.min(...shore.map(p=>p.x)),maxX:Math.max(...shore.map(p=>p.x)),
  minZ:Math.min(...shore.map(p=>p.z)),maxZ:Math.max(...shore.map(p=>p.z))}
// Exact inside the useful bank band; outside it all consumers are saturated.
// This cap avoids quadratic setup work on distant invisible ground.
const DISTANCE_LIMIT=64

// Exact segment queries accelerated by static spatial bins. Expanded bounds
// include every segment that could be nearer than the existing64-unit cap.
const shoreSegments=shore.map((b,i)=>{
  const a=shore[(i+shore.length-1)%shore.length]
  return {a,b,dx:b.x-a.x,dz:b.z-a.z}
})
const nearestBins=new Map<string,number[]>(),crossingBins=new Map<number,number[]>()
const BIN=32,CROSSING_BIN=8
for(let i=0;i<shoreSegments.length;i++) {
  const {a,b}=shoreSegments[i]
  for(let x=Math.floor((Math.min(a.x,b.x)-DISTANCE_LIMIT)/BIN);x<=Math.floor((Math.max(a.x,b.x)+DISTANCE_LIMIT)/BIN);x++)
    for(let z=Math.floor((Math.min(a.z,b.z)-DISTANCE_LIMIT)/BIN);z<=Math.floor((Math.max(a.z,b.z)+DISTANCE_LIMIT)/BIN);z++) {
      const key=`${x},${z}`;let bin=nearestBins.get(key)
      if(!bin){bin=[];nearestBins.set(key,bin)}bin.push(i)
    }
  for(let z=Math.floor(Math.min(a.z,b.z)/CROSSING_BIN);z<=Math.floor(Math.max(a.z,b.z)/CROSSING_BIN);z++) {
    let bin=crossingBins.get(z);if(!bin){bin=[];crossingBins.set(z,bin)}bin.push(i)
  }
}
function shoreMetric(x: number, z: number) {
  if(x<bounds.minX-DISTANCE_LIMIT||x>bounds.maxX+DISTANCE_LIMIT||z<bounds.minZ-DISTANCE_LIMIT||z>bounds.maxZ+DISTANCE_LIMIT)
    return {distance:DISTANCE_LIMIT,gradient:[0,0]}
  let nearestX=0,nearestZ=0,squared=DISTANCE_LIMIT*DISTANCE_LIMIT,inside=false
  for(const i of nearestBins.get(`${Math.floor(x/BIN)},${Math.floor(z/BIN)}`)??[]) {
    const {a,dx,dz}=shoreSegments[i]
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)))
    const nx=x-a.x-dx*t,nz=z-a.z-dz*t,candidate=nx*nx+nz*nz
    if(candidate<squared){squared=candidate;nearestX=nx;nearestZ=nz}
  }
  for(const i of crossingBins.get(Math.floor(z/CROSSING_BIN))??[]) {
    const {a,b}=shoreSegments[i]
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside
  }
  const distance=Math.sqrt(squared)
  return {distance:(inside?-1:1)*distance,gradient:distance>=DISTANCE_LIMIT?[0,0]:
    [nearestX/Math.max(.001,distance),nearestZ/Math.max(.001,distance)]}
}

export function shoreDistance(x: number, z: number) { return shoreMetric(x, z).distance }

type Ridge = { z: number; width: number; points: { x: number; y: number }[] }
function ridge(z: number, width: number, pixels: number[][]): Ridge {
  return { z, width, points: pixels.map(([px, py]) => {
    const ray = imageRay(px, py)
    const point = reference.position.clone().addScaledVector(ray, (z - reference.position.z) / ray.z)
    return { x: point.x, y: point.y }
  }) }
}
const ridges = [
  ridge(-340, 51, [[-500,390],[0,340],[190,375],[290,375],[480,293],[575,346],[685,311],[755,350],[870,334],[1080,382],[1280,354],[1800,368]]),
  ridge(-237, 44, [[-500,405],[0,389],[160,418],[275,385],[398,347],[505,365],[591,393],[715,359],[812,340],[918,378],[1050,424],[1215,391],[1450,359],[2400,385]]),
  ridge(-162, 27, [[-500,435],[0,421],[140,443],[280,422],[402,399],[526,438],[638,450],[748,433],[856,410],[956,442],[1065,456],[1208,438],[1450,411],[2400,425]]),
]
const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function ridgeHeight(r: Ridge, x: number) {
  const points = r.points
  let i = 0
  while (i < points.length - 2 && points[i + 1].x < x) i++
  const a = points[i], b = points[i + 1]
  const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 2)]
  const t = THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1)
  const m0 = (b.y - before.y) / (b.x - before.x)
  const m1 = (after.y - a.y) / (after.x - a.x)
  return (2*t*t*t-3*t*t+1)*a.y + (t*t*t-2*t*t+t)*(b.x-a.x)*m0
    + (-2*t*t*t+3*t*t)*b.y + (t*t*t-t*t)*(b.x-a.x)*m1
}

export function hillHeight(x: number, z: number, knownDistance?: number) {
  const d = knownDistance ?? shoreDistance(x, z)
  if (d <= 0) return WATER_LEVEL - Math.min(9, -d * 0.34)
  let height = 1.8
  // Interleaved crests share this volume; there are no overlapping ridge strips.
  for (const r of ridges) {
    const diagonal = r.z + Math.sin(x * 0.014) * 7
    const next = ridgeHeight(r, x) * Math.exp(-(((z - diagonal) / r.width) ** 2))
    // A smooth union removes hard intersection creases between the volumes.
    const blend = Math.max(4 - Math.abs(height-next),0) / 4
    height = Math.max(height,next) + blend * blend
  }
  const bell = (v: number) => Math.exp(-v * v)
  const distant=(8+6*Math.sin(x*0.009+0.6)+4*Math.sin(x*0.023))*bell((z+710)/115)
    +(14+8*Math.sin(x*0.006-1.3)+5*Math.sin(x*0.019))*bell((z+1080)/155)
  const east = 28 * bell((x - 200) / 110) * bell((z + 35) / 105)
    + 22 * bell((x - 360) / 100) * bell((z + 114) / 92)
    + 15 * bell((x - 430) / 135) * bell((z - 100) / 110)
  const west = 17 * bell((x + 125) / 80) * bell((z + 23) / 70)
  const foreground = 10 * bell((z - 48) / 43) * (0.15 + 0.85 * smooth(2, 53, Math.abs(x + 4)))
  // The camera retreats over these permanent foreground folds after the lake.
  // Their tails lie below the existing near bank in the first view.
  const retreat = 18 * bell((x + 65) / 90) * bell((z - 130) / 50)
    + 14 * bell((x - 85) / 80) * bell((z - 180) / 55)
    + 11 * bell((x + 75) / 90) * bell((z - 225) / 60)
  height = Math.max(height, east, west, foreground, distant, retreat)
  const relief = (Math.sin(x * 0.09 + z * 0.05) + Math.sin(z * 0.17 - x * 0.04) * 0.35) * 0.35
  return WATER_LEVEL + (height + relief) * smooth(0, 18, d)
}

export function treeFromImage(px: number, py: number, pixelHeight: number): number[] {
  const direction = imageRay(px,py)
  const point = new THREE.Vector3()
  let previous = 40, hit = 700
  for (let distance = 40; distance <= 700; distance += 4) {
    point.copy(reference.position).addScaledVector(direction,distance)
    if (point.y <= hillHeight(point.x,point.z)) { hit=distance; break }
    previous=distance
  }
  for(let i=0;i<12;i++) {
    const distance=(previous+hit)*0.5
    point.copy(reference.position).addScaledVector(direction,distance)
    if(point.y>hillHeight(point.x,point.z)) previous=distance
    else hit=distance
  }
  point.copy(reference.position).addScaledVector(direction,hit)
  const scale = pixelHeight / 720 * 2 * (85-point.z) * Math.tan(Math.PI/8) / 9.2
  return [point.x,point.z,scale]
}

// The exact same bank vertices close both meshes. Dense bands at the waterline
// prevent the low tier from turning the wet edge into long triangular facets.
export function basinGeometry(kind: 'land' | 'water', lowTier: boolean) {
  const count = shore.length
  const rings = kind === 'water' ? (lowTier ? 34 : 50) : (lowTier ? 78 : 112)
  const gradients: number[] = [], surfaceNormals: number[] = []
  const positions: number[] = [], depths: number[] = [], distances: number[] = [], indices: number[] = []
  for (let row = 0; row <= rings; row++) {
    const t = row / rings
    for (let col = 0; col <= count; col++) {
      const bank = shore[col % count]
      let x: number, z: number
      if (kind === 'water') {
        x = THREE.MathUtils.lerp(center.x, bank.x, t)
        z = THREE.MathUtils.lerp(center.y, bank.z, t)
      } else {
        const dx = bank.x - center.x, dz = bank.z - center.y
        const stretch = Math.min(dx > 0 ? (1200 - center.x) / dx : (-900 - center.x) / dx,
          dz > 0 ? (500 - center.y) / dz : (-1450 - center.y) / dz)
        const radial = 1 + (stretch - 1) * t * t
        x = center.x + dx * radial
        z = center.y + dz * radial
      }
      const metric = shoreMetric(x, z)
      const d = row === (kind === 'water' ? rings : 0) ? 0 : metric.distance
      gradients.push(...metric.gradient)
      const ground = hillHeight(x, z, d)
      const [gx,gz] = metric.gradient
      const eps=0.25
      const normal=new THREE.Vector3(
        hillHeight(x-eps,z,d-eps*gx)-hillHeight(x+eps,z,d+eps*gx),
        2*eps,
        hillHeight(x,z-eps,d-eps*gz)-hillHeight(x,z+eps,d+eps*gz)).normalize()
      surfaceNormals.push(normal.x,normal.y,normal.z)
      positions.push(x, kind === 'water' ? WATER_LEVEL : ground, z)
      distances.push(Math.abs(d))
      depths.push(Math.max(0, WATER_LEVEL - ground))
      if (row < rings && col < count) {
        const a = row * (count + 1) + col, b = a + count + 1
        if (kind !== 'water' || row > 0) indices.push(a, b, a + 1)
        indices.push(a + 1, b, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aShoreDistance', new THREE.Float32BufferAttribute(distances, 1))
  geometry.setAttribute('aShoreGradient', new THREE.Float32BufferAttribute(gradients, 2))
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // Normalize winding once, including reflection: all land normals face up.
  const normals = geometry.getAttribute('normal')
  let normalY = 0
  for (let i = 0; i < normals.count; i++) normalY += normals.getY(i)
  if (normalY < 0) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
  }
  if (kind==='land') geometry.setAttribute('normal',new THREE.Float32BufferAttribute(surfaceNormals,3))
  const finalNormals=geometry.getAttribute('normal')
  for (let row=0;row<=rings;row++) {
    const a=row*(count+1), b=a+count
    const normal=new THREE.Vector3().fromBufferAttribute(finalNormals,a)
      .add(new THREE.Vector3().fromBufferAttribute(finalNormals,b)).normalize()
    finalNormals.setXYZ(a,normal.x,normal.y,normal.z);finalNormals.setXYZ(b,normal.x,normal.y,normal.z)
  }
  return geometry
}
