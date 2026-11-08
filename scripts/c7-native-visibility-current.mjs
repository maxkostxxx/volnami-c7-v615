if (process.env.QA_ALLOW_VISIBLE_BROWSER !== '1') throw new Error('Visible browser QA is disabled: the user is working. Run headless checks; obtain explicit permission before a foreground test.');
// Real visible Chromium tab lifecycle, without a Playwright browser connection.
// Playwright is used only to locate its bundled executable; no focus/visibility overrides.
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const output=process.env.QA_OUTPUT;if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'));for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const profile=await mkdtemp(join(tmpdir(),'c7-native-lifecycle-')),delay=ms=>new Promise(r=>setTimeout(r,ms))
const child=spawn(chromium.executablePath(),['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--use-angle=metal','--window-size=1480,1000','about:blank'],{stdio:'ignore'})
const result={build,method:'Visible native Chromium executable, raw CDP for tab activation/evaluation only. No Playwright browser connection, no viewport/DPR/focus/visibility emulation, no synthetic visibilitychange.',errors:[]};let ws,id=0;const pending=new Map()
async function send(method,params={},sessionId){const requestId=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(method+' timeout'))},15000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}))})}
try{
 let port
 for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{}await delay(100)}
 assert.ok(port,'Chrome did not expose DevToolsActivePort')
 const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();result.browser=version.Browser
 ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}}else if(msg.method==='Runtime.exceptionThrown')result.errors.push(msg.params.exceptionDetails.text)})
 const targets=await send('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='page');assert.ok(target)
 const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})
 const page=(method,params={})=>send(method,params,sessionId)
 const evaluate=async expression=>{const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 await page('Runtime.enable');await page('Page.enable')
 await page('Page.addScriptToEvaluateOnNewDocument',{source:`window.__nativeTrace=[];const log=(kind,extra={})=>window.__nativeTrace.push({kind,t:performance.now(),visibility:document.visibilityState,y:scrollY,width:innerWidth,height:innerHeight,...extra});const nativeScroll=window.scrollTo;window.scrollTo=function(...args){log('scrollTo',{args,stack:new Error().stack});return nativeScroll.apply(this,args)};for(const type of ['resize','scroll','visibilitychange'])addEventListener(type,()=>log(type));`})
 await page('Page.navigate',{url:(process.env.QA_BASE_URL??'http://127.0.0.1:3037')+'/c7/?c7-debug'})
 for(let i=0;i<125;i++){if(await evaluate('Boolean(document.querySelector(".c7-landscape.is-ready"))'))break;if(i===124)throw new Error('World not ready');await delay(200)}
 await send('Target.activateTarget',{targetId:target.targetId})
 await evaluate('scrollTo({top:document.getElementById("process").offsetTop,behavior:"instant"})');await delay(1200)
 const read=()=>evaluate('({visibility:document.visibilityState,focus:document.hasFocus(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,scrollY,hostSize:[document.querySelector(".c7-landscape").clientWidth,document.querySelector(".c7-landscape").clientHeight],url:location.href,state:JSON.parse(document.querySelector(".c7-landscape").dataset.c7Debug)})')
 result.before=await read();assert.equal(result.before.visibility,'visible');assert.ok(result.before.state)
 result.window=await send('Browser.getWindowForTarget',{targetId:target.targetId})
 const second=await send('Target.createTarget',{url:'about:blank',newWindow:false,background:false});result.secondWindow=await send('Browser.getWindowForTarget',{targetId:second.targetId});assert.equal(result.window.windowId,result.secondWindow.windowId)
 await send('Target.activateTarget',{targetId:second.targetId});await delay(500);result.hiddenStart=await read();assert.equal(result.hiddenStart.visibility,'hidden','Actual inactive tab must be hidden')
 result.hiddenScroll=await evaluate(`(()=>{const a=document.getElementById('cases'),b=document.getElementById('testimonials');scrollTo({top:a.offsetTop+(b.offsetTop-a.offsetTop)*(.81-.66)/(.83-.66),behavior:'instant'});window.__nativeResumeFrames=[];const restored=()=>{if(document.visibilityState!=='visible')return;document.removeEventListener('visibilitychange',restored);let left=2;const sample=()=>{window.__nativeResumeFrames.push(JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug));if(--left)requestAnimationFrame(sample)};requestAnimationFrame(sample)};document.addEventListener('visibilitychange',restored);return {desired:a.offsetTop+(b.offsetTop-a.offsetTop)*(.81-.66)/(.83-.66),actual:scrollY,viewport:[innerWidth,innerHeight]}})()`)
 await delay(600);result.hiddenEnd=await read();assert.equal(result.hiddenEnd.state.frames,result.hiddenStart.state.frames)
 await send('Target.activateTarget',{targetId:target.targetId});await delay(400);result.resumed=await read();result.resumeFrames=await evaluate('window.__nativeResumeFrames');result.trace=await evaluate('window.__nativeTrace');assert.equal(result.resumed.visibility,'visible');assert.equal(result.resumeFrames.length,2)
 for(const f of result.resumeFrames)for(const value of[f.exactProgress,f.smoothProgress,f.travel])assert.ok(Math.abs(value-.81)<.002,'First resumed pose is stale')
 assert.ok(result.resumed.state.frames>result.hiddenEnd.state.frames);assert.equal(result.errors.length,0)
 const shot=await page('Page.captureScreenshot',{format:'jpeg',quality:80,fromSurface:true,captureBeyondViewport:false});await writeFile(output+'/native-resumed.jpg',Buffer.from(shot.data,'base64'));result.pass=true
 console.log(JSON.stringify({pass:true,visibility:[result.before.visibility,result.hiddenStart.visibility,result.resumed.visibility],hiddenDraws:result.hiddenEnd.state.frames-result.hiddenStart.state.frames,resumePhases:result.resumeFrames.map(f=>[f.exactProgress,f.smoothProgress,f.travel])}))
}catch(error){result.pass=false;result.failure=String(error);process.exitCode=1;console.error(error)}finally{if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}child.kill('SIGTERM');for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser closing'))}pending.clear();await delay(500);await rm(profile,{recursive:true,force:true});await writeFile(output+'/results.json',JSON.stringify(result,null,2))}
