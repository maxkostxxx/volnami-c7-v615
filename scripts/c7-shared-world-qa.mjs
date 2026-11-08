import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.QA_OUTPUT??'evidence/shared-world-v395';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const rows=[],errors=[],failed=[];
const sources=['lab/c7-snapshots/camera-depth-v394/','lab/c7-scene/shared.html'];
const poses=[{sun:.07,move:0},{sun:.5,move:.5},{sun:1,move:1}];
try{
 for(const source of sources){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push({source,message:e.message}));
  page.on('console',e=>{if(e.type()==='error')errors.push({source,message:e.text()});});
  page.on('response',r=>{if(r.status()>=400)failed.push({source,url:r.url(),status:r.status()});});
  await page.goto('http://127.0.0.1:3027/'+source+'?clean&freeze');
  await page.waitForSelector('body.ready',{timeout:120000});
  for(const [width,height]of [[390,844],[1440,900],[2560,1080]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(({width,height})=>Math.abs(sceneLab.camera.aspect-width/height)<1e-10&&sceneLab.renderer.domElement.width===Math.floor(width*1.5)&&sceneLab.renderer.domElement.height===Math.floor(height*1.5),{width,height});
   for(const pose of poses){
    const result=await page.evaluate(async pose=>{
     const s=sceneLab;s.set(pose);const gl=s.renderer.getContext();
     const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
     gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(x=>x.toString(16).padStart(2,'0')).join('');
     return{sha,state:s.state,camera:s.camera.matrixWorld.toArray(),projection:s.camera.projectionMatrix.toArray(),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],programsLinked:s.renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS))};
    },pose);
    rows.push({source,width,height,...pose,...result});
    if(source===sources[1])await page.screenshot({path:`${output}/${width}x${height}-sun${pose.sun}-move${pose.move}.png`});
   }
  }
  if(source===sources[1]){
   const disposal=await page.evaluate(()=>{const s=sceneLab;const before={...s.renderer.info.memory};s.dispose();s.dispose();return{before,after:{...s.renderer.info.memory},status:s.status()};});
   await writeFile(output+'/dispose.json',JSON.stringify(disposal,null,2));
  }
  await page.close();
 }
}catch(e){errors.push({message:e.stack});}finally{await browser.close();}
const base=rows.filter(r=>r.source===sources[0]),candidate=rows.filter(r=>r.source===sources[1]);
const pairs=candidate.map(c=>{const b=base.find(r=>r.width===c.width&&r.height===c.height&&r.sun===c.sun&&r.move===c.move);return{width:c.width,height:c.height,sun:c.sun,move:c.move,pixelsExact:c.sha===b?.sha,cameraExact:JSON.stringify(c.camera)===JSON.stringify(b?.camera),projectionExact:JSON.stringify(c.projection)===JSON.stringify(b?.projection)};});
const files=['lab/c7-scene/world.js','lab/c7-scene/shared-main.js'];
const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const pass=!errors.length&&!failed.length&&pairs.length===9&&pairs.every(p=>p.pixelsExact&&p.cameraExact&&p.projectionExact)&&rows.every(r=>r.programsLinked);
await writeFile(output+'/results.json',JSON.stringify({kind:'Fresh headless Chromium on this Mac; emulated sizes, not physical devices. Native RGBA equality against checked v394.',pass,errors,failed,pairs,hashes,rows},null,2));
console.log({pass,errors,failed,pairs});if(!pass)process.exitCode=1;
