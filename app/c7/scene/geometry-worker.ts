import { basinGeometry } from './geography'
import { groundCoverData } from './ground-cover-data'
import type { BufferGeometry } from 'three'
const pack=(geometry:BufferGeometry)=>({
  attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,{array:a.array as Float32Array,itemSize:a.itemSize}])),
  index:new Uint32Array(geometry.index!.array),
})
self.addEventListener('message',(event:MessageEvent<{lowTier:boolean}>)=>{
  try {
    const started=performance.now(),low=event.data.lowTier
    const land=pack(basinGeometry('land',low)),water=pack(basinGeometry('water',low)),cover=groundCoverData(low)
    const transfer:Transferable[]=[land.index.buffer,water.index.buffer,cover.matrices.buffer]
    for(const g of [land,water])for(const a of Object.values(g.attributes))transfer.push(a.array.buffer as ArrayBuffer)
    self.postMessage({land,water,cover,cpuMs:performance.now()-started},{transfer})
  } catch(error) {self.postMessage({error:error instanceof Error?error.message:'Geometry preparation failed'})}
})
