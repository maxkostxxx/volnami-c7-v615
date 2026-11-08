import {verifiedBuild} from './c7-qa-build.mjs'
import {chromium} from 'playwright'
import sharp from 'sharp'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007',extra=process.env.QA_EXTRA==='1',topInset=extra?0:90;await mkdir(output,{recursive:true})
const runtimeOverride=process.env.QA_RUNTIME_CANDIDATE??null;
const extraCss=process.env.QA_EXTRA_CSS?await readFile(process.env.QA_EXTRA_CSS,'utf8'):null;
const overrideSources=runtimeOverride?Object.fromEntries(await Promise.all((process.env.QA_OVERRIDE_FILES??'world.js,atmosphere.js').split(',').map(async name=>[name,await readFile(runtimeOverride+'/'+name,'utf8')]))):null;
const build=await verifiedBuild(base)
for(const[f,h]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(f)).digest('hex')!==h)throw new Error('Stale export '+f)
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4
const luminance=c=>.2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2])
const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05)
const requestedWidths=(process.env.QA_WIDTHS??'390,1440').split(',').map(s=>s.trim())
const supportedViewports=[[320,700],[390,844],[430,932],[768,1024],[1440,900],[1920,1080],[2560,1080],[2560,1440]]
if(requestedWidths.some(w=>!supportedViewports.some(([width])=>String(width)===w)))throw Error('QA_WIDTHS requires supported bare widths, for example 390,1440; empty/unknown selections must not pass')
const viewports=supportedViewports.filter(([w])=>requestedWidths.includes(String(w)))
if(!viewports.length)throw Error('No viewports selected for contrast QA')
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[];let failed=false
try{for(const[width,height]of viewports){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],readings=new Map()
 page.on('pageerror',e=>errors.push(e.message));
 if(overrideSources)for(const[name,source]of Object.entries(overrideSources))await page.route('**/3d/c7/runtime-v395/'+name,r=>r.fulfill({status:200,contentType:'application/javascript',body:source.replace(/(['"])three\1/g,"'./vendor/three/three.module.js'")}));
 await page.goto(base+(extra?'/c7/case/miratorg-extra-meat/':'/c7/?c7-debug'));if(!extra)await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000});if(extraCss)await page.addStyleTag({content:extraCss});await page.evaluate(()=>document.fonts.ready)
 if(!extra)await page.locator('.c7-brief-form button[type=submit]').click()
 const wrap=()=>page.evaluate(()=>{
  window.__qaInkId??=0
  const walker=document.createTreeWalker(document.querySelector('.c7'),NodeFilter.SHOW_TEXT),nodes=[]
  while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(n.textContent.trim()&&!p.closest('script,style,textarea,c7-qa-ink')&&p.tagName!=='INPUT')nodes.push(n)}
  for(const n of nodes){const el=document.createElement('c7-qa-ink');el.dataset.qaInk=String(++window.__qaInkId);n.replaceWith(el);el.append(n)}
  for(const el of document.querySelectorAll('input,textarea'))el.dataset.qaInk??=String(++window.__qaInkId)
 })
 await wrap()
 const pixels=async()=>sharp(await page.screenshot()).removeAlpha().raw().toBuffer()
 const snapshot=async(label)=>{
  await page.waitForTimeout(90)
  const nodes=await page.locator('[data-qa-ink]').evaluateAll((ns,topInset)=>ns.map(n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return{id:n.dataset.qaInk,text:(n.value??n.textContent).trim().slice(0,120),rect:r.toJSON(),color:c.color,size:parseFloat(c.fontSize),weight:parseFloat(c.fontWeight),hidden:!!n.closest('[aria-hidden=true]'),parent:n.parentElement.tagName,section:n.closest('section')?.id}}).filter(n=>n.text&&n.rect.bottom>topInset&&n.rect.top<innerHeight&&n.rect.right>0&&n.rect.left<innerWidth),topInset)
  const measure=async color=>{const st=await page.addStyleTag({content:`[data-qa-ink]{color:${color}!important;caret-color:transparent!important}`});const image=await pixels();await st.evaluate(e=>e.remove());return image}
  const hidden=await measure('transparent'),white=await measure('white'),black=await measure('black')
  let bad=false
  for(const n of nodes){const color=n.color.match(/[\d.]+/g).map(Number),alpha=color[3]??1,large=n.size>=24||(n.size>=18.66&&n.weight>=700),icon=/^[→←↓↑↗↘]+$/.test(n.text),target=icon||large?3:4.5;let min=Infinity,count=0,under=0
   for(let y=Math.max(topInset,Math.ceil(n.rect.top));y<Math.min(height,Math.floor(n.rect.bottom));y++)for(let x=Math.max(0,Math.ceil(n.rect.left));x<Math.min(width,Math.floor(n.rect.right));x++){
    const i=(y*width+x)*3;if(Math.min(white[i]-black[i],white[i+1]-black[i+1],white[i+2]-black[i+2])<210)continue
    const bg=[hidden[i],hidden[i+1],hidden[i+2]],fg=color.slice(0,3).map((v,k)=>v*alpha+bg[k]*(1-alpha)),v=ratio(luminance(bg),luminance(fg));count++;min=Math.min(min,v);if(v<target)under++
   }
   if(!count)continue
   const previous=readings.get(n.id);if(!previous||min<previous.min)readings.set(n.id,{...n,min,target,pixels:count,under,label})
   if(under){failed=true;bad=true}
  }
  if(bad)await page.screenshot({path:`${output}/${width}x${height}-${label}-failure.jpg`,type:'jpeg',quality:80})
 }
 const max=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight),positions=[];for(let y=0;y<max;y+=height*.55)positions.push(y);positions.push(max)
 for(let i=0;i<positions.length;i++){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),positions[i]);await snapshot('scroll-'+i)}
 // Input values are local test data; no submission or external communication.
 for(const [selector,value]of(extra?[]:[['input[name=name]','Проверка'],['input[name=contact]','test@example.invalid'],['textarea[name=project]','Локальная проверка контраста'],['input[name=timing]','Тест']])){
  const field=page.locator(selector);await field.fill(value);await wrap();await field.scrollIntoViewIfNeeded();await snapshot('field-'+selector.match(/name=([^\]]+)/)[1])
 }
 if(errors.length)failed=true
 runs.push({width,height,positions:positions.length,readings:[...readings.values()],errors});await context.close();console.log(width+'x'+height+': text runs='+readings.size+' failures='+[...readings.values()].filter(r=>r.under).length)
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,runtimeOverride,extraCss,overrideHashes:overrideSources&&Object.fromEntries(Object.entries(overrideSources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')])),method:'Direct text nodes wrapped with inline custom elements for independent white/black core-glyph masking. Actual alpha/colors over measured backdrop, all visible core pixels. Frozen ambient, full-page overlapping scroll samples. Not native assistive testing.',runs},null,2))}
if(failed||runs.length!==viewports.length)process.exitCode=1
