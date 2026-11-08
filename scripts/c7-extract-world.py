"""One-time extraction of the checked v394 renderer into a caller-owned world."""
from pathlib import Path

root = Path('lab/c7-scene')
if (root / 'world.js').exists():
    raise SystemExit('One-time extraction already completed; edit world.js directly.')
source = (root / 'main.js').read_text()
assert 'camera.near=2;' in source
imports, body = source.split('const query=new URLSearchParams(location.search),canvas=document.querySelector(\'canvas\');', 1)
imports = imports.replace("import {OrbitControls} from 'three/addons/controls/OrbitControls.js';\n", '')
body = body.replace("const depthStretch=Number(query.get('depth')??2.1),depthPivot=85;", 'const depthPivot=85;')
body = body.replace("if(query.has('clean'))document.body.classList.add('clean');\n", '')
body = body.replace("const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});", '')
body = body.replace('const scene=new T.Scene();scene.fog=null;', 'scene.fog=null;')
body = body.replace('const controls=new OrbitControls(camera,canvas);controls.target.copy(lookAt);controls.enabled=false;controls.enableDamping=true;\n', '')
body = body.replace("if(!query.has('no-grass'))", 'if(!noGrass)')
body = body.replace("quality:'high'", "quality:low?'low':'high'")
body = body.replace("if(!query.has('no-aerial'))", 'if(!noAerial)')
body = body.replace("let solar=Number(query.get('sun')??0),travel=Number(query.get('travel')??0),lastSolar=-1,dirty=true;", 'let solar=0,travel=0,lastSolar=-1,dirty=true;')
body = body.replace('innerWidth/innerHeight', 'width/height')
body = body.replace(';controls.target.copy(lookAt)', '')
start = body.index('function resize()')
end = body.index('// A conservative full-lake', start)
body = body[:start] + '''function resize(w,h,lowTier=low){
 width=Math.max(1,w);height=Math.max(1,h);low=lowTier;
 renderer.setPixelRatio(low?1:1.5);renderer.setSize(width,height,false);
 lake.target.setSize(Math.min(low?960:1920,width),Math.min(low?540:1080,height));
 setCamera();dirty=true;
}
function restore(){lastSolar=-1;dirty=true;rearFill.invalidateShadows();}
''' + body[end:]
start = body.index('let lastReflection=-1')
body = body[:start] + '''let lastReflection=-1,frames=0,state={};
function draw(){
 if(disposed)return state;
 renderer.info.reset();
 if(Math.abs(lastSolar-solar)>.001)setLight();
 const environmentCalls=renderer.info.render.calls,environmentTriangles=renderer.info.render.triangles;
 lake.material.uniforms.uTime.value=time.value;
 const waterHidden=waterOcclusion.test(camera),reflected=!waterHidden&&(dirty||time.value-lastReflection>.1);
 if(waterHidden)dirty=false;
 if(reflected){lake.reflect(renderer,scene,camera,lookAt);lastReflection=time.value;dirty=false;}
 const reflectionCalls=renderer.info.render.calls-environmentCalls,reflectionTriangles=renderer.info.render.triangles-environmentTriangles;
 renderer.render(scene,camera);frames++;
 state={solar,travel,time:time.value,frames,depthStretch,waterOccluded:waterHidden,waterOcclusionMargin:waterOcclusion.stats.margin,fov:camera.fov,reflectionRendered:reflected,environmentCalls,environmentTriangles,reflectionCalls,reflectionTriangles,camera:camera.position.toArray(),target:lookAt.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,mainCalls:renderer.info.render.calls-reflectionCalls-environmentCalls,mainTriangles:renderer.info.render.triangles-reflectionTriangles-environmentTriangles,trees:trees.userData.stats,grass:grass?.userData.stats,farGrass:farGrass.userData.stats};
 return state;
}
function renderState({sun=solar,move=travel,time:clock=time.value,orbit=0}={},force=false){
 if(disposed)return state;
 if(![sun,move,clock,orbit].every(Number.isFinite))throw new TypeError('Non-finite C7 state');
 const nextMove=T.MathUtils.clamp(move,0,1);
 const changed=travel!==nextMove||force||orbit!==0;
 solar=T.MathUtils.clamp(sun,0,1);travel=nextMove;time.value=clock;
 if(changed){setCamera();camera.position.x+=orbit;camera.lookAt(lookAt);dirty=true;}
 return draw();
}
const world={skyHorizon,waterOcclusion,scene,camera,renderer,ground,lake,trees,grass,farGrass,skyLight,placements,sunlight,hemi,atmosphere,aerial,rearMeadow,rearFill,depthStretch,
 get state(){return state;},
 set(values){return renderState(values,true);},
 renderState,
 render(progress,clock){return renderState({sun:progress,move:progress,time:clock});},
 resize,restore,dispose,
 ready:()=>!disposed,
 status:()=>disposed?'failed':'ready',
 diagnostics:()=>({...state,version:'shared-v395',quality:low?'low':'normal',lens:{fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far},memory:{...renderer.info.memory}}),
};
resize(width,height,low);setLight();
await renderer.compileAsync(scene,camera);checkAbort();
world.set({sun:0,move:0,time:0});
return world;
'''
# Register non-scene resources as soon as their owner exists. The reverse order
# restores shader hooks before geometries/materials leave the scene.
body = body.replace('await atmosphere.readyPromise;', 'await atmosphere.readyPromise;checkAbort();')
body = body.replace('scene.add(ground);', 'scene.add(ground);checkAbort();')
body = body.replace('scene.add(lake.mesh);', 'scene.add(lake.mesh);cleanups.push(()=>lake.target.dispose());')
body = body.replace('scene.add(trees);', 'scene.add(trees);cleanups.push(()=>trees.userData.dispose());checkAbort();')
body = body.replace('const skyLight=createSkyLight({scene,sunDirection});', 'const skyLight=createSkyLight({scene,sunDirection});cleanups.push(()=>skyLight.dispose());')
body = body.replace('const rearFill=createRearFill({scene});', 'const rearFill=createRearFill({scene});cleanups.push(()=>rearFill.dispose());')
body = body.replace('const pmrem=new T.PMREMGenerator(renderer)', 'cleanups.push(()=>skyHorizon.dispose());checkAbort();\nconst pmrem=new T.PMREMGenerator(renderer)')
body = body.replace('envScene.add(envSky);let env=null;', 'envScene.add(envSky);let env=null;cleanups.push(()=>{env?.dispose();pmrem.dispose();envSky.material.dispose();});')
body = body.replace('const rearFill=createRearFill', 'cleanups.push(()=>rearMeadow.dispose());\nconst rearFill=createRearFill')
assert 'document.' not in body and 'window.' not in body and 'query.' not in body and 'controls.' not in body
header = '''
// Shared real-time world. The caller owns scroll, animation, visibility and DOM.
// No RAF or global UI listeners are installed by this module.
export async function createC7Scene({canvas,width=1,height=1,low=false,signal,noGrass=false,noAerial=false,depthStretch=2.1}={}){
 const scene=new T.Scene(),cleanups=[];
 let disposed=false;
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 function checkAbort(){if(signal?.aborted||disposed)throw new DOMException('C7 initialization aborted','AbortError');}
 function dispose(){
  disposed=true;
  signal?.removeEventListener('abort',onAbort);
  for(const cleanup of cleanups.splice(0).reverse())cleanup();
  const resources=new Set();
  const texture=t=>{if(t?.isTexture)resources.add(t);};
  scene.traverse(o=>{
   if(o.geometry)resources.add(o.geometry);
   for(const m of(o.material?(Array.isArray(o.material)?o.material:[o.material]):[])){
    resources.add(m);Object.values(m).forEach(texture);
    for(const u of Object.values(m.uniforms??{}))texture(u.value);
    for(const group of Object.values(m.userData??{}))if(group&&typeof group==='object')for(const u of Object.values(group))texture(u?.value);
   }
   if(o.shadow?.map)resources.add(o.shadow.map);
  });
  for(const resource of resources)resource.dispose();
  renderer.renderLists.dispose();renderer.dispose();
 }
 // Let outstanding initialization finish its current await and release newly
 // acquired objects in catch. Never allow it to start drawing after abort.
 const onAbort=()=>{disposed=true;};
 signal?.addEventListener('abort',onAbort,{once:true});
 try{checkAbort();
'''
(root/'world.js').write_text(imports+header+body+'\n }catch(error){dispose();throw error;}\n}\n')
print('Extracted shared world; original laboratory shell retained until comparison')
