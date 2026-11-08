import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {verifiedBuild} from './c7-qa-build.mjs';
const out=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL;
if(!out||!base)throw Error('QA_OUTPUT and QA_BASE_URL required');
await mkdir(out);const build=await verifiedBuild(base),errors=[],samples=[];
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
let motion,pass=false;
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:45000});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>{const c=document.querySelector('.c7-landscape canvas');return c&&Number(getComputedStyle(c).opacity)===1&&Number(getComputedStyle(c.parentElement).opacity)===1;});
 await page.waitForTimeout(900); // Exclude the 650ms initial fade from motion evidence.
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const regions={sky:{left:40,top:80,width:300,height:230},water:{left:430,top:650,width:580,height:110}};
 let initialPixels,start=Date.now();
 for(const elapsed of[0,60000,120000,180000]) {
  // Actual elapsed wall time, not a jump of the scene's test clock.
  if(elapsed)await page.waitForTimeout(Math.max(0,start+elapsed-Date.now()));
  const state=await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug));
  const shot=await page.screenshot();await sharp(shot).jpeg({quality:86}).toFile(out+'/'+elapsed/1000+'s.jpg');
  const pixels=Object.fromEntries(await Promise.all(Object.entries(regions).map(async([k,region])=>[k,await sharp(shot).extract(region).removeAlpha().raw().toBuffer()])));
  initialPixels??=pixels;
  const differences=Object.fromEntries(Object.entries(pixels).map(([k,b])=>{let sum=0,changed=0;for(let i=0;i<b.length;i++){const d=Math.abs(b[i]-initialPixels[k][i]);sum+=d;if(d)changed++;}return[k,{changedChannels:changed,totalChannels:b.length,meanAbsolute:sum/b.length}];}));
  samples.push({elapsedWall:(Date.now()-start)/1000,state,differences});
  await writeFile(out+'/results.json',JSON.stringify({build,complete:false,errors,samples},null,2));
  console.log({elapsed:elapsed/1000,ambient:state.time,frames:state.frames,differences});
 }
 motion=await page.evaluate(async()=>{
  const read=()=>JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug),rows=[];
  const destination=document.getElementById('process').offsetTop;let start;
  await new Promise(resolve=>requestAnimationFrame(function tick(t){start??=t;const f=Math.min(1,(t-start)/5000);scrollTo({top:destination*f,behavior:'instant'});if(rows.length<=Math.floor(f*10))rows.push({wall:t,state:read()});if(f<1)requestAnimationFrame(tick);else resolve();}));return rows;
 });
 const first=samples[0],last=samples.at(-1),clockRatio=(last.state.time-first.state.time)/(last.elapsedWall-first.elapsedWall);
 pass=errors.length===0&&Math.abs(clockRatio-1)<.05&&last.differences.sky.changedChannels>0&&last.differences.water.changedChannels>0&&samples.every(x=>!x.state.renderSuspended&&x.state.solar===first.state.solar)&&motion.at(-1).state.solar>motion[0].state.solar+.2&&motion.at(-1).state.time>motion[0].state.time+4;
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({build,complete:true,pass,method:'180s actual wall time in a headless browser with document.visibilityState=visible, after initial fade settles; four ordinary DOM screenshots and fixed sky/water crops, followed by 5s scripted document scroll. Pixel changes establish motion only, not visual equivalence/quality or physical-device performance.',errors,samples,motion},null,2));}
if(!pass)process.exitCode=1;
