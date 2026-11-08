import fs from 'node:fs/promises';import crypto from 'node:crypto';
const base=process.env.QA_BASE_URL,output=process.env.QA_OUTPUT;if(!base?.startsWith('https://')||!output)throw Error('HTTPS base and output required');
const manifest=JSON.parse(await fs.readFile(process.env.QA_PACKAGE_MANIFEST??'artifacts/c7-preview-2026-10-27-v500-manifest.json','utf8'));
await fs.mkdir(output,{recursive:true});const checks=[];
for(const item of manifest.files){
 const response=await fetch(base+'/'+item.file,{signal:AbortSignal.timeout(45000)});const body=Buffer.from(await response.arrayBuffer()),sha=crypto.createHash('sha256').update(body).digest('hex');
 const check={file:item.file,status:response.status,bytes:body.length,sha256:sha,exact:sha===item.sha256,contentType:response.headers.get('content-type'),contentEncoding:response.headers.get('content-encoding')};checks.push(check);
 if(!check.exact&&item.file.endsWith('.html'))await fs.writeFile(output+'/'+item.file.replaceAll('/','_'),body);
}
const receipt={checkedAt:new Date().toISOString(),base,package:process.env.QA_PACKAGE_MANIFEST??'c7-preview-2026-10-27-v500',checks,pass:checks.every(c=>c.status===200&&c.exact)};await fs.writeFile(output+'/results.json',JSON.stringify(receipt,null,2));console.log({total:checks.length,exact:checks.filter(c=>c.exact).length,failures:checks.filter(c=>!c.exact||c.status!==200),pass:receipt.pass});if(!receipt.pass)process.exitCode=1;
