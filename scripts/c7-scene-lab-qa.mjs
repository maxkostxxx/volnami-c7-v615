import {mkdir,readFile,readdir,writeFile,lstat,realpath,readlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const posix=value=>value.split(path.sep).join('/');
const hashFile=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')};
const sourceHashesIn=value=>{const out=new Set();const visit=v=>{if(!v||typeof v!=='object')return;for(const[k,item]of Object.entries(v)){if(/source.*sha256/i.test(k)&&typeof item==='string')out.add(item);else visit(item)}};visit(value);return out};

// readdir({recursive:true}) does not descend into symlink directories. Resolve
// each directory explicitly, keeping both its public path and its actual file.
export async function collectSourceManifest(sourceRoot){
 const root=path.resolve(sourceRoot),files=[],symlinks={},excludedFiles={};
 async function walk(relative='',ancestors=new Set()){
  const logical=path.join(root,relative),entry=await lstat(logical),resolved=await realpath(logical);
  if(entry.isSymbolicLink())symlinks[posix(relative)]={target:await readlink(logical),resolvedPath:resolved};
  if(relative&&relative.split(path.sep).includes('research')){excludedFiles[posix(relative)]='Research source/preview directory excluded';return}
  const stats=entry.isSymbolicLink()?await lstat(resolved):entry;
  if(stats.isDirectory()){
   if(ancestors.has(resolved))throw new Error(`Symlink directory cycle: ${logical}`);
   const next=new Set(ancestors).add(resolved);
   for(const name of(await readdir(logical)).sort())await walk(path.join(relative,name),next);
  }else if(stats.isFile()){
   const name=posix(relative);
   if(/\.(hdr|exr|zip|blend|psd)$/i.test(name)||/(^|\/)research\.json$/i.test(name)){excludedFiles[name]='Authoring/archive source excluded; provenance metadata records its source hash';return}
   files.push({name,logical,resolved,bytes:stats.size});
  }
 }
 await walk();
 // Runtime manifests distinguish original downloaded texture files from their
 // optimized derivatives without guessing from JPEG extensions or filenames.
 const originalHashes=new Set();
 for(const f of files)if(/(^|\/)runtime-manifest\.json$/.test(f.name))for(const hash of sourceHashesIn(JSON.parse(await readFile(f.logical,'utf8'))))originalHashes.add(hash);
 const authorSources={},runtimeDependencies={};
 for(const f of files){
  const sha256=await hashFile(f.logical),record={sha256,bytes:f.bytes,resolvedPath:f.resolved,browserRequested:false};
  const assetData=/^assets\//.test(f.name)&&/\.(webp|png|jpe?g|avif|gif|ktx2?|dds|glb|gltf|bin|woff2?)$/i.test(f.name);
  const vendorRuntime=/^vendor\//.test(f.name)&&/\.(m?js|json|glsl|wgsl|wasm)$/i.test(f.name);
  if((assetData&&!originalHashes.has(sha256))||vendorRuntime)runtimeDependencies[f.name]={...record,kind:vendorRuntime?'vendored runtime code/data':'runtime asset'};
  else authorSources[f.name]={...record,kind:originalHashes.has(sha256)?'original authoring asset':'author code/provenance'};
 }
 return{schemaVersion:2,sourceRoot:posix(sourceRoot),resolvedSourceRoot:root,authorSources,runtimeDependencies,symlinks,excludedFiles,hashPolicy:'SHA256 of file contents; symlink directories followed with cycle detection. Runtime inventory excludes research/HDR/archive originals. browserRequested identifies files actually requested by this run.'};
}

async function recordRequests(manifest,urls){
 const root=manifest.resolvedSourceRoot,workspace=process.cwd();
 for(const urlString of [...urls].sort()){
  const url=new URL(urlString);if(url.origin!=='http://127.0.0.1:3027')continue;
  let local=path.resolve(workspace,'.'+decodeURIComponent(url.pathname));
  if(local!==workspace&&!local.startsWith(workspace+path.sep))continue;
  if(url.pathname.endsWith('/'))local=path.join(local,'index.html');
  const relative=path.relative(root,local),key=!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)?posix(relative):'$workspace/'+posix(path.relative(workspace,local));
  let record=manifest.authorSources[key]??manifest.runtimeDependencies[key];
  if(!record){
   try{const info=await lstat(local);if(!info.isFile()&&!info.isSymbolicLink())continue;record={sha256:await hashFile(local),bytes:info.size,resolvedPath:await realpath(local),kind:'observed external runtime dependency'};manifest.runtimeDependencies[key]=record}catch(error){manifest.hashErrors??=[];manifest.hashErrors.push({url:urlString,error:error.message});continue}
  }
  record.browserRequested=true;record.requestUrls??=[];if(!record.requestUrls.includes(url.pathname))record.requestUrls.push(url.pathname);
 }
}

