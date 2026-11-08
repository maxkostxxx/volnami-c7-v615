// Local preview only: replace byte-identical exported public copies with file
// symlinks to their originals. Next15 removes out/ before exporting again.
// This never changes public/ and is not a portable/deployment artifact.
import{readdir,readFile,lstat,symlink,rename,writeFile}from'node:fs/promises'
import{createHash}from'node:crypto';import path from'node:path'
const root=process.cwd(),files=[];const hash=b=>createHash('sha256').update(b).digest('hex')
async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await visit(p);else if(e.isFile()){const rel=path.relative(path.join(root,'public'),p),target=path.join(root,'out',rel);let stat;try{stat=await lstat(target)}catch{continue}if(!stat.isFile())continue;const a=hash(await readFile(p)),b=hash(await readFile(target));if(a!==b)throw new Error('Export differs from public: '+rel);files.push({rel,p,target,size:stat.size,sha256:a})}}}
await visit(path.join(root,'public'));files.sort((a,b)=>b.size-a.size)
for(const f of files){const temp=f.target+'.c7-local-link';await symlink(path.relative(path.dirname(f.target),f.p),temp);await rename(temp,f.target)}
await writeFile('out/c7-local-assets.json',JSON.stringify({kind:'Local preview links only; not a portable export',linkedBytes:files.reduce((s,f)=>s+f.size,0),files:files.map(({rel,size,sha256})=>({rel,size,sha256}))},null,2));console.log('Linked identical local assets:',files.length,'logical bytes:',files.reduce((s,f)=>s+f.size,0))
