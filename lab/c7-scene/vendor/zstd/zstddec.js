// Instance-owned adaptation of zstddec-wasm; unchanged WASM, see LICENSE.
// Cache only compiled code. No module-global instance, heap or resolved
// instance promise may keep a completed scene's decoder memory alive.
import {wasmBase64} from './wasm-source.js';
let compiled;
const compile=()=>compiled??=WebAssembly.compile(Uint8Array.from(atob(wasmBase64),c=>c.charCodeAt(0)));
export class ZSTDDecoder{
 async init(){
  if(this.instance)return;
  if(!this.initializing)this.initializing=(async()=>{
   const imports={env:{emscripten_notify_memory_growth:()=>{if(this.instance)this.heap=new Uint8Array(this.instance.exports.memory.buffer);}}};
   this.instance=await WebAssembly.instantiate(await compile(),imports);
   this.heap=new Uint8Array(this.instance.exports.memory.buffer);
  })();
  await this.initializing;
 }
 get memoryBytes(){return this.instance?.exports.memory.buffer.byteLength??0;}
 decode(input,decodedSize=0){
  if(!this.instance)throw Error('ZSTDDecoder: await init before decoding');
  const api=this.instance.exports;
  let source=0,target=0;
  try{
   source=api.malloc(input.byteLength);if(!source)throw Error('Zstd input allocation failed');
   this.heap.set(input,source);
   const size=decodedSize||Number(api.ZSTD_findDecompressedSize(source,input.byteLength));
   if(!Number.isSafeInteger(size)||size<0||size>67108864)throw Error('Invalid C7 Zstd decoded size');
   target=api.malloc(size);if(!target)throw Error('Zstd output allocation failed');
   const written=api.ZSTD_decompress(target,size,source,input.byteLength);
   if(api.ZSTD_isError(written)||written!==size)throw Error('Zstd decompression failed');
   return this.heap.slice(target,target+written);
  }finally{if(target)api.free(target);if(source)api.free(source);}
 }
}
