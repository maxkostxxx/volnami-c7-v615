// One-shot CPU preparation. Buffers have one owner after postMessage transfer;
// the renderer keeps its own terrain sampler and hydrates ordinary geometry.
export function packGrass(group) {
 const packet=group.userData.preparationPacket();
 return packet;
}
export function packetBuffers(packet) {
 const buffers=new Set();
 for(const record of packet.records)for(const key of ['order','root','normal','shape'])buffers.add(record[key].buffer);
 return [...buffers];
}
export function samplerFromPacket(packet) {
 const {xs,zs,ranges,cellLeaf,indices,positions:p}=packet,nx=xs.length,nz=zs.length;
 function interval(axis,value){let lo=0,hi=axis.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(axis[m]<=value)lo=m;else hi=m;}return lo;}
 return(x,z)=>{
  if(x<xs[0]||x>xs[nx-1]||z<zs[0]||z>zs[nz-1])return -Infinity;
  const i=interval(xs,x),j=interval(zs,z),leaf=cellLeaf[j*(nx-1)+i];
  for(let k=ranges[leaf*2];k<ranges[leaf*2+1];k+=3){
   const a=indices[k],b=indices[k+1],c=indices[k+2],ax=p[a*3],az=p[a*3+2],bx=p[b*3],bz=p[b*3+2],cx=p[c*3],cz=p[c*3+2];
   const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
   if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)return u*p[a*3+1]+v*p[b*3+1]+w*p[c*3+1];
  }
  throw Error('Preparation sampler triangle not found');
 };
}
export function grassJob(worker,packet,options,{signal,timeout=15000}={}) {
 let settled=false,timer,resolve,reject;
 const promise=new Promise((a,b)=>{resolve=a;reject=b;});
 function finish(error,value){
  if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
  worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();
  error?reject(error):resolve(value);
 }
 const abort=()=>finish(signal.reason??new DOMException('Preparation aborted','AbortError'));
 worker.onmessage=({data:m})=>{
  if(m.type==='grass-built')finish(null,{packet:m.packet,timing:m.timing});
  else if(m.type==='failed')finish(Error(m.message));
 };
 worker.onerror=event=>{event.preventDefault();finish(Error(event.message||'Preparation worker failed'));};
 worker.onmessageerror=()=>finish(Error('Preparation message could not be decoded'));
 signal?.addEventListener('abort',abort,{once:true});
 timer=setTimeout(()=>finish(Error('Preparation timed out')),timeout);
 try{signal?.throwIfAborted();worker.postMessage({type:'build',packet,options});}catch(error){finish(error);}
 promise.catch(()=>{});
 return {promise,dispose(){finish(new DOMException('Preparation disposed','AbortError'));}};
}
