import { Object3D } from 'three'
import { hillHeight, shoreDistance } from './geography'

/** Deterministic CPU-only placement, transferable from a worker. */
export function groundCoverData(lowTier: boolean) {
  const spacing=lowTier?.82:.58
  const columns=Math.ceil(320/spacing),rows=Math.ceil(345/spacing)
  const matrices=new Float32Array(columns*rows*16),dummy=new Object3D()
  const hash=(i:number)=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n)}
  let count=0,row=0,minY=Infinity,maxY=-Infinity
  for(let rowZ=-35;rowZ<310;row++) {
    const spread=Math.min(1,Math.max(0,(rowZ-125)/55))
    const step=spacing*(1+.65*spread*spread*(3-2*spread))
    for(let col=0;col<Math.ceil(320/step);col++) {
      const seed=row*columns+col
      const x=-160+(col+hash(seed*3))*step,z=rowZ+hash(seed*3+1)*step
      const distance=shoreDistance(x,z)
      if(distance<.9)continue
      const edge=Math.min(1,Math.max(0,(distance-.6)/2));
      const h=(.12+hash(seed*5+7)*.18)*(lowTier?1.18:1)*edge,y=hillHeight(x,z,distance)-.015
      dummy.position.set(x,y,z)
      dummy.rotation.set(0,hash(seed*3+2)*Math.PI*2,0)
      dummy.scale.set(lowTier?1.25:1,h,1)
      dummy.updateMatrix();dummy.matrix.toArray(matrices,count++*16)
      minY=Math.min(minY,y);maxY=Math.max(maxY,y+h)
    }
    rowZ+=step
  }
  // Conservative sphere includes blade bend, wind and final-row jitter.
  const center:[number,number,number]=[0,(minY+maxY)/2,138]
  const radius=Math.hypot(162,(maxY-minY)/2+2,175)
  return {matrices,count,center,radius}
}
export type GroundCoverData=ReturnType<typeof groundCoverData>
