// Stage an explicitly reviewed native-runtime delta onto a verified unchanged Next export.
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const priorPath=process.env.QA_PRIOR_PACKAGE,output=process.env.QA_OUTPUT,names=(process.env.QA_ALLOWED_RUNTIME_FILES||'').split(',').filter(Boolean);
if(!priorPath||!output||!names.length)throw Error('QA_PRIOR_PACKAGE, QA_OUTPUT, QA_ALLOWED_RUNTIME_FILES required');
if(names.some(n=>n.includes('..')||n.startsWith('/')))throw Error('Invalid allowlist');
const prefix='public/3d/c7/runtime-v395/',allowed=new Set(names.map(n=>prefix+n)),sha=b=>createHash('sha256').update(b).digest('hex');
const before=JSON.parse(await fs.readFile('out/c7-build.json')),prior=JSON.parse(await fs.readFile(priorPath));if(JSON.stringify(before.sources)!==JSON.stringify(prior.build.sources))throw Error('Prior build/package mismatch');
async function walk(dir){const r={};for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())Object.assign(r,await walk(f));else r[f]=sha(await fs.readFile(f));}return r;}
const after={...await walk('app/c7'),...await walk(prefix.slice(0,-1))};
if(JSON.stringify(Object.keys(before.sources).sort())!==JSON.stringify(Object.keys(after).sort()))throw Error('Source set changed; review separately');
const changed=Object.keys(after).filter(f=>after[f]!==before.sources[f]);if(!changed.length||changed.some(f=>!allowed.has(f)))throw Error('Unexpected delta: '+changed.join(','));
for(const f of changed.filter(f=>f.endsWith('.js'))){const p=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(p.status!==0)throw Error('Syntax failure '+f);}
let retainedFiles=0;for(const r of prior.files){if(['index.html','robots.txt'].includes(r.file)||changed.includes('public/'+r.file))continue;if(sha(await fs.readFile('out/'+r.file))!==r.sha256)throw Error('Static output drift '+r.file);retainedFiles++;}
// Finish all validation before writes. Preserve the original export in the caller's backup.
for(const f of changed){const destination='out/'+f.slice(7);await fs.copyFile(f,destination);if(sha(await fs.readFile(destination))!==after[f])throw Error('Export copy mismatch '+f);}
const runtimeRelease={at:new Date().toISOString(),kind:'Native ES-module release; prior successful Next build/types/static export reused, not rerun',priorPackage:priorPath,priorNextBuildCompletedAt:before.completedAt,retainedFiles,allowed:names,changed:changed.map(file=>({file,before:before.sources[file],after:after[file]}))};
await fs.writeFile('out/c7-build.json',JSON.stringify({...before,sources:after,runtimeRelease},null,2));await fs.mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await fs.writeFile(output,JSON.stringify(runtimeRelease,null,2));console.log({retainedFiles,changed});
