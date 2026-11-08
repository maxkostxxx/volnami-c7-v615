import{spawn}from'node:child_process';import fs from'node:fs/promises';import{openSync,closeSync}from'node:fs';
const out='evidence/c7-v571-verification-rerun';await fs.mkdir(out,{recursive:true});const rows=[];
const tasks=[
 ['codec','c7-v571-codec-browser-qa.mjs',{}],
 ['cache','c7-v571-cache-budget.mjs',{}],
 ['fault','c7-final-checks.mjs',{QA_OUTPUT:'evidence/c7-v571-final-checks',QA_SUITES:'fault'}],
 ['lifecycle','c7-world-lifecycle-qa.mjs',{QA_OUTPUT:'evidence/c7-v571-lifecycle',QA_TRAVEL:'.5'}],
 ['performance','c7-current-multiengine-perf.mjs',{QA_OUTPUT:'evidence/c7-v571-performance',QA_BASE_URL:'http://127.0.0.1:3007',QA_ENGINE:'chromium'}],
 ['contrast','c7-contrast-current.mjs',{QA_OUTPUT:'evidence/c7-v571-contrast',QA_BASE_URL:'http://127.0.0.1:3007',QA_GPU:'metal',QA_WIDTHS:'390,1440,2560',QA_PHASES:'0,0.025,0.08,0.3,0.42,0.83,0.93'}],
 ['motion','c7-shared-motion-qa.mjs',{QA_OUTPUT:'evidence/c7-v571-motion',QA_BASE_URL:'http://127.0.0.1:3007'}]
];
for(const[name,file,env]of tasks){const log=openSync(out+'/'+name+'.log','w'),start=new Date().toISOString();console.log('START',name);const code=await new Promise(resolve=>{const child=spawn(process.execPath,['scripts/'+file],{stdio:['ignore',log,log],env:{...process.env,...env}});child.on('exit',resolve)});closeSync(log);rows.push({name,start,end:new Date().toISOString(),code});await fs.writeFile(out+'/results.json',JSON.stringify(rows,null,2));console.log('END',name,code);if(code!==0){process.exitCode=1;break;}}
