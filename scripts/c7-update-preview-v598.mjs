// Publish only the verified archive. Hosting credentials stay outside the repo.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const verify=JSON.parse(await fs.readFile('evidence/c7-v598-verification/results.json'));
if(verify.length!==5||verify.some(r=>r.code!==0))throw Error('Pending or failed v598 verification');
const suites=JSON.parse(await fs.readFile('evidence/c7-v598-final-checks/results.json'));
if(suites.runs.length!==8||suites.runs.some(r=>r.code!==0))throw Error('Current targeted suites incomplete');
const release=JSON.parse(await fs.readFile('evidence/c7-v598-native-release.json'));
if(release.retainedFiles!==98||release.changed.length!==7)throw Error('Unexpected release scope');
const pixels=JSON.parse(await fs.readFile('evidence/c7-v598-runtime-pixels/results.json'));
if(pixels.rows.filter(r=>r.mode==='candidate').length!==33||pixels.errors.length||pixels.rows.some(r=>r.glError||r.diff?.meanRGB>.02||r.diff?.above10>100))throw Error('Runtime pixel regression');
const reverse=JSON.parse(await fs.readFile('evidence/c7-v598-reverse-control/results.json'));
if(reverse.rows.length!==6||reverse.errors.length||reverse.rows.some(r=>r.firstVsBaseline?.meanRGB>.02||r.returnedVsBaseline?.meanRGB>.02||r.returnToRepeat.meanRGB!==0))throw Error('Reverse control regression');
for(const row of reverse.rows.filter(r=>r.mode==='candidate')){const base=reverse.rows.find(r=>r.width===row.width&&r.mode==='baseline');if(row.firstToReturn.meanRGB>base.firstToReturn.meanRGB+.002)throw Error('New directional state error');}
const flight=JSON.parse(await fs.readFile('evidence/c7-v598-flight-abba/results.json'));
if(flight.rows.length!==12||flight.errors.length)throw Error('Paired flight incomplete');
const lifecycle=JSON.parse(await fs.readFile('evidence/c7-v598-lifecycle/results.json'));
if(!lifecycle.restorePixelsExact||!lifecycle.contextReleased||lifecycle.abortName!=='AbortError'||lifecycle.errors.length)throw Error('Lifecycle failure');
const pkg=JSON.parse(await fs.readFile('evidence/c7-v598-package.json'));
if(pkg.files!==107||!pkg.allEntryHashesExact)throw Error('Package verification incomplete');
const directory=path.join(os.homedir(),'.config/volnami-c7-preview');
const previous=JSON.parse(await fs.readFile(path.join(directory,'harvis-v597.json'))),receipt=path.join(directory,'harvis-v598.json');
try{await fs.access(receipt);throw Error('Existing deployment receipt; inspect before retry');}catch(e){if(e.code!=='ENOENT')throw e;}
const archive=await fs.readFile('artifacts/c7-preview-2026-10-29-v598.zip');
if(crypto.createHash('sha256').update(archive).digest('hex')!==pkg.archiveSHA256)throw Error('Verified archive changed');
const endpoint=new URL('https://harvis.dev/api/upload');
endpoint.searchParams.set('name','Volnami C7 — preview');endpoint.searchParams.set('subdomain',previous.subdomain);endpoint.searchParams.set('deployToken',previous.deployToken);
try{
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/zip'},body:archive,signal:AbortSignal.timeout(180000)});
 const raw=await response.text();await fs.writeFile(receipt,raw,{mode:0o600,flag:'wx'});
 const data=JSON.parse(raw);console.log({status:response.status,url:data.url,updated:data.updated,fileCount:data.fileCount,expiresAt:data.expiresAt,error:data.error?.code});
 if(!response.ok||data.url!==previous.url||data.updated!==true)process.exitCode=1;
}catch(e){console.error('Outcome uncertain. Inspect private receipt before retrying.',e.name,e.cause?.code??'unknown');process.exitCode=1;}
