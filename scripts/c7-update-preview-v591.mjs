// Publish only the verified archive. Hosting credentials stay outside the repo.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const verify=JSON.parse(await fs.readFile('evidence/c7-v591-verification/results.json'));
if(verify.length!==7||verify.some(r=>r.code!==0))throw Error('Pending or failed v591 verification');
const suites=JSON.parse(await fs.readFile('evidence/c7-v591-final-checks/results.json'));
if(suites.runs.length!==4||suites.runs.some(r=>r.code!==0))throw Error('Current targeted suites incomplete');
const baseline=JSON.parse(await fs.readFile('evidence/c7-v570-final-checks/results.json'));
if(baseline.runs.length!==8||baseline.runs.some(r=>r.code!==0))throw Error('Unchanged UI baseline incomplete');
const release=JSON.parse(await fs.readFile('evidence/c7-v591-native-release.json'));
if(release.retainedFiles!==101||release.changed.some(r=>!['public/3d/c7/runtime-v395/world.js','public/3d/c7/runtime-v395/package.json'].includes(r.file)))throw Error('Unexpected release scope');
const pkg=JSON.parse(await fs.readFile('evidence/c7-v591-package.json'));
if(pkg.files!==105||!pkg.allEntryHashesExact)throw Error('Package verification incomplete');
const directory=path.join(os.homedir(),'.config/volnami-c7-preview');
const previous=JSON.parse(await fs.readFile(path.join(directory,'harvis-v571.json'))),receipt=path.join(directory,'harvis-v591.json');
try{await fs.access(receipt);throw Error('Existing deployment receipt; inspect before retry');}catch(e){if(e.code!=='ENOENT')throw e;}
const archive=await fs.readFile('artifacts/c7-preview-2026-10-29-v591.zip');
if(crypto.createHash('sha256').update(archive).digest('hex')!==pkg.archiveSHA256)throw Error('Verified archive changed');
const endpoint=new URL('https://harvis.dev/api/upload');
endpoint.searchParams.set('name','Volnami C7 — preview');endpoint.searchParams.set('subdomain',previous.subdomain);endpoint.searchParams.set('deployToken',previous.deployToken);
try{
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/zip'},body:archive,signal:AbortSignal.timeout(180000)});
 const raw=await response.text();await fs.writeFile(receipt,raw,{mode:0o600,flag:'wx'});
 const data=JSON.parse(raw);console.log({status:response.status,url:data.url,updated:data.updated,fileCount:data.fileCount,expiresAt:data.expiresAt,error:data.error?.code});
 if(!response.ok||data.url!==previous.url||data.updated!==true)process.exitCode=1;
}catch(e){console.error('Outcome uncertain. Inspect private receipt before retrying.',e.name,e.cause?.code??'unknown');process.exitCode=1;}
