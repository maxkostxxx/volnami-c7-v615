import {verifiedBuild} from './c7-qa-build.mjs'
import {chromium} from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007';await mkdir(output,{recursive:true})
const build=await verifiedBuild(base)
for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[]
try{for(const[width,height]of[[390,844],[1440,900]]){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',hasTouch:width===390}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
 for(const state of['main','menu','form-errors','extra-meat']){
  if(state==='menu')await page.locator('.c7-menu-button').click()
  if(state==='form-errors'){await page.keyboard.press('Escape');await page.locator('.c7-brief-form button[type=submit]').click()}
  if(state==='extra-meat'){await page.locator('.c7-case-open').click();await page.waitForURL('**/c7/case/miratorg-extra-meat/')}
  // Canvas-backed text needs the independent raster audit: axe cannot infer
  // the current 3D pixels behind offscreen targets when inspecting the page.
  // Keep the original failed run; this run makes no contrast acceptance claim.
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).disableRules(['color-contrast']).analyze()
  const semantic=await page.evaluate(()=>({h1:document.querySelectorAll('h1').length,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(e=>({level:+e.tagName[1],text:e.textContent.trim()})),missingAlt:[...document.images].filter(e=>!e.hasAttribute('alt')).map(e=>e.src),overflow:document.documentElement.scrollWidth-innerWidth}))
  runs.push({width,height,state,violations:result.violations,incomplete:result.incomplete.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),passes:result.passes.map(v=>v.id),semantic,errors:[...errors]})
  assert.equal(result.violations.length,0,state+' axe violations');assert.equal(semantic.h1,1);assert.equal(semantic.missingAlt.length,0);assert.ok(semantic.overflow<=1);assert.equal(errors.length,0)
  console.log(width+' '+state+' axe PASS; incomplete='+result.incomplete.length)
 }
 await context.close()
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,note:'Automated Chromium axe/semantic checks, color-contrast deliberately excluded and still requires independent raster measurement. Original color-contrast findings are preserved in shared-site-v398-accessibility. No native screen-reader or physical touch claim.',runs},null,2))}
