import{spawn}from'node:child_process';import{mkdir,writeFile}from'node:fs/promises';import{openSync,closeSync}from'node:fs';
const root='evidence/c7-v598-verification';await mkdir(root,{recursive:true});const jobs=[
 ['reverse','c7-v598-reverse-control.mjs',{QA_OUTPUT:'evidence/c7-v598-reverse-control'}],
 ['lifecycle','c7-world-lifecycle-qa.mjs',{QA_OUTPUT:'evidence/c7-v598-lifecycle',QA_TRAVEL:'.5'}],
 ['firefox','c7-v598-reverse-control.mjs',{QA_ENGINE:'firefox',QA_WIDTHS:'390',QA_OUTPUT:'evidence/c7-v598-reverse-firefox'}],
 ['webkit','c7-v598-reverse-control.mjs',{QA_ENGINE:'webkit',QA_WIDTHS:'390',QA_OUTPUT:'evidence/c7-v598-reverse-webkit'}],
 ['final','c7-final-checks.mjs',{QA_OUTPUT:'evidence/c7-v598-final-checks'}]
];const rows=[];
for(const[name,script,env]of jobs){const start=new Date().toISOString(),fd=openSync(root+'/'+name+'.log','w');const code=await new Promise(resolve=>{const p=spawn(process.execPath,['scripts/'+script],{stdio:['ignore',fd,fd],env:{...process.env,...env}});p.on('exit',resolve)});closeSync(fd);rows.push({name,start,end:new Date().toISOString(),code});console.log(rows.at(-1));await writeFile(root+'/results.json',JSON.stringify(rows,null,2));if(code!==0)break;}if(rows.length!==jobs.length||rows.some(r=>r.code!==0))process.exitCode=1;
