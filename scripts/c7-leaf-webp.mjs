// Lossless transport only. The PNG authoring sources remain untouched, and
// hidden RGB under transparent texels is preserved for exact mip generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
const run=promisify(execFile);
export async function encodeLosslessLeaf(png){
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'c7-leaf-'));
 try{
  const input=path.join(temporary,'source.png'),output=path.join(temporary,'exact.webp');
  await fs.writeFile(input,png);
  await run(process.env.C7_CWEBP??'cwebp',['-quiet','-lossless','-z','9','-exact',input,'-o',output]);
  const encoded=await fs.readFile(output);
  const [before,after]=await Promise.all([sharp(png).ensureAlpha().raw().toBuffer(),sharp(encoded).ensureAlpha().raw().toBuffer()]);
  if(!before.equals(after))throw Error('Leaf WebP changed RGBA pixels');
  return encoded;
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const source=path.resolve(process.argv[2]??'lab/c7-scene/assets/tree/leaves-oak.png'),output=path.resolve(process.argv[3]??'lab/c7-scene/assets/tree/leaves-oak-lossless.webp');
 const original=await fs.readFile(source),encoded=await encodeLosslessLeaf(original);
 await fs.writeFile(output,encoded);console.log({source,output,before:original.length,after:encoded.length,RGBAExact:true});
}
