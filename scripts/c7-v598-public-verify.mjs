import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
const root='evidence/c7-v598-public';await mkdir(root,{recursive:true});
const jobs=[
 ['delivery','c7-public-delivery-qa.mjs',{QA_OUTPUT:'evidence/c7-v598-public-delivery',QA_PACKAGE_MANIFEST:'artifacts/c7-preview-2026-10-29-v598-manifest.json'}],
 ...['chromium','firefox','webkit'].map(engine=>[engine,'c7-v570-cross-browser.mjs',{QA_ENGINE:engine,QA_OUTPUT:root+'/'+engine}]),
];
const rows=[];
for(const[name,script,env]of jobs){
 const start=new Date().toISOString(),fd=openSync(root+'/'+name+'.log','w');
 const code=await new Promise(resolve=>{const p=spawn(process.execPath,['scripts/'+script],{env:{...process.env,QA_BASE_URL:'https://breezy-hazel-428.harvis.page',...env},stdio:['ignore',fd,fd]});p.on('exit',resolve)});
 closeSync(fd);rows.push({name,start,end:new Date().toISOString(),code});console.log(rows.at(-1));await writeFile(root+'/results.json',JSON.stringify(rows,null,2));if(code!==0)break;
}
if(rows.length!==jobs.length||rows.some(r=>r.code!==0))process.exitCode=1;
