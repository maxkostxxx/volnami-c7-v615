import fs from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import * as T from 'three';
import {decodeHorizonField,loadHorizonTextures} from '../lab/c7-scene/sky-horizon.js';
const output=process.env.QA_OUTPUT;if(!output)throw Error('QA_OUTPUT required');await fs.mkdir(output,{recursive:true});
const files=await Promise.all(['sky-data','left-sky-data'].map(d=>fs.readFile(`lab/c7-scene/${d}/field.rgba16f.gz`))),encoded=files.map(gunzipSync),sha=b=>createHash('sha256').update(b).digest('hex'),expected=[];
for(let i=0;i<2;i++){const bytes=encoded[i];expected.push(bytes.subarray(32,64).toString('hex'));}
const rows=[],nativeFetch=globalThis.fetch,nativeDispose=T.Texture.prototype.dispose;let events=[],disposed=0;
T.Texture.prototype.dispose=function(){disposed++;return nativeDispose.call(this);};
function mock({delays=[0,0],fail=-1,corrupt=-1}={}){
 events=[];disposed=0;
 globalThis.fetch=async(url,{signal}={})=>{const i=String(url).includes('left-sky-data')?1:0;events.push({type:'start',i,at:performance.now()});return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);events.push({type:'abort',i});reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);events.push({type:'response',i});resolve(new Response(i===corrupt?gzipSync(new Uint8Array(3)):files[i],{status:i===fail?503:200}));},delays[i]);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });};
}
async function test(name,fn){const start=performance.now();try{const result=await fn();rows.push({name,pass:true,milliseconds:performance.now()-start,...result});}catch(e){rows.push({name,pass:false,error:e.stack});throw e;}finally{await fs.writeFile(output+'/results.json',JSON.stringify({rows},null,2));}}
try{
 for(const delays of [[90,0],[0,90],[90,90]])await test('parallel success '+delays.join('/'),async()=>{mock({delays});const value=await loadHorizonTextures();const textures=[value.texture,value.localTexture];assert.equal(events[0].type,'start');assert.equal(events[1].type,'start');const hashes=textures.map(t=>sha(new Uint8Array(t.image.data.buffer)));assert.deepEqual(hashes,expected);for(const t of textures)t.dispose();assert.equal(disposed,2);return{hashes,events};});
 await test('second HTTP failure cancels first fetch',async()=>{mock({delays:[1000,5],fail:1});await assert.rejects(loadHorizonTextures(),/503/);assert(events.some(e=>e.type==='abort'&&e.i===0));assert.equal(disposed,0);return{events,disposed};});
 // Current transport integrity rejects this corrupt body before field decoding.
 // Either rejection layer must still dispose the first decoded texture.
 await test('second decode failure disposes first texture',async()=>{mock({corrupt:1});await assert.rejects(loadHorizonTextures(),/Invalid encoded horizon size|Binary transport checksum mismatch/);assert.equal(disposed,1);return{disposed};});
 await test('pre-abort requests nothing',async()=>{mock();const c=new AbortController();c.abort();await assert.rejects(loadHorizonTextures({signal:c.signal}),{name:'AbortError'});assert.equal(events.length,0);return{events};});
 await test('abort cancels both active fetches',async()=>{mock({delays:[1000,1000]});const c=new AbortController(),timer=setTimeout(()=>c.abort(),10);await assert.rejects(loadHorizonTextures({signal:c.signal}),{name:'AbortError'});clearTimeout(timer);assert.equal(events.filter(e=>e.type==='abort').length,2);return{events};});
 await test('decode abort at cooperative yield',async()=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),0),start=performance.now();await assert.rejects(decodeHorizonField(encoded[0].buffer.slice(encoded[0].byteOffset,encoded[0].byteOffset+encoded[0].length),512,256,{signal:c.signal}),{name:'AbortError'});clearTimeout(timer);return{abortSettledMs:performance.now()-start};});
 await test('raw legacy data obeys pre-abort',async()=>{const c=new AbortController();c.abort();await assert.rejects(decodeHorizonField(new ArrayBuffer(8*17),1,1,{signal:c.signal}),{name:'AbortError'});});
 await test('checksum rejection retained',async()=>{const bad=Buffer.from(encoded[1]);bad[32]^=1;await assert.rejects(decodeHorizonField(bad.buffer.slice(bad.byteOffset,bad.byteOffset+bad.length),256,128),/checksum/);});
 console.log({tests:rows.length,passed:rows.filter(r=>r.pass).length,expected});
}finally{globalThis.fetch=nativeFetch;T.Texture.prototype.dispose=nativeDispose;}
