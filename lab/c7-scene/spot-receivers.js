// Static conservative receiver bounds can prove that every point is outside
// all rear spot cones. Those objects need no spot shader, not a weaker light.
export function specializeSpotReceivers(world,chunks){
 const scopes=[world.ground,world.trees,world.grass,world.farGrass];
 function removeBlock(source,anchor){const at=source.indexOf(anchor);if(at<0)throw Error('No spot block '+anchor);const re=/#(?:if\b|ifdef\b|ifndef\b|endif\b)[^\n]*/g;re.lastIndex=at;let level=0,m;while((m=re.exec(source))){level+=m[0].startsWith('#endif')?-1:1;if(!level)return source.slice(0,at)+source.slice(re.lastIndex);}throw Error('Unclosed spot block');}
 const sources=world.rearFill.lights.map(l=>{l.updateWorldMatrix(true,false);l.target.updateWorldMatrix(true,false);const p=world.camera.position.clone(),d=p.clone();l.getWorldPosition(p);l.target.getWorldPosition(d);d.sub(p).normalize();return{p,d,c:Math.cos(l.angle),s:Math.sin(l.angle),distance:l.distance};});
 const aliasSources=new Map();
 const aliases=new Map(),changed=[],stats={tested:0,pruned:0,byGroup:{},aliases:0};
 const outside=(sphere,l)=>{const x=sphere.center.x-l.p.x,y=sphere.center.y-l.p.y,z=sphere.center.z-l.p.z,R=sphere.radius+.1,ax=x*l.d.x+y*l.d.y+z*l.d.z,d2=x*x+y*y+z*z;return(l.distance>0&&Math.sqrt(d2)-R>l.distance)||ax+R<0||Math.sqrt(Math.max(0,d2-ax*ax))*l.c-ax*l.s>R;};
 for(const g of scopes){if(!g)continue;world.scene.updateMatrixWorld(true);g.traverse(o=>{if(!o.isMesh||!o.material?.isMeshStandardMaterial)return;stats.tested++;if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();const sphere=o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);if(!sources.every(l=>outside(sphere,l)))return;stats.pruned++;stats.byGroup[g.name]=(stats.byGroup[g.name]||0)+1;const original=o.material;let alias=aliases.get(original);if(!alias){
  const data=original.userData;original.userData={};try{alias=original.clone();}finally{original.userData=data;}alias.userData=data;
  const skip=new Set(['id','uuid','version','_listeners','onBeforeCompile','customProgramCacheKey','onBeforeRender','userData']);
  const names=Object.keys(original).filter(name=>!skip.has(name));let version=original.version;
  const sync=()=>{for(const name of names)alias[name]=original[name];if(version!==original.version){version=original.version;alias.needsUpdate=true;}};
  sync();alias.c7SortId=original.id;alias.onBeforeRender=original.onBeforeRender;
  aliasSources.set(alias,{original,sync});
  alias.onBeforeCompile=function(s,r){original.onBeforeCompile.call(this,s,r);let f=s.fragmentShader;if(f.includes('#include <lights_fragment_begin>'))f=f.replace('#include <lights_fragment_begin>',chunks.lights_fragment_begin);f=removeBlock(f,'#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');s.fragmentShader=f;
   if(s.vertexShader.includes('#include <shadowmap_pars_vertex>')){s.vertexShader=s.vertexShader.replace('#include <shadowmap_pars_vertex>',removeBlock(chunks.shadowmap_pars_vertex,'#if NUM_SPOT_LIGHT_COORDS > 0'));s.vertexShader=s.vertexShader.replace('#include <shadowmap_vertex>',removeBlock(chunks.shadowmap_vertex,'#if NUM_SPOT_LIGHT_COORDS > 0'));}
  };alias.customProgramCacheKey=()=>original.customProgramCacheKey()+'|exact-no-rear-spots';alias.needsUpdate=true;aliases.set(original,alias);
 }o.material=alias;changed.push({o,original});});}
 // Keep the source renderer's exact opaque ordering, including coplanar seams.
 world.renderer.setOpaqueSort((a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||(a.material.c7SortId??a.material.id)-(b.material.c7SortId??b.material.id)||a.materialVariant-b.materialVariant||a.z-b.z||a.id-b.id);
 stats.aliases=aliases.size;stats.enabled=true;
 // Receiver topology/placement is static in this authored world. An editor
 // that changes it calls invalidate(). A rig edit falls back automatically.
 const rig=world.rearFill.lights.map(light=>({light,angle:light.angle,distance:light.distance,
  matrix:light.matrixWorld.elements.slice(),target:light.target.matrixWorld.elements.slice()}));
 function update(){
  if(!stats.enabled)return;
  if(world.rearFill.lights.length!==rig.length){invalidate();return;}
  for(let i=0;i<rig.length;i++){
   const r=rig[i],l=world.rearFill.lights[i];
   if(l!==r.light||l.angle!==r.angle||l.distance!==r.distance){invalidate();return;}
   for(let k=0;k<16;k++)if(l.matrixWorld.elements[k]!==r.matrix[k]||l.target.matrixWorld.elements[k]!==r.target[k]){invalidate();return;}
  }
  for(const entry of aliasSources.values())entry.sync();
 }
 function invalidate(){
  if(!stats.enabled)return;stats.enabled=false;
  world.renderer.setOpaqueSort(null);
  for(const {o,original} of changed)if(aliases.has(original))o.material=original;
  for(const m of aliases.values())m.dispose();aliases.clear();aliasSources.clear();
 }
 return {state:stats,update,invalidate,dispose:invalidate};
}
