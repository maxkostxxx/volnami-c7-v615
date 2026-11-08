import{spawn}from'node:child_process';import{mkdir,writeFile}from'node:fs/promises';import{openSync,closeSync}from'node:fs';
const root='evidence/c7-v591-verification';await mkdir(root,{recursive:true});const jobs=[
 ['firefox-fallback','c7-v590-depth-qa.mjs',{QA_ENGINE:'firefox',QA_WIDTHS:'390,1440',QA_OUTPUT:'evidence/c7-v591-depth-firefox'}],
 ['chromium-depth','c7-v590-depth-qa.mjs',{QA_OUTPUT:'evidence/c7-v591-depth-chromium'}],
 ['depth-perf-2560','c7-v587-depth-perf.mjs',{QA_WIDTH:'2560'}],
 ['lifecycle','c7-world-lifecycle-qa.mjs',{QA_OUTPUT:'evidence/c7-v591-lifecycle',QA_TRAVEL:'.5'}],
 ['functional','c7-final-checks.mjs',{QA_OUTPUT:'evidence/c7-v591-final-checks',QA_SUITES:'fault,state,suspension,navigation'}],
 ['performance','c7-current-multiengine-perf.mjs',{QA_OUTPUT:'evidence/c7-v591-performance',QA_ENGINE:'chromium',QA_WIDTHS:'390,1440,2560',QA_BASE_URL:'http://127.0.0.1:3007'}],
 ['preservation','c7-preservation-current.mjs',{QA_OUTPUT:'evidence/c7-v591-preservation',QA_PRIOR_BUILD:'backups/c7-v572-start-2026-10-29/c7-build-v571.json'}]
];const rows=[];for(const[name,script,env]of jobs){const start=new Date().toISOString(),fd=openSync(root+'/'+name+'.log','w');const code=await new Promise(resolve=>{const p=spawn(process.execPath,['scripts/'+script],{env:{...process.env,...env},stdio:['ignore',fd,fd]});p.on('exit',resolve)});closeSync(fd);rows.push({name,start,end:new Date().toISOString(),code});console.log(rows.at(-1));await writeFile(root+'/results.json',JSON.stringify(rows,null,2));if(code!==0)break;}if(rows.length!==jobs.length||rows.some(r=>r.code!==0))process.exitCode=1;
