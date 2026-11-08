import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUTPUT??'evidence/shared-site-v437-delayed-font',base=process.env.QA_BASE_URL??'http://127.0.0.1:3037';
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),rows=[];
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'}),page=await context.newPage();
 await context.addInitScript(()=>{
  const old=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:old.call(this,type,...args);};
  window.fontLayoutShifts=[];
  new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)fontLayoutShifts.push(e.value);}).observe({type:'layout-shift',buffered:true});
 });
 await page.route('**/*.woff2',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue();});
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 await page.goto(base+'/c7/',{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.waitForTimeout(250);
 const info=async()=>{
  const {root}=await cdp.send('DOM.getDocument');const fonts={};
  for(const selector of ['#c7-hero-title span','.c7-hero-copy p']){
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
   if(!nodeId)throw Error('Missing selector '+selector);
   fonts[selector]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;
  }
  return{fonts,dom:await page.evaluate(()=>({loaded:[...document.fonts].map(f=>({family:f.family,status:f.status})),y:scrollY,overflow:document.documentElement.scrollWidth-innerWidth,cls:fontLayoutShifts.reduce((a,b)=>a+b,0)}))};
 };
 const before=await info();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);const after=await info();
 await page.screenshot({path:out+'/'+width+'-loaded.jpg',type:'jpeg',quality:84});
 rows.push({width,before,after,brandFacesUsed:Object.values(after.fonts).every(fonts=>fonts.length>0&&fonts.every(f=>f.isCustomFont))});
 await context.close();console.log({width,brandFacesUsed:rows.at(-1).brandFacesUsed,fonts:after.fonts});
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({kind:'Font transfers delayed 1800ms; rendered fonts inspected with Chromium CSS.getPlatformFontsForNode. WebGL disabled to isolate typography; no physical-device claim.',rows},null,2));}
if(rows.some(r=>!r.brandFacesUsed))process.exitCode=1;
