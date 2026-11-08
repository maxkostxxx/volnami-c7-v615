import { BufferGeometry, BufferAttribute } from 'three'
import type { GroundCoverData } from './ground-cover-data'
type PackedGeometry={attributes:Record<string,{array:Float32Array;itemSize:number}>;index:Uint32Array}
type WorkerResult={land:PackedGeometry;water:PackedGeometry;cover:GroundCoverData;cpuMs:number;error?:string}
const unpack=(data:PackedGeometry)=>{
  const geometry=new BufferGeometry()
  for(const [name,a]of Object.entries(data.attributes))geometry.setAttribute(name,new BufferAttribute(a.array,a.itemSize))
  geometry.setIndex(new BufferAttribute(data.index,1))
  return geometry
}
/** No renderer/DOM in the worker; cancellation and deadline own its lifetime. */
export function prepareGeometry(lowTier:boolean,signal:AbortSignal) {
  return new Promise<{land:BufferGeometry;water:BufferGeometry;cover:GroundCoverData;cpuMs:number}>((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
    const worker=new Worker(new URL('./geometry-worker.ts',import.meta.url))
    const clean=()=>{clearTimeout(deadline);signal.removeEventListener('abort',abort);worker.terminate()}
    const fail=(error:Error)=>{clean();reject(error)}
    const abort=()=>fail(new DOMException('Aborted','AbortError'))
    const deadline=setTimeout(()=>fail(new Error('Geometry preparation timed out')),5000)
    signal.addEventListener('abort',abort,{once:true})
    worker.onerror=()=>fail(new Error('Geometry worker failed'))
    worker.onmessage=(event:MessageEvent<WorkerResult>)=>{
      const data=event.data
      if(data.error){fail(new Error(data.error));return}
      clean();resolve({land:unpack(data.land),water:unpack(data.water),cover:data.cover,cpuMs:data.cpuMs})
    }
    worker.postMessage({lowTier})
  })
}
