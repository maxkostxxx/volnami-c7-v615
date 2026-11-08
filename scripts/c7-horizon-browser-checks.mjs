// Browser stream/decode/abort checks, without a WebGL renderer.
import {chromium,firefox,webkit} from 'playwright';import fs from 'node:fs/promises';
const output=process.env.QA_OUTPUT,url=process.env.QA_URL;if(!output||!url)throw Error('QA_OUTPUT and QA_URL required');await fs.mkdir(output,{recursive:true});
const rows=[],errors=[];
for(const engine of ['chromium','firefox','webkit']){
 const b=await({chromium,firefox,webkit}[engine]).launch({headless:true}),p=await b.newPage();p.on('pageerror',e=>errors.push({engine,error:e.message}));
 try{
  await p.route('**/horizon-check.html',r=>r.fulfill({contentType:'text/html',body:'<html><link rel="icon" href="data:,"></html>'}));await p.goto(url+'/horizon-check.html');
  const data=await p.evaluate(async()=>{
   const T=await import('/3d/c7/runtime-v395/vendor/three/three.module.js'),{loadHorizonTextures,decodeHorizonField}=await import('/3d/c7/runtime-v395/sky-horizon.js'),results=[],assert=(x,m)=>{if(!x)throw Error(m)},hash=async a=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',a))].map(v=>v.toString(16).padStart(2,'0')).join('');
   const bodies=await Promise.all(['sky-data','left-sky-data'].map(d=>fetch('/3d/c7/runtime-v395/'+d+'/field.rgba16f.gz').then(r=>r.arrayBuffer())));
   const nativeFetch=window.fetch,nativeDispose=T.Texture.prototype.dispose;let disposed=0,events=[];
   T.Texture.prototype.dispose=function(){disposed++;return nativeDispose.call(this)};
   function mock({delays=[0,0],fail=-1,corrupt=-1}={}){disposed=0;events=[];window.fetch=(url,{signal}={})=>{const i=String(url).includes('left-sky-data')?1:0;events.push({event:'start',i,at:performance.now()});return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);events.push({event:'abort',i});reject(signal.reason)},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);events.push({event:'response',i});resolve(new Response(i===corrupt?new Uint8Array(2):bodies[i],{status:i===fail?503:200}))},delays[i]);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});};}
   async function rejected(promise){try{await promise;throw Error('Expected rejection')}catch(e){assert(e.message!=='Expected rejection','Missing rejection');return{name:e.name,message:e.message}}}
   try{
    mock({delays:[40,80]});const t=await loadHorizonTextures(),textures=[t.texture,t.localTexture],hashes=[];for(const tx of textures){hashes.push(await hash(tx.image.data));tx.dispose()}
    assert(events[1].event==='start'&&disposed===2,'Parallel load/ownership');assert(hashes[0]==='1d0252f4b9c9b29c1f97e4305f3c94984002ff3f3d230f4663a76abfbfb5b206','Main hash');
    assert(hashes[1]==='6b749ff1320d1282eac70d8dd42ca1e04d338d1181d572dc4f1d262be63872a3','Local hash');results.push({name:'streams and exact decoded hashes',pass:true,hashes,events});
    mock({delays:[1000,5],fail:1});const http=await rejected(loadHorizonTextures());assert(events.some(e=>e.event==='abort'&&e.i===0),'Sibling request not cancelled');results.push({name:'second HTTP failure cancels first',pass:true,error:http});
    mock({corrupt:1});const decode=await rejected(loadHorizonTextures());assert(disposed===1,'First texture not disposed');results.push({name:'second decompression failure cleans first',pass:true,error:decode,disposed});
    mock({delays:[1000,1000]});const c=new AbortController(),pending=loadHorizonTextures({signal:c.signal});setTimeout(()=>c.abort(),5);const abort=await rejected(pending);assert(abort.name==='AbortError'&&events.filter(e=>e.event==='abort').length===2,'Fetch abort failed');results.push({name:'fetch abort',pass:true,error:abort});
    const encoded=await new Response(new Blob([bodies[0]]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),d=new AbortController();setTimeout(()=>d.abort(),0);const start=performance.now(),aborted=await rejected(decodeHorizonField(encoded,512,256,{signal:d.signal}));assert(aborted.name==='AbortError','Decode abort');results.push({name:'decode abort at yield',pass:true,settledMs:performance.now()-start});
   }finally{window.fetch=nativeFetch;T.Texture.prototype.dispose=nativeDispose;}
   return results;
  });rows.push({engine,rows:data});console.log({engine,tests:data.length});
 }catch(e){errors.push({engine,error:e.stack});}finally{await b.close();await fs.writeFile(output+'/results.json',JSON.stringify({kind:'Browser DecompressionStream, decoder and texture ownership; fetch faults mocked, no GPU texture upload.',rows,errors},null,2));}
}if(errors.length)process.exitCode=1;
