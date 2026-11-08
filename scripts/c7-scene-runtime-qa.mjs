import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const source=process.env.QA_SOURCE,output=process.env.QA_OUTPUT;
if(!source||!output)throw new Error('QA_SOURCE and QA_OUTPUT required');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[],failed=[],captures=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});else requests.push(r.url());});
let timing,failure;
try {
 await page.goto(`http://127.0.0.1:3027/${source}/?clean&freeze`);
 await page.waitForSelector('body.ready',{timeout:90000});
 for(const time of[0,1/60,.5,2]){
  const state=await page.evaluate(time=>sceneLab.set({time}),time);
  const name=`water-wind-t${time.toFixed(4)}`;
  await page.screenshot({path:`${output}/${name}.png`});captures.push({name,state});
 }
 for(const degrees of[-12,12]){
  const state=await page.evaluate(async degrees=>{
   const T=await import('three'),s=sceneLab;s.set({});
   const pivot=new T.Vector3(...s.state.target),offset=s.camera.position.clone().sub(pivot);
   offset.applyAxisAngle(new T.Vector3(0,1,0),degrees*Math.PI/180);s.camera.position.copy(pivot).add(offset);s.camera.lookAt(pivot);s.camera.updateMatrixWorld();
   s.grass.userData.update?.(s.camera);s.farGrass.userData.update?.(s.camera,s.renderer);
   s.renderer.info.reset();s.lake.reflect(s.renderer,s.scene,s.camera,pivot);s.renderer.render(s.scene,s.camera);
   return{camera:s.camera.position.toArray(),target:pivot.toArray(),calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};
  },degrees);
  const name=`orbit${degrees}`;await page.screenshot({path:`${output}/${name}.png`});captures.push({name,state});
 }
 for(const move of[.25,.6,1]){
  const state=await page.evaluate(move=>sceneLab.set({move}),move);const name=`travel${move}`;
  await page.screenshot({path:`${output}/${name}.png`});captures.push({name,state});
 }
 // Actual un-frozen animation. rAF timing includes this Mac/browser/compositor;
 // it is not a hardware-independent GPU benchmark or a phone measurement.
 await page.goto(`http://127.0.0.1:3027/${source}/?clean`);await page.waitForSelector('body.ready',{timeout:90000});
 timing=await page.evaluate(()=>new Promise(resolve=>{
  const times=[],start=performance.now(),before={...sceneLab.state};let last=start;
  function tick(now){times.push(now-last);last=now;if(now-start<4000)requestAnimationFrame(tick);else{
   const sorted=times.slice(2).sort((a,b)=>a-b);resolve({durationMs:now-start,frames:times.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],before,after:{...sceneLab.state},renderer:sceneLab.renderer.getContext().getParameter(sceneLab.renderer.getContext().VERSION)});
  }}requestAnimationFrame(tick);
 }));
 await page.screenshot({path:`${output}/actual-animation.png`});
}catch(error){failure={message:error.message,stack:error.stack};throw error;}finally{
 await browser.close();await writeFile(output+'/results.json',JSON.stringify({source,kind:'Headless Chromium ANGLE Metal on this Mac; viewport emulation only. Static captures freeze time; actual-animation timing is explicitly un-frozen.',failure,errors,failed,captures,timing,requests:[...new Set(requests)]},null,2));
}
console.log({errors,failed,captures:captures.length,timing:timing&&{frames:timing.frames,medianMs:timing.medianMs,p95Ms:timing.p95Ms}});
