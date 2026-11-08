import {chromium} from 'playwright';import{mkdir,writeFile}from'node:fs/promises';
const out='evidence/c7-v564-lighting-variants';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1280,height:720}}),rows=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{await page.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await page.waitForSelector('body.ready',{timeout:90000});await page.evaluate(()=>{sceneLab.renderer.setAnimationLoop(null);window.origSkyUpdate=sceneLab.skyLight.update;});
for(const mode of ['base','sheen05','sky-minus2','sky-minus2-sheen05']){
 await page.evaluate(async mode=>{const w=sceneLab,T=await import('three');w.ground.material.sheen=mode.includes('sheen05')?.05:.15;w.ground.material.needsUpdate=true;
 w.skyLight.update=function(phase){origSkyUpdate(phase);if(mode.includes('sky-minus2'))for(const light of w.skyLight.lights){const d=new T.Vector3().subVectors(light.position,light.target.position),r=d.length(),az=Math.atan2(d.x,-d.z),el=Math.asin(d.y/r)-T.MathUtils.degToRad(2*(1-Math.sin(Math.PI*phase)));light.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)).multiplyScalar(r).add(light.target.position)}};
 await w.renderer.compileAsync(w.scene,w.camera);w.set({sun:.01,move:0,time:0});w.set({sun:0,move:0,time:0});},mode);
 await page.screenshot({path:out+'/'+mode+'.jpg',type:'jpeg',quality:95});
 const row=await page.evaluate(async()=>{const w=sceneLab;let first,last,n=0;await new Promise(resolve=>requestAnimationFrame(function tick(t){first??=t;last=t;w.render((.5-.5*Math.cos((t-first)/5000*2*Math.PI)),t/1000);n++;if(t-first<5000)requestAnimationFrame(tick);else resolve()}));return{fps:(n-1)*1000/(last-first),glError:w.renderer.getContext().getError()}});rows.push({mode,...row});console.log(rows.at(-1));
}await writeFile(out+'/results.json',JSON.stringify({rows,errors},null,2))}finally{await browser.close()}
