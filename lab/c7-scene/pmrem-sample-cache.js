import * as T from 'three';

// r186's 256 VNDF half-vectors depend only on fixed roughness rows, not sky,
// camera, or solar time. Generate them once with the original GPU arithmetic.
// All samples, world transforms, weights, texture fetches and order remain.
// Scoped to this world's PMREM instance; unsupported renderers keep stock code.
export function cachePmremHalfVectors(pmrem,renderer){
 const gl=renderer.getContext(),prior=pmrem._applyGGXFilter,records=new WeakMap();
 if(T.REVISION!=='186'||typeof prior!=='function'||!gl.getExtension('EXT_color_buffer_float')||gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)<300)return;
 function prepare(mat,n){
  const source=mat.fragmentShader,call='vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);';if(mat.defines.GGX_SAMPLES!==256||!source.includes(call))throw Error('Unreviewed PMREM shader');
  const count=n-1,roughnesses=new Float32Array(count);for(let out=1;out<n;out++){const target=out/(n-1),input=(out-1)/(n-1),incremental=Math.sqrt(target*target-input*input),blur=target*1.25;roughnesses[out-1]=incremental*blur;}
  const target=new T.WebGLRenderTarget(256,count,{type:T.FloatType,format:T.RGBAFormat,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:false});
  const material=new T.ShaderMaterial({defines:{...mat.defines},uniforms:{uC7Roughnesses:{value:roughnesses}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform float uC7Roughnesses[${count}];\n`+source.slice(0,source.indexOf('void main()'))+`void main(){uint i=uint(floor(gl_FragCoord.x));float roughness=uC7Roughnesses[int(floor(gl_FragCoord.y))];vec2 Xi=hammersley(i,uint(GGX_SAMPLES));vec3 H=importanceSampleGGX_VNDF(Xi,vec3(0.,0.,1.),roughness);gl_FragColor=vec4(H,1.);}`,depthTest:false,depthWrite:false,blending:T.NoBlending});
  const geometry=new T.PlaneGeometry(2,2),quad=new T.Mesh(geometry,material),rgba=new Float32Array(256*count*4);quad.frustumCulled=false;
  const old={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),test:renderer.getScissorTest(),auto:renderer.autoClear};
  try{renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(quad,new T.Camera());renderer.readRenderTargetPixels(target,0,0,256,count,rgba);if(gl.getError())throw Error('PMREM cache generation failed');}
  finally{renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.test);renderer.setRenderTarget(old.target,old.face,old.mip);renderer.autoClear=old.auto;target.dispose();geometry.dispose();material.dispose();}
  const rows=[];for(let row=0;row<count;row++){const values=new Float32Array(256*3);for(let i=0;i<256;i++)values.set(rgba.subarray((row*256+i)*4,(row*256+i)*4+3),i*3);rows.push(values);}
  mat.fragmentShader='uniform vec3 uC7Half[GGX_SAMPLES];\n'+source.replace(call,'vec3 H_tangent = uC7Half[i];');mat.uniforms.uC7Half={value:rows[0]};mat.needsUpdate=true;return rows;
 }
 pmrem._applyGGXFilter=function(target,lodIn,lodOut){let rows=records.get(this._ggxMaterial);if(!rows){try{rows=prepare(this._ggxMaterial,this._lodMeshes.length);records.set(this._ggxMaterial,rows);}catch{this._applyGGXFilter=prior;return prior.call(this,target,lodIn,lodOut);}}this._ggxMaterial.uniforms.uC7Half.value=rows[lodOut-1];return prior.call(this,target,lodIn,lodOut);};
 return()=>{pmrem._applyGGXFilter=prior;};
}
