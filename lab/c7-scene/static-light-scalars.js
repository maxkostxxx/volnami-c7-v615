// Keep authored scalar parameters constant in the compiled lighting program.
// Controls remain live: changing a scalar invalidates every material using it.
// Time, light direction/colour, camera, textures and geometry remain dynamic.
const watched=new WeakMap(),dynamic=new WeakSet();
const names=new Set(['uTurfCanopyStrength','uTurfWrap','uTurfWrapStrength','uTurfScatterStrength','uTurfTipWeight','uTurfDebugMode',
 'uCanopyStrength','uCanopyWrap','uCanopyWrapStrength','uCanopyTipWeight','uScatter','uCanopyTransmissionMix',
 'uWrap','uWrapStrength','uScatterStrength','uTipWeight','uTipAlbedoStrength',
 'uSkyHorizonMix','uSkyHorizonRadius','uLocalMix','uSkyTreeStrength','uReceiverTexelBias',
 'uRearMeadowStrength','uRearMeadowStretch','uRearMeadowPivot']);
const literal=value=>{const f=Math.fround(value);if(!Number.isFinite(f))return null;return Object.is(f,-0)?'-0.0':f.toPrecision(9);};
export function specializeLightScalars(group,containers){
 if(!group)return;
 const sharedValues=Object.fromEntries(containers.filter(Boolean).flatMap(c=>Object.entries(c).filter(([name,u])=>names.has(name)&&u&&typeof u.value==='number')));
 const materials=new Set();group.traverse(o=>{for(const m of[o.material??[]].flat())materials.add(m);});
 for(const material of materials){
  const values={...sharedValues};
  for(const name of ['roughness','metalness','ior','specularIntensity','opacity']){
   if(typeof material[name]!=='number')continue;
   let value=material[name];const uniform={get value(){return material[name];}};
   Object.defineProperty(material,name,{enumerable:true,configurable:true,get:()=>value,set:next=>{if(Object.is(value,next))return;value=next;if(!dynamic.has(uniform)){dynamic.add(uniform);material.needsUpdate=true;}}});
   values[name]=uniform;
  }
  for(const uniform of Object.values(sharedValues)){
   let watch=watched.get(uniform);
   if(!watch){
    let value=uniform.value;watch=new Set();watched.set(uniform,watch);
    Object.defineProperty(uniform,'value',{enumerable:true,configurable:true,get:()=>value,set:next=>{if(Object.is(value,next))return;value=next;if(!dynamic.has(uniform)){dynamic.add(uniform);for(const m of watch)m.needsUpdate=true;}}});
   }
   watch.add(material);
  }
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);
   shader.fragmentShader=shader.fragmentShader.replace(/uniform\s+float\s+([\w\s,]+);/g,(declaration,list)=>list.split(',').map(n=>{
    const name=n.trim(),uniform=values[name],value=uniform&&!dynamic.has(uniform)?literal(uniform.value):null;
    return value!==undefined&&value!==null?`const float ${name}=${value};`:`uniform float ${name};`;
   }).join('\n'));
  };
  material.customProgramCacheKey=function(){return previousKey.call(this)+'|static-light-v1|'+Object.entries(values).map(([n,u])=>n+'='+(dynamic.has(u)?'uniform':literal(u.value))).join(';');};
  material.needsUpdate=true;
 }
}
