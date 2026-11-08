// Native Chromium browser zoom, driven by a temporary isolated extension.
// Uses the browser's automatic zoom, never CSS zoom or viewport/page-scale emulation.
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const output=process.env.QA_OUTPUT;if(!output)throw new Error('QA_OUTPUT required')
await mkdir(output,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'))
for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const extension=resolve(output,'qa-extension');await mkdir(extension)
await writeFile(extension+'/manifest.json',JSON.stringify({manifest_version:3,name:'C7 local browser QA',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}))
await writeFile(extension+'/worker.js','chrome.runtime.onInstalled.addListener(() => {});')
const result={build,method:'Native visible Chromium, viewport:null and no DPR override. Isolated MV3 extension chrome.tabs.setZoom with automatic mode; no CSS zoom or page-scale emulation; Playwright focus override disabled for real tab visibility. Temporary profile is removed by Playwright.',sources:['https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom','https://playwright.dev/docs/chrome-extensions'],states:[],errors:[]}
let context
try{
 context=await chromium.launchPersistentContext('',{timeout:30000,headless:false,viewport:null,reducedMotion:'reduce',ignoreDefaultArgs:['--disable-extensions','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling'],args:['--use-angle=metal','--window-size=1480,1000',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]})
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:10000})
 const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>result.errors.push(e.message))
 const cdp=await context.newCDPSession(page)
 // Playwright normally forces focus/visibility even for inactive real tabs.
 // Disable that test override before measuring the browser's actual lifecycle.
 await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false})
 // Playwright's scale:'css' clip double-applies native browser zoom here.
 // Capture the native viewport without a CSS-derived clip or emulation.
 const capture=async name=>{
  const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:80,fromSurface:true,captureBeyondViewport:false})
  await writeFile(output+'/'+name+'.jpg',Buffer.from(shot.data,'base64'))
 }
 await page.goto('http://127.0.0.1:3007/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await page.evaluate(()=>document.fonts.ready)
 const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url?.includes('/c7/')).id})
 const zoom=async value=>worker.evaluate(async({tabId,value})=>{await chrome.tabs.setZoomSettings(tabId,{mode:'automatic',scope:'per-origin'});await chrome.tabs.setZoom(tabId,value);return {zoom:await chrome.tabs.getZoom(tabId),settings:await chrome.tabs.getZoomSettings(tabId)}},{tabId,value})
 const read=async label=>({label,...await page.evaluate(()=>({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],dpr:devicePixelRatio,visualScale:visualViewport.scale,overflow:document.documentElement.scrollWidth-innerWidth,rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom,focus:document.activeElement?.id,visibility:document.visibilityState,world:JSON.parse(document.querySelector('.c7-landscape')?.dataset.c7Debug??'null')}))})
 result.before=await read('100%');result.zoom=await zoom(2);await page.waitForTimeout(600);result.after=await read('200%')
 assert.equal(result.zoom.zoom,2);assert.equal(result.zoom.settings.mode,'automatic');assert.equal(result.after.outer[0],result.before.outer[0]);assert.ok(Math.abs(result.after.inner[0]/result.before.inner[0]-.5)<.01);assert.ok(Math.abs(result.after.dpr/result.before.dpr-2)<.01);assert.equal(result.after.visualScale,1)
 for(const id of['hero','about','process','services','cases','testimonials','contacts']){
  await page.locator('#'+id).evaluate(e=>e.scrollIntoView({behavior:'instant'}));await page.waitForTimeout(180)
  const state=await read(id);assert.ok(state.overflow<=1);result.states.push(state)
  if(['hero','process','contacts'].includes(id))await capture('native200-'+id)
 }
 await page.locator('.c7-menu-button').click();assert.equal(await page.locator('#c7-menu').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#c7-menu').count(),0);assert.equal(await page.locator('.c7-menu-button').evaluate(e=>e===document.activeElement),true)
 await page.locator('.c7-brief-form button[type=submit]').click();assert.equal(await page.locator('[aria-invalid=true]').count(),3);assert.equal(await page.locator('input[name=name]').evaluate(e=>e===document.activeElement),true);assert.ok((await read('errors')).overflow<=1)
 await page.locator('.c7-case-open').click();await page.waitForURL('**/c7/case/miratorg-extra-meat/');await page.evaluate(()=>document.fonts.ready)
 result.extra=await read('Extra Meat');assert.ok(result.extra.overflow<=1);result.extra.zoom=await worker.evaluate(id=>chrome.tabs.getZoom(id),tabId);assert.equal(result.extra.zoom,2)
 await capture('native200-extra')
 await page.locator('.c7-project-back').click();await page.waitForURL('**/c7/#cases');await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.activeElement.id),'cases')
 result.restoreZoom=await zoom(1);await page.waitForTimeout(200);result.restored=await read('restored');assert.equal(result.restored.dpr,result.before.dpr)
 // A real browser tab switch; record actual visibility, never synthesize the event.
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.locator('#process').evaluate(e=>e.scrollIntoView({behavior:'instant'}));await page.waitForTimeout(400)
 await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false})
 result.focusEmulationDisabled=true
 result.visibilityBefore=await read('before real tab switch')
 const secondId=await worker.evaluate(async()=> (await chrome.tabs.create({url:'about:blank',active:true})).id)
 await page.waitForTimeout(500);result.visibilityHidden=await read('another tab active')
 if(result.visibilityHidden.visibility==='hidden') {
  await page.evaluate(()=>{
   const a=document.getElementById('cases'),b=document.getElementById('testimonials')
   scrollTo({top:a.offsetTop+(b.offsetTop-a.offsetTop)*(.81-.66)/(.83-.66),behavior:'instant'})
   window.__nativeResumeFrames=[]
   document.addEventListener('visibilitychange',()=>{
    let left=2
    const sample=()=>{window.__nativeResumeFrames.push(JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug));if(--left)requestAnimationFrame(sample)}
    requestAnimationFrame(sample)
   },{once:true})
  })
  await page.waitForTimeout(500);result.hiddenAfterScroll=await read('hidden after actual scroll')
  assert.equal(result.hiddenAfterScroll.world.performance.renderCount,result.visibilityHidden.world.performance.renderCount)
 }
 await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),tabId);await page.waitForTimeout(300);result.visibilityRestored=await read('C7 tab active')
 await worker.evaluate(id=>chrome.tabs.remove(id),secondId)
 result.nativeVisibilityVerified=result.visibilityHidden.visibility==='hidden'&&result.visibilityRestored.visibility==='visible'
 if(result.nativeVisibilityVerified){
  result.resumeFrames=await page.evaluate(()=>window.__nativeResumeFrames)
  assert.equal(result.resumeFrames.length,2)
  for(const f of result.resumeFrames)for(const phase of[f.exactProgress,f.smoothProgress,f.photo.progress])assert.ok(Math.abs(phase-.81)<.002)
 }
 result.zoomPass=true;assert.equal(result.errors.length,0)
 console.log(JSON.stringify({zoom:result.zoom,dimensions:[result.before.inner,result.after.inner],dpr:[result.before.dpr,result.after.dpr],nativeVisibilityVerified:result.nativeVisibilityVerified,errors:result.errors}))
}catch(error){result.failure=String(error);process.exitCode=1;console.error(error)}finally{await context?.close();await writeFile(output+'/results.json',JSON.stringify(result,null,2))}
