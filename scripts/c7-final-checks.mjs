// Run browser suites serially so they do not compete for the GPU.
import {spawn} from 'node:child_process'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {openSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const root=process.env.QA_OUTPUT;await mkdir(root,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'))
for(const[f,h]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(f)).digest('hex')!==h)throw new Error('Stale export '+f)
const suites=[['ui','c7-ui-current.mjs'],['accessibility','c7-accessibility-current.mjs'],['fault','c7-shared-fault-qa.mjs'],['content','c7-content-current.mjs'],['state','c7-state-current.mjs'],['suspension','c7-render-suspension.mjs'],['navigation','check-navigation.mjs'],['interactions','interactions.mjs']].filter(([name])=>!process.env.QA_SUITES||process.env.QA_SUITES.split(',').includes(name))
const runs=[]
for(const[name,file]of suites){
 const folder=root+'/'+name;await mkdir(folder,{recursive:true});const fd=openSync(folder+'/run.log','w')
 const start=new Date().toISOString()
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,['scripts/'+file],{stdio:['ignore',fd,fd],env:{...process.env,QA_OUTPUT:folder,QA_GPU:'metal',QA_BASE_URL:'http://127.0.0.1:3007',QA_ROUTES:'/c7/'}});child.on('exit',resolve)})
 closeSync(fd);runs.push({name,start,end:new Date().toISOString(),code});await writeFile(root+'/results.json',JSON.stringify({build,runs},null,2));console.log(name+': '+code)
}
if(runs.some(r=>r.code!==0))process.exitCode=1
