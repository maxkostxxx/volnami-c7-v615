import {chromium} from 'playwright';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const out='evidence/shared-site-v500-host-upload',privateDir=path.join(os.homedir(),'.config/volnami-c7-preview'),receipt=path.join(privateDir,'ghostdisk-v500.json');
try{await fs.access(receipt);throw Error('Existing deployment receipt: inspect instead of creating another site');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(out);await fs.mkdir(privateDir,{recursive:true,mode:0o700});
const b=await chromium.launch({headless:true}),p=await b.newPage();let result,secretSave,started=false;
try{
 p.on('response',response=>{
  if(response.url()==='https://ghostdisk.net/api/upload/start'&&response.ok())started=true;
  if(response.url()==='https://ghostdisk.net/api/upload/finish'&&response.ok())secretSave=(async()=>{const data=await response.json();await fs.writeFile(receipt,JSON.stringify({created:new Date().toISOString(),package:'c7-preview-2026-10-27-v500',...data},null,2),{mode:0o600});result={saved:true,fields:Object.keys(data),url:data.url??data.site_url??data.public_url,expires:data.expires_at??data.expiresAt,receipt};})();
 });
 await p.goto('https://ghostdisk.net/',{waitUntil:'domcontentloaded',timeout:30000});
 await p.locator('#fileInput').setInputFiles(path.resolve('artifacts/c7-preview-2026-10-27-v500.zip'));
 await p.locator('#deployBtn').click();
 const start=Date.now();let previous='';
 while(Date.now()-start<120000&&!result){
  const status=(await p.locator('#status').innerText()).trim();
  if(status!==previous){console.log(status.replace(/ticket=[^&\s]+/g,'ticket=[redacted]'));previous=status;}
  if(await p.locator('#status.err').count())break;
  await p.waitForTimeout(1000);
 }
 if(secretSave)await secretSave;
 if(!result){result={saved:false,started,status:await p.locator('#status').innerText(),note:'Only normal upload controls used; no challenge interaction, no bypass.'};await p.screenshot({path:out+'/blocked.png'});}
 await fs.writeFile(out+'/result.json',JSON.stringify(result,null,2));console.log(result);
}finally{if(secretSave)await secretSave;await b.close();}
