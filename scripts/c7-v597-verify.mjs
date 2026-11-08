import{spawn}from'node:child_process';import{mkdir,writeFile}from'node:fs/promises';import{openSync,closeSync}from'node:fs';
const root='evidence/c7-v597-verification';await mkdir(root,{recursive:true});const jobs=[
 ['runtime-pixels','c7-v597-runtime-pixels.mjs',{}],
 ['flight-abba','c7-v597-flight-abba.mjs',{}],
 ['lifecycle','c7-world-lifecycle-qa.mjs',{QA_OUTPUT:'evidence/c7-v597-lifecycle',QA_TRAVEL:'.5'}],
 ...['firefox','webkit'].map(engine=>[engine,'c7-v570-cross-browser.mjs',{QA_ENGINE:engine,QA_WIDTHS:'390',QA_BASE_URL:'http://127.0.0.1:3007',QA_OUTPUT:'evidence/c7-v597-local-'+engine}]),
];const rows=[];for(const[name,script,env]of jobs){const fd=openSync(root+'/'+name+'.log','w'),start=new Date().toISOString();const code=await new Promise(resolve=>{const p=spawn(process.execPath,['scripts/'+script],{env:{...process.env,...env},stdio:['ignore',fd,fd]});p.on('exit',resolve)});closeSync(fd);rows.push({name,start,end:new Date().toISOString(),code});await writeFile(root+'/results.json',JSON.stringify(rows,null,2));console.log(rows.at(-1));if(code!==0)break;}if(rows.length!==jobs.length||rows.some(r=>r.code!==0))process.exitCode=1;
