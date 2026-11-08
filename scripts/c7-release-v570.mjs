// Reuse a verified Next static export when ONLY external C7 ES modules change.
// Does not claim a new Next build. Rejects any UI/source/static-output drift.
import fs from 'node:fs/promises';import {createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const priorPath=process.env.QA_PRIOR_PACKAGE,out=process.env.QA_OUTPUT;if(!priorPath||!out)throw Error('QA_PRIOR_PACKAGE and QA_OUTPUT required');
const sha=b=>createHash('sha256').update(b).digest('hex'),before=JSON.parse(await fs.readFile('out/c7-build.json')),prior=JSON.parse(await fs.readFile(priorPath));
if(JSON.stringify(before.sources)!==JSON.stringify(prior.build.sources))throw Error('Prior package/export source manifest mismatch');
const allowed=new Set(['materials.js','sky-light.js','sky-horizon.js','sky-data/field.rgba16f.gz','left-sky-data/field.rgba16f.gz','package.json'].map(n=>'public/3d/c7/runtime-v395/'+n));
async function walk(dir){const result={};for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())Object.assign(result,await walk(f));else result[f]=sha(await fs.readFile(f));}return result;}
const after={...await walk('app/c7'),...await walk('public/3d/c7/runtime-v395')};
if(JSON.stringify(Object.keys(before.sources).sort())!==JSON.stringify(Object.keys(after).sort()))throw Error('Module/source set changed; full build required');
const changed=Object.keys(after).filter(f=>after[f]!==before.sources[f]);if(!changed.length||changed.some(f=>!allowed.has(f)))throw Error('Changes exceed native runtime release: '+changed.join(','));
for(const f of changed.filter(f=>f.endsWith('.js'))){const check=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(check.status!==0)throw Error('Syntax failure: '+f+'\n'+check.stderr);}
let retainedFiles=0;const generated=new Set(['index.html','robots.txt']);
for(const r of prior.files){if(generated.has(r.file)||allowed.has('public/'+r.file))continue;if(sha(await fs.readFile('out/'+r.file))!==r.sha256)throw Error('Static export changed: '+r.file);retainedFiles++;}
for(const f of changed)if(sha(await fs.readFile('out/'+f.slice('public/'.length)))!==after[f])throw Error('Native export not current: '+f);
const runtimeRelease={at:new Date().toISOString(),kind:'Native ES-module release; prior successful Next build/types/static export reused, not rerun',priorPackage:priorPath,priorNextBuildCompletedAt:before.completedAt,retainedFiles,changed:changed.map(f=>({file:f,before:before.sources[f],after:after[f]}))};
await fs.writeFile('out/c7-build.json',JSON.stringify({...before,sources:after,runtimeRelease},null,2));await fs.writeFile(out,JSON.stringify(runtimeRelease,null,2));console.log({retainedFiles,changed});
