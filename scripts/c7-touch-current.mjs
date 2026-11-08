import {chromium} from 'playwright';
import {verifiedBuild} from './c7-qa-build.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:3098',out=process.env.QA_OUTPUT;
if(!out)throw Error('QA_OUTPUT required');
await mkdir(out,{recursive:true});const build=await verifiedBuild(base),runs=[];
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{for(const [width,height] of [[390,844],[430,932]]){
 const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor({timeout:30000});await p.evaluate(()=>document.fonts.ready);
 await p.locator('.c7-menu-button').tap();assert.equal(await p.locator('.c7-menu').getAttribute('role'),'dialog');
 await p.locator('.c7-menu a[href="#cases"]').tap();await p.waitForFunction(()=>document.activeElement?.id==='cases');
 await p.locator('.c7-case-open').tap();await p.waitForURL('**/c7/case/miratorg-extra-meat/');assert.equal(await p.locator('h1').innerText(),'Extra Meat');
 await p.locator('.c7-project-footer a[href="/c7/#cases"]').tap();await p.waitForURL('**/c7/#cases');await p.locator('.c7-landscape.is-ready').waitFor({timeout:30000});await p.waitForFunction(()=>document.activeElement?.id==='cases');
 await p.locator('.c7-menu-button').tap();await p.locator('.c7-menu a[href="#testimonials"]').tap();await p.waitForFunction(()=>document.activeElement?.id==='testimonials');
 const rail=p.locator('.c7-quotes');await rail.evaluate(e=>{scrollTo({top:scrollY+e.getBoundingClientRect().top-140,behavior:'instant'});e.scrollTo({left:0,behavior:'instant'});});await p.waitForTimeout(200);
 const before=await rail.evaluate(e=>({left:e.scrollLeft,top:scrollY})),r=await rail.boundingBox(),cdp=await c.newCDPSession(p);
 // Chromium synthesizes a real touch scroll sequence in the headless browser.
 // This deliberately does not claim physical iOS/Android or native touch hardware.
 await cdp.send('Input.synthesizeScrollGesture',{x:Math.round(width*.8),y:Math.round(Math.min(height-100,r.y+150)),xDistance:-Math.round(width*.65),yDistance:0,gestureSourceType:'touch',speed:500});
 await p.waitForTimeout(500);const after=await rail.evaluate(e=>({left:e.scrollLeft,top:scrollY,max:e.scrollWidth-e.clientWidth}));
 assert.ok(after.left>before.left+50,'horizontal touch did not move reviews');assert.ok(Math.abs(after.top-before.top)<3,'horizontal swipe moved page');
 await p.screenshot({path:out+'/'+width+'-reviews.png'});
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1);assert.equal(errors.length,0);
 runs.push({width,height,before,after,overflow,errors,checks:['tap menu/navigation','tap Extra Meat/return focus','CDP touch review swipe/no vertical jump']});console.log(width,'PASS');await c.close();
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({build,kind:'Headless Chromium, emulated touch and viewport. No physical phones; no native screen-reader claim.',runs},null,2));}
