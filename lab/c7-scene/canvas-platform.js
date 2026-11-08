import * as T from 'three';
export function createCanvas(){return typeof document!=='undefined'?document.createElement('canvas'):new OffscreenCanvas(1,1);}
export async function loadTexture(url,{signal,texture:target}={}){
 signal?.throwIfAborted();
 const texture=target??new T.Texture();
 try{
  if(typeof document!=='undefined'){
   const image=await new T.ImageLoader().loadAsync(url);
   signal?.throwIfAborted();texture.image=image;texture.needsUpdate=true;return texture;
  }
  const response=await fetch(url,{signal});if(!response.ok)throw Error('Texture HTTP '+response.status);
  const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'none',premultiplyAlpha:'none',colorSpaceConversion:'default'});
  try{signal?.throwIfAborted();const canvas=createCanvas();canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Missing worker 2D canvas');ctx.drawImage(bitmap,0,0);texture.image=canvas;texture.needsUpdate=true;return texture;}finally{bitmap.close();}
 }catch(error){if(!target)texture.dispose();throw error;}
}
