// Required binary I/O overlaps module evaluation. Terrain unlocks CPU scene
// construction; horizon fields are consumed later. Release their HTTP queue
// after the terrain body settles so they do not delay that prerequisite.
// Every body has one owner/consumer; the barrier retains no terrain bytes.
export function prepareStartupInputs({compactHorizon=true,signal,base=new URL('.',import.meta.url)}={}){
 signal?.throwIfAborted();
 const names=['./terrain-cache/manifest.json','./terrain-cache/geometry.bin.gz','./terrain.js',
  './startup-data/manifest.json','./startup-data/fields.bin.gz',
  ...(compactHorizon?['./mobile-data/sky-data.gz','./mobile-data/left-sky-data.gz']:['./sky-data/field.rgba16f.gz','./left-sky-data/field.rgba16f.gz'])];
 let releaseTerrain;
 const terrainSettled=new Promise(resolve=>{releaseTerrain=resolve;});
 const horizonNames=new Set(names.slice(-2));
 const records=new Map();let disposed=false,claimed=0,started=0;
 const abortRoot=()=>dispose(signal.reason);
 function dispose(reason=new DOMException('Startup inputs released','AbortError')){
  if(disposed)return;disposed=true;signal?.removeEventListener('abort',abortRoot);
  for(const record of records.values()){
   record.controller.abort(reason);
   record.promise.then(()=>{record.promise=null},()=>{record.promise=null});
  }
  records.clear();
 }
 signal?.addEventListener('abort',abortRoot,{once:true});
 for(const name of names){
  const controller=new AbortController();
  const promise=(async()=>{
   if(horizonNames.has(name))await terrainSettled;
   controller.signal.throwIfAborted();started++;
   const response=await fetch(new URL(name,base),{signal:controller.signal});
   if(!response.ok)throw Error(`C7 startup input HTTP ${response.status}: ${name}`);
   const bytes=await response.arrayBuffer();controller.signal.throwIfAborted();return bytes;
  })();
  // Failure must release the queue too: procedural terrain fallback still
  // needs the horizon fields. Resolve with no body to avoid retaining a copy.
  if(name==='./terrain-cache/geometry.bin.gz')promise.then(()=>releaseTerrain(),()=>releaseTerrain());
  promise.catch(()=>{});records.set(name,{controller,promise,claimed:false});
 }
 return{
  async take(name,consumerSignal){
   consumerSignal?.throwIfAborted();
   if(disposed)throw new DOMException('Startup inputs released','AbortError');
   const record=records.get(name);
   if(!record||record.claimed)throw Error('Startup input unavailable or already claimed: '+name);
   record.claimed=true;claimed++;
   const abort=()=>record.controller.abort(consumerSignal.reason);
   consumerSignal?.addEventListener('abort',abort,{once:true});
   try{const bytes=await record.promise;consumerSignal?.throwIfAborted();return bytes;}
   finally{consumerSignal?.removeEventListener('abort',abort);records.delete(name);record.promise=null;}
  },
  dispose,
  diagnostics(){return{scheduled:names.length,started,claimed,pending:records.size,disposed};},
 };
}
