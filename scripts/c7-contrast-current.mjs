import { chromium } from 'playwright'
import sharp from 'sharp'
import {writeFile,mkdir,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required');
const out=process.env.QA_OUTPUT;await mkdir(out,{recursive:true});
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3007';
const build=await(await fetch(base+'/c7-build.json')).json();
const candidateStyle=process.env.QA_STYLE_FILE?await readFile(process.env.QA_STYLE_FILE,'utf8'):null;
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error('Stale export '+file);
let failed=false;
const results=[];
const lin=x=>(x/=255)<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const lum=rgb=>.2126*lin(rgb[0])+.7152*lin(rgb[1])+.0722*lin(rgb[2]);
const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
const pixels=async p=>(await sharp(await p.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true}));
const browser=await chromium.launch({headless:true,args:process.env.QA_GPU==='metal'?['--use-angle=metal']:[]});
try {
for(const [w,h] of (process.env.QA_REFLOW==='1'?[[320,568],[195,422],[640,400],[720,450]]:[[320,700],[390,844],[430,932],[768,1024],[1440,900],[1920,1080],[2560,1080],[2560,1440]]).filter(([w])=>!process.env.QA_WIDTHS||process.env.QA_WIDTHS.split(',').includes(String(w)))) {
 const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/c7/?c7-debug',{waitUntil:'networkidle'});
 await page.locator('.c7-landscape.is-ready').waitFor(); await page.evaluate(()=>document.fonts.ready);
 if(candidateStyle)await page.addStyleTag({content:candidateStyle});
 for(const phase of (process.env.QA_PHASES?process.env.QA_PHASES.split(',').map(Number):process.env.QA_SCENE_TEXT==='1'?[.23,.26,.28,.3,.36,.42,.79,.83]:[0,.045,.08,.93])) {
  const selector=phase<.1?'.c7-hero h1,.c7-hero-copy>p':phase<.47?'.c7-process h2,.c7-process li>span,.c7-process h3,.c7-process li p':phase<.9?'.c7-testimonials h2,.c7-quotes li p':'.c7-contacts h2,.c7-contact-copy>p';
  await page.evaluate(p=>{let y;
    if(p<.1)y=document.getElementById('about').offsetTop*p/.16;
    else if(p<.3){const a=document.getElementById('about').offsetTop,b=document.getElementById('process').offsetTop;y=a+(b-a)*(p-.16)/.14}
    else if(p<.47){const a=document.getElementById('process').offsetTop,b=document.getElementById('services').offsetTop;y=a+(b-a)*(p-.3)/.17}
    else if(p<.9){const a=document.getElementById('cases').offsetTop,b=document.getElementById('testimonials').offsetTop;y=a+(b-a)*(p-.66)/.17}
    else y=document.getElementById('contacts').offsetTop-88;
    scrollTo({top:y,behavior:'instant'})},phase);
  await page.waitForTimeout(300);
  if(process.env.QA_SCREENSHOTS==='1')await page.screenshot({path:`${out}/${w}x${h}-p${phase}.jpg`,type:'jpeg',quality:76});
  const nodes=await page.locator(selector).evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n);return {tag:n.tagName,text:n.textContent.trim().slice(0,65),rect:n.getBoundingClientRect().toJSON(),color:c.color,shadow:c.textShadow,size:c.fontSize,weight:c.fontWeight}}));
  const hiddenStyle=await page.addStyleTag({content:`${selector}{color:transparent!important}`});
  const hidden=await pixels(page);await hiddenStyle.evaluate(n=>n.remove());
  const whiteStyle=await page.addStyleTag({content:`${selector}{color:rgb(255,255,255)!important}`});
  const white=await pixels(page);await whiteStyle.evaluate(n=>n.remove());
  const blackStyle=await page.addStyleTag({content:`${selector}{color:rgb(0,0,0)!important}`});
  const black=await pixels(page);await blackStyle.evaluate(n=>n.remove());
  const readings=[];
  for(const n of nodes){
   const c=n.color.match(/[\d.]+/g).map(Number),alpha=c[3]??1;
   const values=[];
   for(let y=Math.max(90,Math.ceil(n.rect.top));y<Math.min(h,Math.floor(n.rect.bottom));y++)for(let x=Math.max(0,Math.ceil(n.rect.left));x<Math.min(w,Math.floor(n.rect.right));x++){
    const i=(y*w+x)*3;
    // Independent mask selects core glyph pixels even where the original ink has poor contrast.
    if(Math.min(...[0,1,2].map(k=>white.data[i+k]-black.data[i+k]))<210)continue;
    const bg=[0,1,2].map(k=>hidden.data[i+k]);
    const fg=c.slice(0,3).map((v,k)=>v*alpha+bg[k]*(1-alpha));
    values.push(ratio(lum(bg),lum(fg)));
   }
   values.sort((a,b)=>a-b);
   const size=parseFloat(n.size),large=size>=24||(size>=18.66&&parseFloat(n.weight)>=700),target=large?3:4.5;
   readings.push({...n,pixels:values.length,min:values[0],p5:values[Math.floor(values.length*.05)],target,under:values.filter(v=>v<target).length});
  }
  const visible=readings.filter(r=>r.pixels>0);if(visible.some(r=>r.under>0)||errors.length)failed=true;
  results.push({w,h,phase,readings,errors});
  console.log(w,phase,readings.map(r=>`${r.tag}: p5=${r.p5?.toFixed(2)} min=${r.min?.toFixed(2)} below=${r.under}/${r.pixels}`).join('; '));
 }
 await context.close();
}
}finally{await browser.close();await writeFile(`${out}/contrast-independent.json`,JSON.stringify({build,candidateStyle,kind:'Emulation; all independently masked core glyph pixels, no p5 acceptance',results},null,2));}

if(failed)process.exitCode=1;
