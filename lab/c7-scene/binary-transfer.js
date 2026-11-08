import {ZSTDDecoder} from './vendor/zstd/zstddec.js';
import {binaryTransports} from './binary-transports.js';
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
let brotliSupport,zstdDecoder,retainedDecoderBytes=0,peakDecoderBytes=0;
// Dropping the cache never invalidates a decoder held by another in-flight
// caller. Its owned memory becomes collectible after that caller finishes.
export function releaseBinaryDecoder(){zstdDecoder=undefined;retainedDecoderBytes=0;}
export function binaryDecoderDiagnostics(){return{cached:Boolean(zstdDecoder),retainedBytes:zstdDecoder?retainedDecoderBytes:0,peakBytes:peakDecoderBytes};}
const getZstd=()=>zstdDecoder??=(async()=>{const d=new ZSTDDecoder();await d.init();return d;})();
function hasBrotli(){
 if(brotliSupport===undefined){try{new DecompressionStream('brotli');brotliSupport=true;}catch{brotliSupport=false;}}
 return brotliSupport;
}
// Native Brotli remains preferred. The bundled decoder gives other browsers
// a smaller lossless body; missing/blocked alternatives keep the gzip path.
export async function fetchBinaryInput(name,{signal,base=new URL('.',import.meta.url)}={}){
 signal?.throwIfAborted();
 const meta=binaryTransports[name];
 const request=async file=>{
  const response=await fetch(new URL(file,base),{signal});
  if(!response.ok)throw Error(`C7 startup input HTTP ${response.status}: ${file}`);
  const bytes=await response.arrayBuffer();signal?.throwIfAborted();return bytes;
 };
 if(meta&&hasBrotli()){
  try{
   const bytes=await request(meta.file);
   if(bytes.byteLength!==meta.bytes||await digest(bytes)!==meta.sha256)throw Error('Brotli transport checksum mismatch');
   signal?.throwIfAborted();return{bytes,format:'brotli',meta};
  }catch(error){signal?.throwIfAborted();/* Missing/damaged alternative: use the established gzip body. */}
 }
 if(meta?.zstd&&typeof WebAssembly==='object'){
  try{
   const bytes=await request(meta.zstd.file);
   if(bytes.byteLength!==meta.zstd.bytes||await digest(bytes)!==meta.zstd.sha256)throw Error('Zstd transport checksum mismatch');
   return{bytes,format:'zstd',meta,fallbackUrl:new URL(name,base).href};
  }catch(error){signal?.throwIfAborted();}
 }
 return{bytes:await request(name),format:name.endsWith('.gz')?'gzip':null,meta};
}
export async function decompressBinaryInput(input,{signal}={}){
 signal?.throwIfAborted();
 if(!input||!['gzip','brotli','zstd'].includes(input.format))throw Error('Unsupported C7 binary transport');
 let {bytes,format}=input;const{meta}=input;
 const expected=format==='brotli'?meta?.sha256:format==='zstd'?meta?.zstd?.sha256:meta?.gzipSha256;
 if(meta&&await digest(bytes)!==expected)throw Error('Binary transport checksum mismatch');
 let raw;
 if(format==='zstd'){
  try{
   const decoder=await getZstd();signal?.throwIfAborted();
   raw=decoder.decode(new Uint8Array(bytes),meta.rawBytes);
   retainedDecoderBytes=decoder.memoryBytes;peakDecoderBytes=Math.max(peakDecoderBytes,retainedDecoderBytes);
   if(raw.byteLength!==meta.rawBytes||await digest(raw)!==meta.rawSha256)throw Error('Zstd payload mismatch');
   raw=raw.byteOffset===0&&raw.byteLength===raw.buffer.byteLength?raw.buffer:raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
  }catch(error){
   raw=undefined;signal?.throwIfAborted();
   const response=await fetch(input.fallbackUrl,{signal});if(!response.ok)throw Error('Gzip fallback HTTP '+response.status);
   bytes=await response.arrayBuffer();if(await digest(bytes)!==meta.gzipSha256)throw Error('Gzip fallback checksum mismatch');
   format='gzip';input.format=format;input.bytes=bytes;
  }
 }
 if(!raw)raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format),{signal})).arrayBuffer();
 signal?.throwIfAborted();
 if(meta&&raw.byteLength!==meta.rawBytes)throw Error('Binary payload checksum mismatch');
 return raw;
}
