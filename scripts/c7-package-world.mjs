import {readFile,writeFile,mkdir,copyFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {bundleWorld} from './c7-bundle-world.mjs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
const {minify}=createRequire(import.meta.url)('next/dist/compiled/terser');
const source=path.resolve(process.env.C7_SCENE_SOURCE??'lab/c7-scene'),target=path.resolve(process.env.C7_RUNTIME_TARGET??'public/3d/c7/runtime-v646');
// Immutable reference releases for the current optimization task.
for(const protectedRoot of ['public/3d/c7/runtime-v641','public/3d/c7/runtime-v645',
 'artifacts/c7-preview-2026-11-07-v641-local','artifacts/c7-preview-2026-11-08-v645-local']){
 const fixed=path.resolve(protectedRoot);if(target===fixed||target.startsWith(fixed+path.sep))throw Error('Reference release is read-only: '+protectedRoot);
}
const records={},visited=new Set(),hash=b=>createHash('sha256').update(b).digest('hex');
async function write(relative,data,origin){
 const destination=path.join(target,relative);await mkdir(path.dirname(destination),{recursive:true});
 let unchanged=false;try{unchanged=hash(await readFile(destination))===hash(data);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!unchanged)await writeFile(destination,data);
 records[relative]={bytes:Buffer.byteLength(data),sha256:hash(data),source:origin};
}
async function module(relative){
 if(visited.has(relative))return;visited.add(relative);
 const file=path.resolve(source,relative);if(!file.startsWith(source+path.sep))throw Error('Module escapes C7 source');
 const original=await readFile(file,'utf8');
 const imports=[...original.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
 for(const specifier of imports){
  if(specifier==='three')continue;
  if(!specifier.startsWith('.'))throw Error('Unexpected external dependency: '+specifier);
  await module(path.normalize(path.join(path.dirname(relative),specifier)));
 }
 let three=path.relative(path.dirname(relative),'vendor/three/three.module.js').split(path.sep).join('/');if(!three.startsWith('.'))three='./'+three;
 const packaged=original.replace(/((?:from\s*|import\s*\(\s*|import\s*)['"])three(['"])/g,(_,a,b)=>a+three+b);
 await write(relative,packaged,path.relative(process.cwd(),file));
}
// Reject stale authoring data before changing any portable runtime file.
const terrainSourceHash=hash(await readFile(path.join(source,'terrain.js')));
const {rearMeadowData}=await import(pathToFileURL(path.join(source,'rear-meadow-data.js')));
if(rearMeadowData.sourceSha256!==terrainSourceHash)throw Error('Rebake the exact rear meadow mask before packaging');
if(hash(gunzipSync(Buffer.from(rearMeadowData.gzipBase64,'base64')))!==rearMeadowData.sha256)throw Error('Damaged rear meadow mask');
const regularCache=JSON.parse(await readFile(path.join(source,'terrain-cache/manifest.json'),'utf8'));
if(regularCache.sourceSha256!==terrainSourceHash || regularCache.gzipSha256!==hash(await readFile(path.join(source,'terrain-cache/geometry.bin.gz'))))throw Error('Rebake the terrain cache before packaging');
for(const directory of ['sky-data','left-sky-data']){
 const metadata=JSON.parse(await readFile(path.join(source,directory,'field.json'),'utf8'));
 for(const name of ['terrain.js','adaptive-terrain.js'])if(metadata.source[name]!==hash(await readFile(path.join(source,name))))throw Error('Rebake '+directory+' before packaging: '+name);
 if(metadata.gzipSha256!==hash(await readFile(path.join(source,directory,'field.rgba16f.gz'))))throw Error('Damaged '+directory+' field');
 if(metadata.encoding!=='C7HQv001-fixed-point-xyz')throw Error('Run c7-compact-horizon.mjs before packaging v602: '+directory);
}
const startup=JSON.parse(await readFile(path.join(source,'startup-data/manifest.json'),'utf8'));
for(const[name,expected]of Object.entries(startup.sources))if(hash(await readFile(path.join(source,name)))!==expected)throw Error('Rebake startup data: '+name);
if(hash(await readFile(path.join(source,'startup-data/fields.bin.gz')))!==startup.gzipSha256)throw Error('Damaged startup fields');
const startupManifest=await readFile(path.join(source,'startup-data/manifest.json'));
if(!(await readFile(path.join(source,'startup-data-key.js'),'utf8')).includes("'"+hash(startupManifest)+"'"))throw Error('Startup manifest key mismatch');
// Mobile derivatives are tied to actual author sources and generator bytes.
const mobile=JSON.parse(await readFile(path.join(source,'mobile-data/manifest.json'),'utf8'));
if(mobile.schema!==1||mobile.generatorSha256!==hash(await readFile('scripts/c7-bake-mobile-profile.mjs')))throw Error('Rebuild mobile derivatives with current generator');
for(const[name,expected]of Object.entries(mobile.inputs))if(hash(await readFile(path.join(source,name)))!==expected)throw Error('Rebuild mobile derivatives: '+name);
for(const[name,record]of Object.entries(mobile.files)){
 if(name.includes('..')||path.isAbsolute(name))throw Error('Invalid mobile asset name');
 if(hash(await readFile(path.join(source,'mobile-data',name)))!==record.sha256)throw Error('Damaged mobile derivative: '+name);
}
const {ZSTDDecoder}=await import(pathToFileURL(path.join(source,'vendor/zstd/zstddec.js')));
const zstd=new ZSTDDecoder();await zstd.init();
const {binaryTransports}=await import(pathToFileURL(path.join(source,'binary-transports.js')));
for(const [name,meta]of Object.entries(binaryTransports)){
 const gzip=await readFile(path.join(source,name)),br=await readFile(path.join(source,meta.file));
 const raw=gunzipSync(gzip);
 if(hash(gzip)!==meta.gzipSha256||hash(br)!==meta.sha256||br.length!==meta.bytes||raw.length!==meta.rawBytes||hash(raw)!==meta.rawSha256||!brotliDecompressSync(br).equals(raw))throw Error('Rebuild binary transport: '+name);
 if(meta.zstd){
  const body=await readFile(path.join(source,meta.zstd.file));
  if(body.length!==meta.zstd.bytes||hash(body)!==meta.zstd.sha256||!Buffer.from(zstd.decode(body,meta.rawBytes)).equals(raw))throw Error('Rebuild zstd transport: '+name);
  await write(meta.zstd.file.slice(2),body,'lab/c7-scene/'+meta.zstd.file.slice(2));
 }
 await write(meta.file.slice(2),br,'lab/c7-scene/'+meta.file.slice(2));
}
await module('world.js');
await module('worker-entry.js');
await module('grass-prep-entry.js');
for(const name of['three.module.js','three.core.js']){
 const original=await readFile('node_modules/three/build/'+name,'utf8');
 // Keep semantics and public property names. Only shorten local identifiers
 // and whitespace; no compression transforms, no shader string changes.
 const {code}=await minify(original,{module:true,compress:false,mangle:true,format:{comments:/@license|^!/}});
 if(!code)throw Error('Empty vendor module: '+name);
 await write('vendor/three/'+name,code+'\n','node_modules/three/build/'+name);
}
for(const name of[
 'startup-data/manifest.json','startup-data/fields.bin.gz','assets/sky/cloud-coverage-4k.webp','assets/tree/leaves-oak-lossless.webp','assets/tree/bark-color-mips.webp','assets/tree/bark-normal-mips.webp','assets/tree/bark-roughness-mips.webp',
 'sky-data/field.rgba16f.gz','left-sky-data/field.rgba16f.gz','terrain-cache/geometry.bin.gz',
])await write(name,await readFile(path.join(source,name)),'lab/c7-scene/'+name);
for(const name of ['manifest.json',...Object.keys(mobile.files)])await write('mobile-data/'+name,await readFile(path.join(source,'mobile-data',name)),'lab/c7-scene/mobile-data/'+name);
const cache=JSON.parse(await readFile(path.join(source,'terrain-cache/manifest.json'),'utf8'));
// Only import specifiers change; the cache validates the actual shipped source.
cache.sourceSha256=records['terrain.js'].sha256;
await write('terrain-cache/manifest.json',JSON.stringify(cache,null,2),'lab/c7-scene/terrain-cache/manifest.json');
await write('vendor/three/LICENSE',await readFile('node_modules/three/LICENSE'),'node_modules/three/LICENSE');
for(const relative of['vendor/zstd/LICENSE','vendor/ez-tree/LICENSE','vendor/ez-tree/TEXTURE-LICENSE.md','assets/tree/runtime-manifest.json','assets/sky/runtime-manifest.json']){
 try{await write(relative,await readFile(path.join(source,relative)),'lab/c7-scene/'+relative);}catch(e){if(e.code!=='ENOENT')throw e;}
}
// Bundle once after source validation and module rewriting. Keep terrain.js as
// the source-check payload used by the cache loader; all other author modules
// are included in world.js and must not inflate the portable release again.
const bundledSources=Object.fromEntries([...visited].filter(name=>!['worker-entry.js','grass-prep-entry.js','startup-inputs.js'].includes(name)).map(name=>[name,{source:records[name].source,sha256:records[name].sha256}]));
const bundle=await bundleWorld(target);
await write('world.js',bundle.code,'Bundled lab/c7-scene/world.js dependency graph');
const inputsBundle=await bundleWorld(target,'startup-inputs.js');
await write('startup-inputs.js',inputsBundle.code,'Bundled lab/c7-scene/startup-inputs.js dependency graph');
for(const name of [...visited,'vendor/three/three.module.js','vendor/three/three.core.js']){
 if(['world.js','worker-entry.js','grass-prep-entry.js','terrain.js','startup-inputs.js'].includes(name))continue;
 await rm(path.join(target,name));delete records[name];
}
await writeFile(path.join(target,'package.json'),JSON.stringify({kind:'Self-contained C7 ES-module runtime, no source symlinks',version:path.basename(target),bundler:{webpack:bundle.webpack,sources:bundledSources},bytes:Object.values(records).reduce((n,r)=>n+r.bytes,0),files:records},null,2));
console.log({target,files:Object.keys(records).length,bytes:Object.values(records).reduce((n,r)=>n+r.bytes,0)});
