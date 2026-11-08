import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const candidate=process.env.QA_CANDIDATE??'cooperative-terrain-v417',out='evidence/'+candidate+'-fields';await mkdir(out,{recursive:true});
const dirs=['lab/c7-scene','lab/c7-snapshots/'+candidate],runs=[];
const fields=['sdf','sculptData','rightSculptData','eastSculptData','westSculptData','farBankDepths','nearBankZ','axisRows','leftOccludedRows','nearWorldRows','innerRearRows','greenRootRows'];
for(const dir of dirs){
 const source=await readFile(dir+'/terrain.js','utf8'),probe=dir+'/terrain-field-probe.mjs';
 await writeFile(probe,source+'\nexport const qaFields={'+fields.join(',')+'};\n');
 let timer,last=performance.now(),maximumGap=0,beats=0;timer=setInterval(()=>{const t=performance.now();maximumGap=Math.max(maximumGap,t-last);last=t;beats++;},1);
 let module;const start=performance.now();
 try{module=await import(pathToFileURL(path.resolve(probe)));await new Promise(r=>setTimeout(r,0));}finally{clearInterval(timer);await rm(probe);}
 const hashes=Object.fromEntries(Object.entries(module.qaFields).map(([n,a])=>{const bytes=ArrayBuffer.isView(a)?new Uint8Array(a.buffer,a.byteOffset,a.byteLength):Buffer.from(JSON.stringify(a));return[n,{bytes:bytes.byteLength,sha:createHash('sha256').update(bytes).digest('hex')}];}));
 const samples=new Float64Array(201*201);for(let z=0;z<=200;z++)for(let x=0;x<=200;x++)samples[z*201+x]=module.heightAt(-300+x*3,-600+z*4.5);
 runs.push({dir,sourceSha256:createHash('sha256').update(source).digest('hex'),elapsedMs:performance.now()-start,maximumGap,beats,hashes,heightSampleSha:createHash('sha256').update(new Uint8Array(samples.buffer)).digest('hex')});
}
const exact=JSON.stringify(runs[0].hashes)===JSON.stringify(runs[1].hashes)&&runs[0].heightSampleSha===runs[1].heightSampleSha;
const result={pass:exact&&runs[1].beats>10&&runs[1].maximumGap<100,kind:'Node module evaluation. Exact bytes of seven typed fields and five authored row tables plus40,401height samples; heartbeat is not browser/device acceptance.',runs};
await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(result);if(!result.pass)process.exitCode=1;
