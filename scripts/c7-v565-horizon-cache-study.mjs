import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/c7-v565-horizon-cache';await mkdir(out,{recursive:true});const b=await chromium.launch({headless:true,args:['--use-angle=metal']});const p=await b.newPage({viewport:{width:1440,height:900}}),rows=[],errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await p.waitForSelector('body.ready',{timeout:90000});await p.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null);const m=sceneLab.ground.material;window.old={compile:m.onBeforeCompile,key:m.customProgramCacheKey()};});
for(const mode of ['base','cache','base','cache','cache','base']){
const row=await p.evaluate(async mode=>{const w=sceneLab,m=w.ground.material;
m.onBeforeCompile=function(s,r){old.compile.call(this,s,r);if(mode==='cache'){
const pre=`
vec3 c7MainFieldReady=vec3(0.),c7LocalFieldReady=vec3(0.);
vec4 c7MainFieldCache[3],c7LocalFieldCache[3];
vec4 c7ReadMainField(vec2 uv,float layer,int lightIndex){
 int slot=lightIndex-1;
 if(c7MainFieldReady[slot]==0.){float low=floor(layer);vec4 a=texture(uSkyHorizon,vec3(uv,low)),b=texture(uSkyHorizon,vec3(uv,min(16.,low+1.)));c7MainFieldCache[slot]=mix(a,b,fract(layer));c7MainFieldReady[slot]=1.;}
 return c7MainFieldCache[slot];
}
vec4 c7ReadLocalField(vec2 uv,float layer,int lightIndex){
 int slot=lightIndex-1;
 if(c7LocalFieldReady[slot]==0.){float low=floor(layer);vec4 a=texture(uLocalHorizon,vec3(uv,low)),b=texture(uLocalHorizon,vec3(uv,min(16.,low+1.)));c7LocalFieldCache[slot]=mix(a,b,fract(layer));c7LocalFieldReady[slot]=1.;}
 return c7LocalFieldCache[slot];
}
`;
s.fragmentShader=s.fragmentShader.replace('float c7TreeShadow(vec3 world,int lightIndex);',pre+'\nfloat c7TreeShadow(vec3 world,int lightIndex);');
s.fragmentShader=s.fragmentShader.replace(/vec4 localA=texture\(uLocalHorizon,[^;]+;/,'vec4 c7LocalField=c7ReadLocalField(localSample,localLayer,lightIndex);').replace('mix(localA.rg,localB.rg,fract(localLayer))','c7LocalField.rg').replace('mix(localA.ba,localB.ba,fract(localLayer))','c7LocalField.ba');
s.fragmentShader=s.fragmentShader.replace(/vec4 a=texture\(uSkyHorizon,vec3\(uv,low\)\),b=texture\(uSkyHorizon,vec3\(uv,high\)\);/,'vec4 c7MainField=c7ReadMainField(uv,layer,lightIndex);').replace('mix(a.rg,b.rg,fract(layer))','c7MainField.rg').replace('mix(a.ba,b.ba,fract(layer))','c7MainField.ba');
}};m.customProgramCacheKey=()=>old.key+'|field-'+mode;m.needsUpdate=true;await w.renderer.compileAsync(w.scene,w.camera);w.set({sun:.3,move:.3,time:0});
const gl=w.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);window.basePixel??=pixels;let max=0,changed=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-basePixel[i]);max=Math.max(max,d);changed+=d>0;}
const runs=[];for(let run=0;run<2;run++){let start,last,n=0;await new Promise(resolve=>requestAnimationFrame(function tick(t){start??=t;last=t;w.render(.5-.5*Math.cos((t-start)/7000*2*Math.PI),t/1000);n++;if(t-start<7000)requestAnimationFrame(tick);else resolve()}));runs.push((n-1)*1000/(last-start))}return{mode,runs,pixels:{max,changed},glError:gl.getError()};},mode);rows.push(row);console.log(row);await writeFile(out+'/results.json',JSON.stringify({rows,errors},null,2));}
}finally{await b.close()}
