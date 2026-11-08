#!/usr/bin/env node
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007';await mkdir(output,{recursive:true})
const build=await(await fetch(base+'/c7-build.json')).json()
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error('Stale export '+file)
const phases=(process.env.QA_PHASES??'0,.08,.16,.30,.47,.66,.79,.81,.83,.86,.9,.93,1').split(',').map(Number)
const sizes=[['small',320,700],['phone',390,844],['largephone',430,932],['tablet',768,1024],['desktop',1440,900],['fullhd',1920,1080],['wide',2560,1080],['large',2560,1440]].filter(([n])=>!process.env.QA_SIZES||process.env.QA_SIZES.split(',').includes(n))
const browser=await chromium.launch({headless:true,args:process.env.QA_GPU==='metal'?['--use-angle=metal']:[]}),runs=[];let failed=false
try{for(const [name,width,height]of sizes){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto(base+'/c7/?c7-debug'+(process.env.QA_QUALITY?'&c7-quality='+process.env.QA_QUALITY:''),{waitUntil:'domcontentloaded'})
 await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await page.evaluate(()=>document.fonts.ready)
 for(const phase of phases){
  await page.evaluate(p=>{const max=document.documentElement.scrollHeight-innerHeight;const anchors=[['hero',0],['about',.16],['process',.30],['services',.47],['cases',.66],['testimonials',.83],['contacts',.93]].map(([id,p])=>[Math.min(max,document.getElementById(id).offsetTop),p]);anchors.push([max,1]);let y=max;for(let i=0;i<anchors.length-1;i++)if(p<=anchors[i+1][1]){const a=anchors[i],b=anchors[i+1];y=a[0]+(b[0]-a[0])*(p-a[1])/(b[1]-a[1]);break}scrollTo({top:y,behavior:'instant'})},phase)
  await page.waitForTimeout(350)
  const state=await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug)),overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
  if(Math.abs(state.exactProgress-phase)>.001||Math.abs(state.exactProgress-state.smoothProgress)>.002||overflow>1)failed=true
  const stem=`${name}-p${Math.round(phase*1000)}`
  if(!process.env.QA_DOM_PHASES||process.env.QA_DOM_PHASES.split(',').map(Number).includes(phase))await page.screenshot({path:`${output}/${stem}-dom.jpg`,type:'jpeg',quality:78})
  let rawState=null
  if(process.env.QA_RAW!=='0'&&(!process.env.QA_RAW_PHASES||process.env.QA_RAW_PHASES.split(',').map(Number).includes(phase))){
   const style=await page.addStyleTag({content:'.c7 > :not(.c7-landscape){visibility:hidden!important}.c7-landscape-fallback,.c7-landscape::after{display:none!important}'})
   await page.evaluate(()=>dispatchEvent(new Event('scroll')));await page.waitForTimeout(100)
   rawState=await page.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug))
   if(rawState.renderSuspended||rawState.version!=='shared-v395'||Math.abs(rawState.travel-phase)>.002)failed=true
   await page.screenshot({path:`${output}/${stem}-raw.jpg`,type:'jpeg',quality:78});await style.evaluate(e=>e.remove());await page.evaluate(()=>dispatchEvent(new Event('scroll')))
  }
  runs.push({name,width,height,phase,state,rawState,overflow,errors:[...errors]})
 }
 console.log(name+': '+phases.length+' poses, errors='+errors.length);if(errors.length)failed=true;await context.close()
}}finally{await browser.close();await writeFile(output+'/manifest.json',JSON.stringify({build,kind:'Viewport emulation; frozen ambient; actual semantic anchors; not physical-device acceptance',runs},null,2))}
if(failed)process.exitCode=1
