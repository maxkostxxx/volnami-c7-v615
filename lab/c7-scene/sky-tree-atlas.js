import * as T from 'three';

// Constant offsets avoid trigonometry in the fragment shader.
const penumbraSamples=Array.from({length:16},(_,i)=>{
 const r=Math.sqrt((i+.5)/16),angle=i*2.399963229728653;
 return `visibility+=step(p.z-.000002,c7TreeDepth(p.xy+radius*vec2(${(r*Math.cos(angle)).toFixed(9)},${(r*Math.sin(angle)).toFixed(9)}),i));`;
}).join('\n');

// Share the existing meadow-owner texture unit: its original320x290 red
// texels occupy the first atlas tile; three tree depth maps follow. Chromium
// may predecode their equivalent RGBA8 value into an R32F attachment.
// A separate scene shares real tree geometry and frozen alpha-cutout leaves.
export function createSkyTreeAtlas({trees,renderer,lights,rearMeadow}) {
 const floatDepth=T.REVISION==='186'&&/Chrom(?:e|ium)\//.test(globalThis.navigator?.userAgent??'')
  &&!!renderer.getContext().getExtension('EXT_color_buffer_float')
  &&T.ShaderLib.depth.fragmentShader.includes('gl_FragColor = packDepthToRGBA( fragCoordZ );');
 const size=1024,owner=rearMeadow.uniforms.uRearMeadowOwner.value;
 const target=new T.WebGLRenderTarget(size,size*4,{...(floatDepth?{format:T.RedFormat,type:T.FloatType}:{}),minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});target.texture.generateMipmaps=false;
 const depthScene=new T.Scene(),materials=new Set(),casterBounds=[];
 const receiverMaxZ=85+(-125-85)*2.1;
 for(const tree of trees.children){const box=new T.Box3().setFromObject(tree,true);if(box.min.z<=receiverMaxZ)casterBounds.push(box);}
 const occupancy=new Uint8Array(384*128),occupancyTexture=new T.DataTexture(occupancy,384,128,T.RedFormat);occupancyTexture.minFilter=occupancyTexture.magFilter=T.NearestFilter;occupancyTexture.needsUpdate=true;trees.updateWorldMatrix(true,true);
 trees.traverse(o=>{if(!o.isMesh)return;if(o.isInstancedMesh)throw Error('Tree atlas requires instance transform review');
  if(new T.Box3().setFromObject(o,true).min.z>receiverMaxZ)return;
  const source=o.material,m=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:source.map,alphaMap:source.alphaMap,alphaTest:source.alphaTest,side:source.shadowSide??T.DoubleSide});
  m.blending=T.NoBlending;
  if(floatDepth){
   // Preserve the old RGBA8 quantization and unpack result once when writing
   // the atlas. Receivers then fetch one F32 value instead of decoding every
   // blocker/filter sample. Both representations occupy four bytes per texel.
   m.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = packDepthToRGBA( fragCoordZ );',`
     vec4 c7Encoded=packDepthToRGBA(fragCoordZ);
     vec4 c7Quantized=floor(clamp(c7Encoded,0.,1.)*255.+.5)/255.;
     float c7Depth=dot(c7Quantized,vec4(255./256.,255./65536.,255./16777216.,1./16777216.));
     gl_FragColor=vec4(c7Depth,0.,0.,1.);`);
   };
   m.customProgramCacheKey=()=>'c7-packed-equivalent-r32f';
  }
  materials.add(m);const mesh=new T.Mesh(o.geometry,m);mesh.matrix.copy(o.matrixWorld);mesh.matrixAutoUpdate=false;depthScene.add(mesh);
 });
 const ownerScene=new T.Scene(),ownerCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),ownerMaterial=new T.ShaderMaterial({uniforms:{source:{value:owner}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(source,vUv).r,0.,0.,1.);}',depthTest:false,depthWrite:false,blending:T.NoBlending});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),ownerMaterial);ownerScene.add(quad);
 const matrices=lights.map(()=>new T.Matrix4()),ranges=lights.map(()=>new T.Vector3());
 const treeBounds=new T.Box3().setFromObject(trees,true),bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
 const uniforms={uSkyTreeStrength:{value:1},uSkyTreeMatrices:{value:matrices},uSkyTreeRanges:{value:ranges}};
 let ownerDirty=true;
 function update(){
  const old={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),shadow:renderer.shadowMap.enabled};
  try{
   renderer.autoClear=false;renderer.shadowMap.enabled=false;target.scissorTest=true;
   const region=(x,y,w,h)=>{target.viewport.set(x,y,w,h);target.scissor.set(x,y,w,h);renderer.setRenderTarget(target);};
   if(ownerDirty){region(0,0,size,size);renderer.setClearColor(0,1);renderer.clear(true,true,false);region(0,0,320,290);renderer.render(ownerScene,ownerCamera);ownerDirty=false;}
   occupancy.fill(0);
   for(let i=0;i<3;i++){
    const light=lights[i];light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);light.shadow.updateMatrices(light);
    const c=light.shadow.camera.clone();c.updateMatrixWorld(true);const bounds=new T.Box3();
    for(const x of[treeBounds.min.x,treeBounds.max.x])for(const y of[treeBounds.min.y,treeBounds.max.y])for(const z of[treeBounds.min.z,treeBounds.max.z])bounds.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));
    c.left=bounds.min.x-2;c.right=bounds.max.x+2;c.bottom=bounds.min.y-2;c.top=bounds.max.y+2;c.updateProjectionMatrix();
    matrices[i].copy(bias).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);ranges[i].set(c.far-c.near,c.right-c.left,c.top-c.bottom);
    for(const box of casterBounds){
     const projected=new T.Box3();for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])projected.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(matrices[i]));
     // Only the nine blocker probes can make filtering necessary. Their
     // radius is .012; retain two native texels plus one coarse cell beyond
     // that envelope, rather than padding for the later .04 filter radius.
     const pad=.012+2/1024+1/128,x0=Math.max(0,Math.floor((projected.min.x-pad)*128)),x1=Math.min(127,Math.ceil((projected.max.x+pad)*128)),y0=Math.max(0,Math.floor((projected.min.y-pad)*128)),y1=Math.min(127,Math.ceil((projected.max.y+pad)*128));
     for(let y=y0;y<=y1;y++)occupancy.fill(255,y*384+i*128+x0,y*384+i*128+x1+1);
    }

    region(0,(i+1)*size,size,size);renderer.setClearColor(0xffffff,1);renderer.clear(true,true,false);renderer.render(depthScene,c);
   }
   occupancyTexture.needsUpdate=true;ownerMaterial.uniforms.source.value=occupancyTexture;region(320,0,384,128);renderer.render(ownerScene,ownerCamera);ownerMaterial.uniforms.source.value=owner;
  }finally{
   renderer.shadowMap.enabled=old.shadow;renderer.autoClear=old.autoClear;renderer.setRenderTarget(old.target);renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.scissorTest);renderer.setClearColor(old.clear,old.alpha);
  }
 }
 const restore=()=>{ownerDirty=true;update();};renderer.domElement.addEventListener('webglcontextrestored',restore);
 rearMeadow.uniforms.uRearMeadowOwner.value=target.texture;
 const depthLookup=floatDepth
  ? 'return texture2D(uRearMeadowOwner,vec2(p.x,(p.y+float(i)+1.)*.25)).r;'
  : 'vec4 encodedDepth=texture2D(uRearMeadowOwner,vec2(p.x,(p.y+float(i)+1.)*.25));return dot(encodedDepth,vec4(255./256.,255./65536.,255./16777216.,1./16777216.));';
 function wrap(shader){
  Object.assign(shader.uniforms,uniforms);
  const needle='uniform sampler2D uRearMeadowOwner;';if(!shader.fragmentShader.includes(needle))throw Error('Atlas requires meadow owner sampler');
  shader.fragmentShader=shader.fragmentShader.replace(needle,needle+/* glsl */`
   uniform float uSkyTreeStrength;uniform mat4 uSkyTreeMatrices[3];uniform vec3 uSkyTreeRanges[3];
   float c7Owner(vec2 uv){
    vec2 p=clamp(uv,vec2(.5/320.,.5/290.),vec2(1.-.5/320.,1.-.5/290.))*vec2(320.,290.)-.5;
    ivec2 a=ivec2(floor(p)),b=min(a+ivec2(1),ivec2(319,289));vec2 f=fract(p);
    return mix(mix(texelFetch(uRearMeadowOwner,a,0).r,texelFetch(uRearMeadowOwner,ivec2(b.x,a.y),0).r,f.x),mix(texelFetch(uRearMeadowOwner,ivec2(a.x,b.y),0).r,texelFetch(uRearMeadowOwner,b,0).r,f.x),f.y);
   }
   float c7TreeDepth(vec2 uv,int i){
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 1.;
    vec2 p=clamp(uv,vec2(.5/1024.),vec2(1.-.5/1024.));
    ${depthLookup}
   }
   float c7TreeShadow(vec3 world,int lightIndex){
    int i=lightIndex-1;vec4 clip=uSkyTreeMatrices[i]*vec4(world,1.);vec3 p=clip.xyz/clip.w;
    if(any(lessThan(p,vec3(0.)))||any(greaterThan(p,vec3(1.))))return 1.;
    ivec2 cell=ivec2(clamp(floor(p.xy*128.),vec2(0.),vec2(127.)))+ivec2(320+i*128,0);
    if(texelFetch(uRearMeadowOwner,cell,0).r==0.)return 1.;
    // A single centre texel alternated between a leaf and clear sky. That
    // switched the penumbra from metres to one texel, leaving separate dark
    // stamps on the left hill. Estimate the blocker over the source footprint.
    float blockerSum=0.,blockerCount=0.;
    vec2 search=vec2(.012);
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
     float depth=c7TreeDepth(p.xy+search*vec2(float(x),float(y)),i);
     if(depth<p.z-.000002){blockerSum+=depth;blockerCount+=1.;}
    }
    if(blockerCount==0.)return 1.;
    float blockerDistance=max(0.,p.z-blockerSum/blockerCount)*uSkyTreeRanges[i].x;
    // Authored3-degree sky source, clamped footprint only for tree filtering.
    vec2 radius=max(vec2(1./1024.),min(vec2(.04),blockerDistance*tan(uSkyHorizonRadius)/uSkyTreeRanges[i].yz));
    float visibility=0.;
    // Fixed disk samples stay attached to the world when the camera moves.
    // The occupancy test above and per-fragment cache limit this work to
    // actual tree shadows; no shadow maps or render passes are added.
    ${penumbraSamples}
    return mix(1.,visibility/16.,uSkyTreeStrength);
   }
  `);
  const source='texture2D(uRearMeadowOwner,uv).r';if(!shader.fragmentShader.includes(source))throw Error('Owner sampling hook missing');shader.fragmentShader=shader.fragmentShader.replace(source,'c7Owner(uv)');
 }
 return{uniforms,wrap,update,target,dispose(){renderer.domElement.removeEventListener('webglcontextrestored',restore);rearMeadow.uniforms.uRearMeadowOwner.value=owner;target.dispose();occupancyTexture.dispose();materials.forEach(m=>m.dispose());quad.geometry.dispose();ownerMaterial.dispose();}};
}
