import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const output=process.env.QA_OUTPUT;if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'));for(const[f,h]of Object.entries(build.sources))assert.equal(createHash('sha256').update(await readFile(f)).digest('hex'),h)
const browser=await chromium.launch({headless:false,ignoreDefaultArgs:['--disable-backgrounding-occluded-windows','--disable-background-timer-throttling','--disable-renderer-backgrounding'],args:['--use-angle=metal','--window-size=1480,1000']}),result={build}
try{const c=await browser.newContext({viewport:null}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await p.goto('http://127.0.0.1:3007/c7/?c7-debug');await p.locator('.c7-landscape.is-ready').waitFor({timeout:25000});await p.evaluate(()=>scrollTo({top:document.getElementById('process').offsetTop,behavior:'instant'}));await p.waitForTimeout(1200)
 const read=()=>p.evaluate(()=>({visibility:document.visibilityState,focus:document.hasFocus(),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,state:JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug)}))
 result.before=await read();assert.equal(result.before.visibility,'visible')
 const session=await c.newCDPSession(p),nativeWindow=await session.send('Browser.getWindowForTarget');result.nativeWindow=nativeWindow
 await session.send('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{windowState:'minimized'}});await p.waitForTimeout(250);result.hiddenStart=await read();assert.equal(result.hiddenStart.visibility,'hidden','Native minimized window did not become hidden')
 await p.evaluate(()=>{const a=document.getElementById('cases').offsetTop,b=document.getElementById('testimonials').offsetTop;scrollTo({top:a+(b-a)*(.81-.66)/.17,behavior:'instant'})});await p.waitForTimeout(600);result.hiddenEnd=await read();assert.equal(result.hiddenEnd.state.performance.renderCount,result.hiddenStart.state.performance.renderCount,'Draws continued in hidden window')
 await session.send('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{windowState:'normal'}});await p.bringToFront();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));result.resumed=await read();assert.equal(result.resumed.visibility,'visible');assert.ok(result.resumed.state.performance.renderCount>result.hiddenEnd.state.performance.renderCount);assert.ok(Math.abs(result.resumed.state.exactProgress-.81)<.002);assert.ok(Math.abs(result.resumed.state.smoothProgress-.81)<.002,'First resumed frame shows an old chapter')
 await p.screenshot({path:output+'/native-resumed.jpg',type:'jpeg',quality:72});assert.equal(errors.length,0);result.errors=errors;result.pass=true;console.log('Actual native minimized window hidden→visible PASS; no visibility mocking')
}catch(error){result.pass=false;result.error=String(error);throw error}
finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify(result,null,2))}
