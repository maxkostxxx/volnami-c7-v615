// A material shared only by non-receiving meshes never samples native shadows.
// Keep the authored sky-horizon/tree visibility code; specialize only the unused
// Three receiveShadow flag. Any live property edit restores the uniform path.
export function specializeStaticShadowReceivers(groups,{onStaticCompile}={}) {
 const users=new Map(),restorations=[];
 for(const group of groups)group?.traverse(object=>{
  if(!object.isMesh||Array.isArray(object.material))return;
  const material=object.material;
  if(!material?.isMeshStandardMaterial)return;
  if(!users.has(material))users.set(material,[]);
  users.get(material).push(object);
 });
 for(const[material,objects]of users){
  if(objects.some(object=>object.receiveShadow))continue;
  let dynamic=false;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){
   compile.call(this,shader,renderer);
   if(dynamic)return;
   const anchor='#include <lights_pars_begin>';
   if(shader.fragmentShader.split(anchor).length!==2)throw Error('Static receiver requires reviewed Three lighting declarations');
   shader.fragmentShader=shader.fragmentShader.replace(anchor,
    '#define receiveShadow c7UnusedReceiveShadow\n'+anchor+'\n#undef receiveShadow\nconst bool receiveShadow=false;');
   onStaticCompile?.(shader,material,renderer);
  };
  material.customProgramCacheKey=function(){return key.call(this)+'|static-receiver-v1|'+(dynamic?'uniform':'false');};
  material.needsUpdate=true;
  for(const object of objects){
   const descriptor=Object.getOwnPropertyDescriptor(object,'receiveShadow');
   let value=object.receiveShadow;
   const read=()=>descriptor?.get?descriptor.get.call(object):value;
   Object.defineProperty(object,'receiveShadow',{configurable:true,enumerable:descriptor?.enumerable??true,
    get:read,set(next){
     if(next!==read()&&!dynamic){dynamic=true;material.needsUpdate=true;}
     if(descriptor?.set)descriptor.set.call(object,next);else value=next;
    }});
   restorations.push(()=>{
    const current=read();
    if(descriptor?.get||descriptor?.set)Object.defineProperty(object,'receiveShadow',descriptor);
    else Object.defineProperty(object,'receiveShadow',{...(descriptor??{configurable:true,enumerable:true,writable:true}),value:current});
   });
  }
  restorations.push(()=>{material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;});
 }
 return()=>{for(const restore of restorations.splice(0).reverse())restore();};
}
