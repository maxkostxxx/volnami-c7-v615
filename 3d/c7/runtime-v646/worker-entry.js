import {prepareStartupInputs} from './startup-inputs.js';
// Dedicated rendering owner. The page keeps DOM, scroll and accessibility.
// CPU receipt and GPU admission are separate. Keep the latest requested pose
// and at most two submitted frames, so scrolling cannot build an old GPU queue.
let grassPreparationWorker;
let inputs,world,controller,moduleTask,initialized=false,disposed=false,lost=false,debug=false,size,gl;
let supported=false;
let active=true,pending,pollTimer,fences=[];
const errorText=error=>error instanceof Error?error.message:String(error);
function stopPolling(){clearTimeout(pollTimer);pollTimer=undefined;}
function clearFences(){for(const fence of fences)gl?.deleteSync(fence);fences=[];}
function fail(error){grassPreparationWorker?.terminate();inputs?.dispose();stopPolling();pending=undefined;if(!disposed)postMessage({type:'failed',message:errorText(error)});}
function snapshot(){
 const state=debug?world.diagnostics():world.state;
 return debug?state:{frames:state.frames,solar:state.solar,travel:state.travel,time:state.time};
}
function observeCompleted(){
 while(fences.length){
  const status=gl.clientWaitSync(fences[0],0,0);
  if(status===gl.TIMEOUT_EXPIRED)return;
  if(status===gl.WAIT_FAILED){if(gl.isContextLost())return;throw Error('C7 GPU fence failed');}
  gl.deleteSync(fences.shift());
 }
}
function markSubmitted(){
 const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
 if(!fence&&gl.isContextLost())return false;
 if(!fence)throw Error('C7 GPU fence unavailable');
 fences.push(fence);gl.flush();
 return true;
}
function pump(){
 stopPolling();
 if(!active||!pending||!world||disposed||lost)return;
 observeCompleted();
 if(fences.length>=2){
  // Never wait synchronously for the GPU. Poll only while a pose is waiting;
  // pause/cover/dispose stops this timer, and an idle scene does no polling.
  pollTimer=setTimeout(()=>{pollTimer=undefined;try{pump();}catch(error){fail(error);}},4);
  return;
 }
 const message=pending;pending=undefined;
 const next=message.size;
 if(next.width!==size.width||next.height!==size.height||next.low!==size.low){
  size=next;world.resize(size.width,size.height,size.low);
 }
 world.render(message.progress,message.time);
 if(!markSubmitted())return;
 postMessage({type:'frame',sequence:message.sequence,state:snapshot()});
}
try{
 const canvas=new OffscreenCanvas(1,1),gl=canvas.getContext('webgl2');
 supported=!!gl&&typeof requestAnimationFrame==='function'&&typeof createImageBitmap==='function'
  &&!!new OffscreenCanvas(1,1).getContext('2d');
 gl?.getExtension('WEBGL_lose_context')?.loseContext();
 postMessage({type:'capable',supported});
}catch{postMessage({type:'capable',supported:false});}
function prepare(mobile){
 // Avoid the extra transient sampler/geometry memory on phones and small
 // devices. Unknown deviceMemory does not justify allocating a second heap.
 if(mobile===false&&(navigator.deviceMemory??0)>=8&&(navigator.hardwareConcurrency??0)>=6&&!grassPreparationWorker){
  try{grassPreparationWorker=new Worker(new URL('./grass-prep-entry.js',import.meta.url),{type:'module'});}catch{}
 }
 if(moduleTask)return;
 controller=new AbortController();
 inputs=prepareStartupInputs({signal:controller.signal});
 moduleTask=import('./world.js');
 // Observe early rejection before init attaches its await. Init still receives
 // the original error, and all input ownership remains inside this worker.
 moduleTask.catch(()=>inputs?.dispose());
}
self.onmessage=async({data:message})=>{
 try{
  if(message.type==='probe'){
   postMessage({type:'capable',supported:!disposed&&supported});
  }else if(message.type==='warmup'){
   if(!disposed&&supported)prepare(message.mobile);
  }else if(message.type==='init'){
   if(initialized||disposed)throw Error('C7 worker already initialized');
   initialized=true;prepare(message.mobile);debug=message.debug;size=message.size;
   const canvas=message.canvas;
   canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();lost=true;pending=undefined;stopPolling();clearFences();
    if(!disposed)postMessage({type:'contextlost'});
   });
   canvas.addEventListener('webglcontextrestored',()=>{
    lost=false;if(!disposed)postMessage({type:'contextrestored'});
   });
   const{createC7Scene}=await moduleTask;controller.signal.throwIfAborted();
   world=await createC7Scene({canvas,...size,mobile:message.mobile===true,inputs,grassPreparationWorker,signal:controller.signal});
   if(disposed){world.dispose();return;}
   gl=world.renderer.getContext();markSubmitted();
   postMessage({type:'ready',state:snapshot()});
  }else if(message.type==='render'){
   if(!world||disposed)return;
   postMessage({type:'accepted'});
   if(lost||!active)return;
   pending=message;pump();
  }else if(message.type==='active'){
   active=message.active;
   if(!active){pending=undefined;stopPolling();}
  }else if(message.type==='restore'){
   world?.restore();
  }else if(message.type==='dispose'){
   disposed=true;pending=undefined;stopPolling();clearFences();
   grassPreparationWorker?.terminate();controller?.abort();world?.dispose();postMessage({type:'disposed'});close();
  }
 }catch(error){fail(error);}
};
