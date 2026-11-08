import {fetchBinaryInput,decompressBinaryInput} from './binary-transfer.js';
import {startupDataKey} from './startup-data-key.js';

const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');

export async function decodeStartupData(buffer,meta,{signal}={}){
 signal?.throwIfAborted();
 if(meta.schema!==1||meta.format!=='C7-startup-uint8-float64-v1'||meta.parameters?.depthStretch!==2.1||meta.parameters?.depthPivot!==85)throw Error('Unsupported startup data');
 const {cells,fillCells}=meta.placement??{};
 if(![cells,fillCells].every(n=>Number.isInteger(n)&&n>=0&&n<=60000))throw Error('Invalid startup placement size');
 const expected=65536+(cells+fillCells)*24;
 if(meta.transport!==undefined){
  if(meta.transport!=='byteplanes24-v1'||buffer.byteLength!==expected)throw Error('Invalid startup byte planes');
  const input=new Uint8Array(buffer),restored=new Uint8Array(expected),count=cells+fillCells;
  restored.set(input.subarray(0,65536));
  for(let c=0;c<24;c++)for(let i=0;i<count;i++)restored[65536+i*24+c]=input[65536+c*count+i];
  buffer=restored.buffer;
 }
 if(buffer.byteLength!==expected||meta.bytes!==expected||await digest(buffer)!==meta.sha256)throw Error('Startup field checksum or size mismatch');
 signal?.throwIfAborted();
 const view=new DataView(buffer);let offset=65536;
 const read=count=>{const result=[];let total=0;for(let i=0;i<count;i++){
  const x=view.getFloat64(offset,true),z=view.getFloat64(offset+8,true),weight=view.getFloat64(offset+16,true);offset+=24;
  if(![x,z,weight].every(Number.isFinite)||weight<=0||weight>2||x< -330||x>=330||z< -405||z>=100)throw Error('Invalid startup placement cell');
  result.push({x,z,weight});total+=weight;
 }return{cells:result,total};};
 const crest=read(cells),fill=read(fillCells),atmosphere=meta.atmosphere;
 if(!atmosphere||!Number.isFinite(atmosphere.minimumHeight)||!Number.isFinite(atmosphere.heightRange)||atmosphere.heightRange<1)throw Error('Invalid atmosphere range');
 return{placement:{cells:crest.cells,totalWeight:crest.total,fillCells:fill.cells,fillWeight:fill.total},atmosphere:{...atmosphere,data:new Uint8Array(buffer,0,65536).slice()}};
}

// Optional acceleration. The caller retains procedural fallback for a failed
// cache, and owns cancellation. No GL object is acquired by this loader.
export async function loadStartupData({signal,timeoutMs=4000,inputs}={}){
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Startup cache timeout','TimeoutError')),timeoutMs);
 try{
  controller.signal.throwIfAborted();
  const request=async name=>{if(inputs)return inputs.take('./startup-data/'+name,controller.signal);const r=await fetch(new URL('./startup-data/'+name,import.meta.url),{signal:controller.signal});if(!r.ok)throw Error('Startup cache HTTP '+r.status);return r.arrayBuffer();};
  const[manifestBytes,gzip]=await Promise.all([request('manifest.json'),inputs?inputs.takeCompressed('./startup-data/fields.bin.gz',controller.signal):fetchBinaryInput('./startup-data/fields.bin.gz',{signal:controller.signal})]);
  if(await digest(manifestBytes)!==startupDataKey)throw Error('Startup manifest checksum mismatch');
  const meta=JSON.parse(new TextDecoder().decode(manifestBytes));
  if(gzip.format==='gzip'&&(gzip.bytes.byteLength!==meta.gzipBytes||await digest(gzip.bytes)!==meta.gzipSha256))throw Error('Startup transport checksum mismatch');
  controller.signal.throwIfAborted();
  const raw=await decompressBinaryInput(gzip,{signal:controller.signal});
  return await decodeStartupData(raw,meta,{signal:controller.signal});
 }catch(error){controller.abort(error);throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
