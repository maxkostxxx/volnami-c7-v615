import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {verifiedBuild} from './c7-qa-build.mjs';
const out=process.env.QA_OUTPUT, base=process.env.QA_BASE_URL;
if(!out||!base)throw Error('QA_OUTPUT and QA_BASE_URL required');
await mkdir(out,{recursive:false});
const build=await verifiedBuild(base),errors=[];
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
let result;
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/c7/?c7-debug');
  await page.locator('.c7-landscape.is-ready').waitFor({timeout:45000});
  result=await page.evaluate(async()=>{
    const read=()=>JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug);
    const initial=read(),start=performance.now();let stalls=0;
    // Controlled main-thread delays expose clock truncation. This is a
    // semantic elapsed-time test, explicitly not a performance measurement.
    const timer=setInterval(()=>{const end=performance.now()+240;while(performance.now()<end){}stalls++;},400);
    await new Promise(resolve=>setTimeout(resolve,5000));clearInterval(timer);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const end=performance.now(),final=read();
    return {wallSeconds:(end-start)/1000,ambientSeconds:final.time-initial.time,
      ratio:(final.time-initial.time)/((end-start)/1000),stalls,
      visible:document.visibilityState==='visible',initial,final};
  });
}finally{await browser.close();}
const pass=errors.length===0&&result?.visible&&result.stalls>=10&&Math.abs(result.ratio-1)<.08;
await writeFile(out+'/results.json',JSON.stringify({build,method:'Actual production clock during 5s visible execution with injected240ms main-thread stalls every400ms. Not FPS, GPU time or device acceptance.',pass,errors,...result},null,2));
console.log({pass,errors,wallSeconds:result.wallSeconds,ambientSeconds:result.ambientSeconds,ratio:result.ratio,stalls:result.stalls});
if(!pass)process.exitCode=1;
