import {verifiedBuild} from './c7-qa-build.mjs';
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const out=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007'
await mkdir(out,{recursive:true})
const build=await verifiedBuild(base)
const browser=await chromium.launch({headless:true,args:process.env.QA_GPU==='metal'?['--use-angle=metal']:[]}),runs=[]
try {
 for(const width of [320,390,1440]) {
  const context=await browser.newContext({viewport:{width,height:width===320?700:width===390?844:900},deviceScaleFactor:1,reducedMotion:'reduce'})
  const p=await context.newPage(),errors=[],outside=[]
  p.on('pageerror',e=>errors.push(e.message))
  await p.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();outside.push(route.request().url());return route.abort()})
  await p.goto(base+'/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
  await p.evaluate(()=>document.fonts.ready)
  const state=await p.locator('.c7-landscape').evaluate(e=>JSON.parse(e.dataset.c7Debug))
  assert.equal(state.version,'shared-v395');assert.ok(state.calls>0)
  const targets=await p.locator('.c7-header a,.c7-header button,.c7-footer a').evaluateAll(ns=>ns.map(n=>({name:n.getAttribute('aria-label')||n.textContent.trim(),...n.getBoundingClientRect().toJSON()})))
  for(const t of targets){assert.ok(t.width>=44-.1,t.name+' width '+t.width);assert.ok(t.height>=44-.1,t.name+' height '+t.height)}
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page overflow')
  assert.equal(await p.title(),'Volnami — стратегия, дизайн и digital')
  const menu=p.locator('.c7-menu-button');await menu.click()
  const links=p.locator('.c7-menu a');await links.last().focus();await p.keyboard.press('Tab')
  assert.equal(await p.evaluate(()=>document.activeElement.className),'c7-menu-close','focus trap')
  await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.className),'c7-menu-button','Escape return')
  await p.locator('.c7-header a[href="#brief"]').click();await p.waitForFunction(()=>document.activeElement?.id==='brief')
  for(const field of ['name','contact','project'])await p.locator(`[name="${field}"]`).fill('   ')
  await p.locator('.c7-brief-send button[type="submit"]').click()
  assert.equal(await p.locator('[aria-invalid="true"]').count(),3)
  assert.equal(await p.evaluate(()=>document.activeElement.name),'name')
  const values={name:'Локальная проверка',contact:'test@example.invalid',project:'Проверка формы без отправки',timing:'Не отправлять'}
  for(const [field,value]of Object.entries(values))await p.locator(`[name="${field}"]`).fill('  '+value+'  ')
  await p.locator('.c7-brief-send button[type="submit"]').click()
  const mailto=await p.locator('.c7-brief-draft a').getAttribute('href'),params=new URLSearchParams(mailto.split('?')[1])
  assert.equal(params.get('subject'),'Бриф с сайта Volnami — '+values.name)
  for(const value of Object.values(values))assert.ok(params.get('body').includes(value))
  const draft=await p.locator('.c7-brief-draft textarea').inputValue()
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('test permission denied')}}}))
  await p.getByRole('button',{name:'Скопировать текст'}).click()
  assert.match(await p.locator('.c7-brief-notice').innerText(),/Выдели текст/)
  await p.locator('.c7-brief-draft textarea').focus()
  assert.equal(await p.locator('.c7-brief-draft textarea').evaluate(e=>e.selectionEnd-e.selectionStart),draft.length)
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedDraft=text}}}))
  await p.getByRole('button',{name:'Скопировать текст'}).click()
  assert.equal(await p.evaluate(()=>window.__copiedDraft),draft)
  await p.locator('[name="project"]').fill('Изменённый локальный текст')
  assert.equal(await p.locator('.c7-brief-draft').count(),0,'stale draft remains')
  assert.equal(outside.length,0);assert.equal(errors.length,0)
  await p.screenshot({path:`${out}/${width}-brief.jpg`,type:'jpeg',quality:82})
  runs.push({width,targets,errors,outside,checks:['title','44px targets','no overflow','trap/Escape','brief focus','trim','draft encoding','mock clipboard denied/allowed','manual selection','draft invalidation'],clipboard:'API mocked; system clipboard untouched',delivery:'No mail client opened; no submission'})
  await context.close();console.log(width+': UI PASS')
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({build,runs},null,2))}
