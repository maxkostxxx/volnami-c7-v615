// Reproducible mobile asset derivation. Full terrain is shared with desktop.
// No artistic image generation: keep existing mip pixels, reduce only the
// mobile horizon sampling grid and cloud coverage resolution explicitly.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {chromium} from 'playwright';
import * as T from 'three';
import {encodeCompactHorizonField} from './c7-horizon-codec.mjs';
import {encodeLosslessLeaf} from './c7-leaf-webp.mjs';
const source=path.resolve(process.argv[2]??'lab/c7-scene');
const output=path.resolve(process.argv[3]??path.join(source,'mobile-data'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const arrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const inputNames=['trees.js','canvas-platform.js','sky-horizon.js',
 'sky-data/field.rgba16f.gz','left-sky-data/field.rgba16f.gz',
 'assets/tree/leaves-oak.png','assets/tree/leaves-oak-lossless.webp','assets/tree/bark-color-mips.webp',
 'assets/tree/bark-normal-mips.webp','assets/tree/bark-roughness-mips.webp',
 'assets/sky/cloud-coverage-4k.webp'];
const inputHashes=async()=>Object.fromEntries(await Promise.all(inputNames.map(async n=>[n,sha(await fs.readFile(path.join(source,n)))])));
const inputs=await inputHashes(),files={};
await fs.mkdir(output,{recursive:true});
async function save(name,body,properties={}){
 await fs.writeFile(path.join(output,name),body);
 files[name]={bytes:body.length,sha256:sha(body),...properties};
}
const {decodeHorizonField}=await import(pathToFileURL(path.join(source,'sky-horizon.js')));
for(const[name,width,height,scales]of[['sky-data',512,256,[2048,2048,32,32]],['left-sky-data',256,128,[2048,2048,1024,1024]]]){
 const raw=await decodeHorizonField(arrayBuffer(gunzipSync(await fs.readFile(path.join(source,name,'field.rgba16f.gz')))),width,height);
 const w=width/2,h=height/2,smaller=new Uint16Array(w*h*17*4);
 for(let z=0;z<17;z++)for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){
  const values=[];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)values.push(T.DataUtils.fromHalfFloat(raw[((z*height+y*2+dy)*width+x*2+dx)*4+c]));
  const value=c<2?values.reduce((a,b)=>a+b,0)/4:name==='sky-data'?Math.min(...values):Math.max(...values);
  smaller[((z*h+y)*w+x)*4+c]=T.DataUtils.toHalfFloat(value);
 }
 const{gzip}=encodeCompactHorizonField(Buffer.from(smaller.buffer),w,h,scales,T.DataUtils);
 const decoded=await decodeHorizonField(arrayBuffer(gunzipSync(gzip)),w,h);
 await save(name+'.gz',gzip,{width:w,height:h,layers:17,decodedSha256:sha(decoded),approximation:'2x2 angle average; conservative distance/curvature guards'});
}
// Only this scene's JS/image files and the two pinned Three modules are served.
// Check the port first; close only this server and this headless browser.
const port=3069;
const occupied=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false));});
if(occupied)throw Error('Mobile bake port occupied '+port);
let server,browser;
try{
 server=http.createServer(async(req,res)=>{
  try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(name==='/'){
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script>');return;
   }
   let file;
   if(['/three/three.module.js','/three/three.core.js'].includes(name))file=path.resolve('node_modules/three/build',path.basename(name));
   else{
    if(!['.js','.png','.webp'].includes(path.extname(name)))throw Error('Unsupported source');
    file=await fs.realpath(path.join(source,name));if(!file.startsWith(source+path.sep))throw Error('Source outside scene');
   }
   const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'image/webp'});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+port+'/');
 const encoded=await page.evaluate(async()=>{
  // Derive mip pixels from the PNG authoring source. Browser codec paths can
  // round premultiplied transparent RGB differently despite lossless storage.
  const{prepareTreeTextures}=await import('/trees.js');const handle=prepareTreeTextures({mobile:false,sourceFormat:'png'}),textures=await handle.take();
  try{
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1023;const ctx=canvas.getContext('2d');let y=0;
   for(const image of textures.leaves.mipmaps.slice(1)){ctx.drawImage(image,0,y);y+=image.height;}
   return{png:canvas.toDataURL('image/png'),mipCount:textures.leaves.mipmaps.length-1,coverage:textures.leaves.userData.coverage};
  }finally{for(const texture of Object.values(textures))texture.dispose();handle.dispose();}
 });
 const png=Buffer.from(encoded.png.split(',')[1],'base64'),packed=await sharp(png).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const raw=await sharp(png).ensureAlpha().raw().toBuffer();
 if(!raw.equals(await sharp(packed).ensureAlpha().raw().toBuffer()))throw Error('Leaf tail changed pixels');
  const lossless=await encodeLosslessLeaf(packed);
  await save('leaves-mips-lossless.webp',lossless,{mipCount:encoded.mipCount,coverage:encoded.coverage,decodedSha256:sha(raw),retainedPixelsExact:true,encoding:'WebP lossless, exact transparent RGB'});
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
for(const name of['bark-color-mips.webp','bark-normal-mips.webp','bark-roughness-mips.webp']){
 const pipeline=sharp(await fs.readFile(path.join(source,'assets/tree',name))).extract({left:0,top:256,width:128,height:255});
 const raw=await pipeline.clone().ensureAlpha().raw().toBuffer(),image=await pipeline.webp({lossless:true,effort:6}).toBuffer();
 if(!raw.equals(await sharp(image).ensureAlpha().raw().toBuffer()))throw Error('Bark tail changed pixels');
 await save(name,image,{decodedSha256:sha(raw),retainedPixelsExact:true});
}
const cloud=await sharp(await fs.readFile(path.join(source,'assets/sky/cloud-coverage-4k.webp'))).resize({width:1024}).webp({quality:90,effort:6}).toBuffer();
await save('cloud.webp',cloud,{approximation:'1024-wide mobile cloud coverage, WebP quality90'});
if(JSON.stringify(inputs)!==JSON.stringify(await inputHashes()))throw Error('Mobile bake inputs changed');
const generatorSha256=sha(await fs.readFile(new URL(import.meta.url)));
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({schema:1,kind:'C7 mobile quality derivatives; full terrain unchanged',inputs,generatorSha256,files},null,2)+'\n');
console.log({output,files:Object.keys(files).length,bytes:Object.values(files).reduce((n,f)=>n+f.bytes,0)});