async function main(){
 if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required');
 const output=process.env.QA_OUTPUT;await mkdir(output,{recursive:true});
 const sourceRoot=process.env.QA_SOURCE??'lab/c7-scene',manifest=await collectSourceManifest(sourceRoot);
 const runs=[],requests=new Set();
 const writeManifest=async()=>{await recordRequests(manifest,requests);await writeFile(output+'/manifest.json',JSON.stringify({...manifest,sources:Object.fromEntries(Object.entries(manifest.authorSources).map(([name,file])=>[name,file.sha256])),query:process.env.QA_QUERY??'',kind:process.env.QA_HASH_ONLY==='1'?'CPU-only dependency hashing; no browser or device validation':'Chromium headless on Metal; viewport emulation, not physical phone verification',runs},null,2))};
 if(process.env.QA_HASH_ONLY==='1'){await writeManifest();console.log({authorSources:Object.keys(manifest.authorSources).length,runtimeDependencies:Object.keys(manifest.runtimeDependencies).length,symlinks:manifest.symlinks});return}
 const sizes=(process.env.QA_SIZES??'1280x720').split(',').map(s=>s.split('x').map(Number));
 const phases=(process.env.QA_PHASES??'0').split(',').map(Number);
 const{chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
 try{
  for(const[width,height]of sizes){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});page.on('response',r=>{if(r.status()>=400)failed.push([r.url(),r.status()]);else requests.add(r.url())});
   await page.goto('http://127.0.0.1:3027/'+sourceRoot+'/?clean&freeze&'+(process.env.QA_QUERY??''));await page.waitForSelector('body.ready',{timeout:60000});
   for(const sun of phases){const state=await page.evaluate(s=>sceneLab.set({sun:s}),sun);await page.waitForTimeout(150);const gpu=await page.evaluate(()=>{const r=sceneLab.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{version:g.getParameter(g.VERSION),renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),drawingBuffer:[g.drawingBufferWidth,g.drawingBufferHeight],rendererDPR:r.getPixelRatio(),emulatedDeviceDPR:devicePixelRatio,antialias:g.getContextAttributes().antialias,samples:g.getParameter(g.SAMPLES),contextLost:g.isContextLost(),programsLinked:r.info.programs.every(p=>g.getProgramParameter(p.program,g.LINK_STATUS))}});const name=`${width}x${height}-sun${sun}`;await page.screenshot({path:`${output}/${name}.png`});runs.push({width,height,sun,errors:[...errors],failed:[...failed],gpu,state})}
   await page.close();
  }
 }finally{await browser.close();await writeManifest()}
 console.log(runs.map(r=>({size:`${r.width}x${r.height}`,sun:r.sun,errors:r.errors,failed:r.failed,triangles:r.state.triangles})));
 if(runs.some(r=>r.errors.length||r.failed.length||r.gpu?.contextLost||r.gpu?.programsLinked===false)||manifest.hashErrors?.length)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
