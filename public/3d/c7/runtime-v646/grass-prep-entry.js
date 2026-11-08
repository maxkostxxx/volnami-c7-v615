// Reuse the cached world module; no second download of the generator or Three.
const moduleTask=import('./world.js');moduleTask.catch(()=>{});
self.onmessage=async({data:m})=>{
 if(m.type!=='build')return;
 let group;
 try{
  const {prepareC7Grass}=await moduleTask;
  const result=await prepareC7Grass(m.packet,m.options);group=result.group;
  postMessage({type:'grass-built',packet:result.packet,timing:result.timing},result.buffers);
 }catch(error){postMessage({type:'failed',message:String(error)});}
 finally{group?.userData.dispose();close();}
};
