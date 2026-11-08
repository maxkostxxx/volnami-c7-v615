import{chromium}from'playwright';import{mkdir,writeFile,readFile}from'node:fs/promises';
const out='evidence/c7-v595-bank-preview';await mkdir(out,{recursive:true});const source=await readFile('lab/c7-scene/terrain.js','utf8');
const before='const frontShapeControls=[[0,2,1],[480,2,1],[610,12,1],[660,12,1],[710,6,1],[780,4,0],[1280,4,0]]';
if(!source.includes(before))throw Error('Source changed');const candidate=source.replace(before,'const frontShapeControls=[[0,1.6,1],[480,1.6,1],[610,4,1],[660,4,1],[710,3,1],[780,4,0],[1280,4,0]]');await writeFile(out+'/terrain-candidate.js',candidate);
const b=await chromium.launch({headless:true,args:['--use-angle=metal']}),rows=[];
try{for(const mode of['base','candidate']){const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 if(mode==='candidate')await p.route('**/lab/c7-scene/terrain.js',r=>r.fulfill({contentType:'application/javascript',body:candidate}));
 await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze');await p.waitForSelector('body.ready',{timeout:120000});await p.evaluate(()=>sceneLab.renderer.setAnimationLoop(null));
 for(const phase of[0,.3,.5,.88,1]){await p.evaluate(phase=>sceneLab.set({sun:phase,move:phase,time:0}),phase);await p.screenshot({path:out+'/'+mode+'-'+phase+'.jpg',quality:94});}
 rows.push({mode,errors,kind:mode==='candidate'?'Geometry preview only: old horizon field, requires fresh bake before acceptance':'v591 baseline'});await p.close();}}
finally{await b.close();await writeFile(out+'/results.json',JSON.stringify(rows,null,2));}
