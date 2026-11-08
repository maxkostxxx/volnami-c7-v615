// Reuse unchanged Next export; validate exact allowed native runtime delta.
import fs from'node:fs/promises';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex'),priorPath='artifacts/c7-preview-2026-10-29-v597-manifest.json',before=JSON.parse(await fs.readFile('out/c7-build.json')),prior=JSON.parse(await fs.readFile(priorPath));
if(JSON.stringify(before.sources)!==JSON.stringify(prior.build.sources))throw Error('Prior package/export source mismatch');
const prefix='public/3d/c7/runtime-v395/',names=['world.js','grass.js','grass-static.js','compact-grass-shadows.js','lake.js','sky-horizon.js','package.json'],allowed=new Set(names.map(n=>prefix+n));
async function walk(dir){const r={};for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())Object.assign(r,await walk(f));else r[f]=sha(await fs.readFile(f));}return r;}
const after={...await walk('app/c7'),...await walk(prefix.slice(0,-1))};
if(Object.keys(before.sources).some(f=>!(f in after)))throw Error('Source removed');
const changed=Object.keys(after).filter(f=>after[f]!==before.sources[f]);if(changed.length!==7||changed.some(f=>!allowed.has(f)))throw Error('Unexpected runtime changes: '+changed.join(','));
for(const f of changed.filter(f=>f.endsWith('.js'))){const p=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(p.status!==0)throw Error('Syntax failure '+f);}
let retainedFiles=0;for(const r of prior.files){if(['index.html','robots.txt'].includes(r.file)||allowed.has('public/'+r.file))continue;if(sha(await fs.readFile('out/'+r.file))!==r.sha256)throw Error('Static output drift '+r.file);retainedFiles++;}
for(const f of changed){const dest='out/'+f.slice(7);await fs.mkdir(dest.slice(0,dest.lastIndexOf('/')),{recursive:true});await fs.copyFile(f,dest);if(sha(await fs.readFile(dest))!==after[f])throw Error('Export mismatch '+f);}
const runtimeRelease={at:new Date().toISOString(),kind:'Native ES-module release; prior successful Next build/types/static export reused, not rerun',priorPackage:priorPath,priorNextBuildCompletedAt:before.completedAt,retainedFiles,changed:changed.map(file=>({file,before:before.sources[file]??null,after:after[file]}))};
await fs.writeFile('out/c7-build.json',JSON.stringify({...before,sources:after,runtimeRelease},null,2));await fs.writeFile('evidence/c7-v598-native-release.json',JSON.stringify(runtimeRelease,null,2));console.log({retainedFiles,changed});
