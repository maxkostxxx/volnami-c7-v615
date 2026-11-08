import {chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/portrait-sunset-v409';await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[];
try{for(const[source,label]of[['lab/c7-scene/shared.html','base'],[process.env.QA_CANDIDATE??'lab/c7-snapshots/portrait-sunset-v409/shared.html','candidate']]){
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});await page.goto('http://127.0.0.1:3027/'+source+'?clean&freeze&quality=low');await page.waitForSelector('body.ready',{timeout:120000});
 for(const phase of[0,.65,.79,.83,.86,.9,.93,.96,1]){
 const result=await page.evaluate(async phase=>{const s=sceneLab,T=await import('three');s.set({sun:phase,move:phase,time:0});const direction=s.sunlight.position.clone().normalize(),point=direction.multiplyScalar(10000).add(s.camera.position).project(s.camera);return{sunNdc:point.toArray(),camera:s.camera.position.toArray(),target:s.state.target,waterOccluded:s.state.waterOccluded};},phase);
 runs.push({label,phase,...result});if([0,.83,.9,.96,1].includes(phase))await page.screenshot({path:out+'/'+label+'-'+phase+'.jpg',type:'jpeg',quality:85});
 }await page.close();
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Portrait framing study,390x844 emulation; visibility still requires terrain/DOM review.',runs},null,2));}console.log(runs.map(r=>({label:r.label,p:r.phase,x:r.sunNdc[0],y:r.sunNdc[1]})));
