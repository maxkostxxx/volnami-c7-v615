import {chromium} from 'playwright'
import {site} from '../content/site.ts'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007';await mkdir(output,{recursive:true})
const build=await(await fetch(base+'/c7-build.json')).json()
for(const[file,sha]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),sha)
const sizes=[[320,700],[390,844],[430,932],[768,1024],[1440,900],[1920,1080],[2560,1080],[2560,1440]]
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[]
const normal=s=>s.replace(/\s+/g,' ').trim()
const extra=site.cases.list.find(c=>c.slug==='miratorg-extra-meat')
const blockText=b=>b.kind==='lead'?[b.text]:b.kind==='group'?[b.title,...b.blocks.flatMap(blockText)]:[b.heading,...b.paragraphs??[],...b.items??[],...(b.subsections??[]).flatMap(s=>[s.heading,s.text])]
try{for(const [width,height]of sizes){const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await c.newPage(),errors=[]
 p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
 assert.equal(await p.locator('.c7-case').count(),8);assert.equal(await p.locator('.c7-service-list>article').count(),site.services.list.length)
 const text=normal(await p.locator('.c7').innerText())
 for(const item of site.services.list)for(const value of[item.title,item.lead,...item.items,item.closing])assert.ok(text.includes(normal(value)),value)
 for(const quote of site.testimonials.list)for(const value of[quote.name,...quote.paragraphs])assert.ok(text.includes(normal(value)),value)
 const cardData=[]
 for(let i=0;i<8;i++){const card=p.locator('.c7-case').nth(i);await card.scrollIntoViewIfNeeded();await p.waitForTimeout(60);const d=await card.evaluate(e=>{const r=e.getBoundingClientRect(),t=e.querySelector('p'),im=e.querySelector('img');return{title:e.querySelector('h3').textContent,top:r.top,bottom:r.bottom,textBottom:t?.getBoundingClientRect().bottom,textHeight:t?.clientHeight,textScroll:t?.scrollHeight,image:im?{src:im.getAttribute('src'),natural:[im.naturalWidth,im.naturalHeight],fit:getComputedStyle(im).objectFit}:null}});if(d.textBottom)assert.ok(d.textBottom<=d.bottom+1,'clipped card '+i);if(d.image)await card.locator('img').evaluate(im=>im.decode());cardData.push(d)}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await p.locator('.c7-quotes').scrollIntoViewIfNeeded();await p.locator('.c7-quotes').focus();await p.keyboard.press('End');await p.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Следующий отзыв')?.getAttribute('aria-disabled')==='true',null,{timeout:5000});await p.keyboard.press('Home');assert.ok(await p.locator('.c7-quotes').evaluate(e=>e.scrollLeft<2))
 await p.locator('.c7-case-open').focus();await p.keyboard.press('Enter');await p.waitForURL('**/c7/case/miratorg-extra-meat/')
 assert.equal(await p.locator('h1').innerText(),'Extra Meat');const caseText=normal(await p.locator('main').innerText());for(const value of extra.blocks.flatMap(blockText))assert.ok(caseText.includes(normal(value)),value)
 const images=p.locator('.c7-project-cover img,.c7-project-gallery img');assert.equal(await images.count(),5)
 for(const im of await images.all()){await im.scrollIntoViewIfNeeded();await im.evaluate(i=>i.decode());assert.ok(await im.evaluate(i=>{const r=i.getBoundingClientRect();return getComputedStyle(i).objectFit==='contain'||Math.abs((r.width/r.height)/(i.naturalWidth/i.naturalHeight)-1)<.005}),'image aspect distortion')}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await p.locator('.c7-project-footer a[href="/c7/#cases"]').click();await p.waitForURL('**/c7/#cases');await p.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await p.waitForTimeout(200)
 const returned=await p.locator('#cases').evaluate(e=>({top:e.getBoundingClientRect().top,focused:document.activeElement===e}));assert.ok(returned.top>=0&&returned.top<110,'return position');assert.ok(returned.focused,'return focus')
 if([390,1440].includes(width))await p.locator('.c7-case-field').screenshot({path:`${output}/${width}-cards.jpg`,type:'jpeg',quality:76})
 assert.equal(errors.length,0);runs.push({width,height,cardData,returned,errors,checks:['4 service groups / 17 items; full text','4 reviews full text','8 cards; captions within bounds','5 Extra Meat originals; full story','keyboard rail Home/End','keyboard case entry; return focus/offset','no overflow']});await c.close();console.log(width+'×'+height+' PASS')
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,runs},null,2))}
