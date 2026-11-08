import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3037';
assert.ok(output);await mkdir(output,{recursive:true});
const build=await(await fetch(base+'/c7-build.json')).json();
for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h,'stale '+f);
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[],errors=[];
try{for(const width of [320,390,430,768,980,1440,2560]){
 const page=await browser.newPage({viewport:{width,height:width<720?844:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:30000});
 const rail=page.locator('.c7-process ol'),items=rail.locator('li');await rail.scrollIntoViewIfNeeded();await rail.focus();
 const initial=await rail.evaluate(e=>({left:e.scrollLeft,width:e.clientWidth,full:e.scrollWidth,focus:e===document.activeElement,items:[...e.children].map(n=>({title:n.querySelector('h3').textContent,top:n.offsetTop,left:n.offsetLeft,width:n.clientWidth,arrow:getComputedStyle(n,'::after').transform}))}));
 assert.equal(initial.items.length,4);assert.ok(initial.focus);assert.ok(initial.items.every(n=>Math.abs(n.top-initial.items[0].top)<1));
 let keyboard=null;
 if(width<=980){
  assert.ok(initial.full>initial.width);
  for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight',{delay:25});
  await page.waitForTimeout(350);const right=await rail.evaluate(e=>e.scrollLeft);assert.ok(right>40,'ArrowRight must move the rail');
  for(let i=0;i<10;i++)await page.keyboard.press('ArrowLeft',{delay:25});
  await page.waitForTimeout(350);const left=await rail.evaluate(e=>e.scrollLeft);assert.ok(left<right,'ArrowLeft must move back');keyboard={right,left};
 }
 const steps=[];
 for(let i=0;i<4;i++){
  await items.nth(i).scrollIntoViewIfNeeded();await page.waitForTimeout(150);
  const step=await items.nth(i).evaluate(e=>{const rail=e.parentElement.getBoundingClientRect(),rect=e.getBoundingClientRect();return{rect:rect.toJSON(),rail:rail.toJSON(),text:[...e.querySelectorAll('h3,p')].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON(),client:n.clientWidth,scroll:n.scrollWidth})),left:e.parentElement.scrollLeft}});
  assert.ok(step.rail.left>=0&&step.rail.right<=width,'rail extends past viewport');
  for(const t of step.text){assert.ok(t.scroll<=t.client+1,'text overflow');assert.ok(t.rect.left>=step.rail.left-1&&t.rect.right<=step.rail.right+1,'step text is clipped horizontally');assert.ok(t.rect.left>=0&&t.rect.right<=width,'text outside actual viewport');}
  steps.push(step);
  if(width===390&&(i===0||i===3))await page.screenshot({path:output+'/390-step-'+i+'.jpg',type:'jpeg',quality:85});
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 runs.push({width,initial,keyboard,steps});await page.close();console.log(width+' rail PASS');
}assert.equal(errors.length,0)}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,method:'Emulated desktop viewports; real browser keyboard horizontal scroll; all four steps tested individually. Not a physical touch-device test.',runs,errors},null,2));}
