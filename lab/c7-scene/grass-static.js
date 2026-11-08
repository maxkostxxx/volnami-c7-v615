import * as T from 'three';

// Evaluate immutable per-stem noise and direction on the same GPU/precision
// as the original vertex shader, once before upload. Positions, ranks and
// density are retained. CPU copies let Three restore buffers after context loss.
export async function prepareGrassStatic(renderer,patches,depthStretch,{signal,maxBatchBlades=262144}={}){
 signal?.throwIfAborted();
 if(!Number.isInteger(maxBatchBlades)||maxBatchBlades<1)throw new RangeError('Invalid grass batch capacity');
 const gl=renderer.getContext(),count=patches.reduce((n,p)=>n+p.count,0);
 if(!count)return{blades:0,extraGPUAttributeBytes:0,batches:0,batchCapacity:0,maxBatchMilliseconds:0,temporaryStagingBytes:0,pendingCosineBytes:0,preparedAttributeBytes:0};
 const capacity=Math.min(count,Math.max(maxBatchBlades,...patches.map(p=>p.count)));
 const input=new Float32Array(capacity*6),output=new Float32Array(capacity*6),prepared=[];
 let batches=0,maxBatchMilliseconds=0;
 const vertex=`#version 300 es
 precision highp float;
 layout(location=0) in vec3 source;
 layout(location=1) in vec3 sourceNormal;
 uniform float stretch;
 out vec3 result;out vec3 preparedNormal;
 float fieldHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 float fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1,0)),f.x),mix(fieldHash(i+vec2(0,1)),fieldHash(i+vec2(1,1)),f.x),f.y);}
 void main(){preparedNormal=normalize(vec3(sourceNormal.xy,sourceNormal.z/stretch));result=vec3(cos(source.z),sin(source.z),fieldNoise(source.xy*2.3));gl_Position=vec4(0.0);}`;
 const fragment='#version 300 es\nprecision highp float;out vec4 colour;void main(){colour=vec4(0.0);}';
 const shaders=[],program=gl.createProgram(),vao=gl.createVertexArray(),read=gl.createBuffer(),write=gl.createBuffer(),feedback=gl.createTransformFeedback();
 function unbind(){
  gl.disable(gl.RASTERIZER_DISCARD);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,null);gl.useProgram(null);renderer.resetState();
 }
 renderer.resetState();
 try{
  for(const[type,source]of[[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);
  }
  gl.transformFeedbackVaryings(program,['result','preparedNormal'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program,'stretch'),depthStretch);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,read);gl.bufferData(gl.ARRAY_BUFFER,input.byteLength,gl.STREAM_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,write);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,output.byteLength,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,write);
  unbind();
  for(let first=0;first<patches.length;){
   signal?.throwIfAborted();const started=performance.now();let end=first,blades=0,cursor=0;
   while(end<patches.length&&blades+patches[end].count<=capacity)blades+=patches[end++].count;
   for(let p=first;p<end;p++){
    const patch=patches[p],g=patch.geometries[0],r=g.attributes.aRoot.array,s=g.attributes.aShape.array,n=g.attributes.aTerrainNormal.array;
    for(let i=0;i<patch.count;i++){input[cursor++]=r[i*3];input[cursor++]=r[i*3+2];input[cursor++]=s[i*4+2];input[cursor++]=n[i*3];input[cursor++]=n[i*3+1];input[cursor++]=n[i*3+2];}
   }
   renderer.resetState();gl.useProgram(program);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,read);gl.bufferSubData(gl.ARRAY_BUFFER,0,input.subarray(0,blades*6));
   gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,write);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,write);
   gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,blades);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
   gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,output,0,blades*6);const error=gl.getError();if(error)throw Error('Grass static preparation GL '+error);
   unbind();cursor=0;
   for(let p=first;p<end;p++){
    const patch=patches[p],orderSource=patch.geometries[0].attributes.aOrder.array;
    const normal=new Float32Array(patch.count*4),order=new Float32Array(patch.count*2),cosine=new Float32Array(patch.count);
    for(let i=0;i<patch.count;i++){
     cosine[i]=output[cursor++];order[i*2]=orderSource[i];order[i*2+1]=output[cursor++];normal[i*4+3]=output[cursor++];normal[i*4]=output[cursor++];normal[i*4+1]=output[cursor++];normal[i*4+2]=output[cursor++];
    }
    prepared.push({patch,normal,order,cosine});
   }
   first=end;batches++;maxBatchMilliseconds=Math.max(maxBatchMilliseconds,performance.now()-started);
   // All GL bindings and Three's state cache are clean before yielding.
   // Original attributes remain untouched until every batch has succeeded.
   if(first<patches.length){await new Promise(resolve=>setTimeout(resolve,0));signal?.throwIfAborted();}
  }
  signal?.throwIfAborted();
 }finally{
  unbind();
  gl.deleteTransformFeedback(feedback);gl.deleteBuffer(read);gl.deleteBuffer(write);gl.deleteVertexArray(vao);gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);renderer.resetState();
 }
 for(const{patch,normal,order,cosine}of prepared){
  const shape=patch.geometries[0].attributes.aShape;
  for(let i=0;i<patch.count;i++)shape.array[i*4+2]=cosine[i];shape.needsUpdate=true;
  const normalAttribute=new T.InstancedBufferAttribute(normal,4),orderAttribute=new T.InstancedBufferAttribute(order,2);
  for(const geometry of patch.geometries){geometry.setAttribute('aTerrainNormal',normalAttribute);geometry.setAttribute('aOrder',orderAttribute);}
 }
 return{blades:count,extraGPUAttributeBytes:count*8,batches,batchCapacity:capacity,maxBatchMilliseconds,
  temporaryStagingBytes:capacity*96,pendingCosineBytes:count*4,preparedAttributeBytes:count*24};
}
