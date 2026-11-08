// A server-rendered, static bootstrap. The existing rendering worker can fetch
// and evaluate the world while React hydrates; it cannot render before init.
// Client-side navigation still uses the ordinary worker creation path.
export const earlyWorkerBootstrap = `(()=>{
 if(window.__c7EarlyWorld||navigator.connection?.saveData||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||!HTMLCanvasElement.prototype.transferControlToOffscreen)return;
 let worker;try{worker=new Worker('/3d/c7/runtime-v646/worker-entry.js',{type:'module'});}catch{return;}
 let claimed=false,timer;
 const release=()=>{clearTimeout(timer);removeEventListener('pagehide',dispose);worker.removeEventListener('error',dispose);};
 const dispose=()=>{if(claimed)return;release();worker.terminate();if(window.__c7EarlyWorld===entry)delete window.__c7EarlyWorld;};
 const entry={version:'v646',dispose,take(){if(claimed)return null;claimed=true;release();delete window.__c7EarlyWorld;return worker;}};
 window.__c7EarlyWorld=entry;
 worker.addEventListener('error',dispose);addEventListener('pagehide',dispose,{once:true});timer=setTimeout(dispose,15000);
 worker.postMessage({type:'warmup'});
})();`

declare global {
  interface Window {
    __c7EarlyWorld?: { version: string; take(): Worker | null; dispose(): void }
  }
}
