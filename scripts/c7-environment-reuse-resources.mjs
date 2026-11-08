import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const out=process.env.QA_OUTPUT;assert.ok(out);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),runs=[],errors=[];
try{for(const low of [true,false]){const p=await browser.newPage({viewport:low?{width:390,height:844}:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3027/lab/c7-scene/shared.html?clean&freeze'+(low?'&quality=low':''));await p.waitForSelector('body.ready',{timeout:90000});
const run=await p.evaluate(async()=>{const s=sceneLab,uuids=new Set(),states=[];const materialVersions=()=>{const versions=[];s.trees.traverse(o=>{if(o.material)versions.push(o.material.version)});return versions};const versions=materialVersions();
for(let i=0;i<60;i++){const progress=i<30?i/29:(59-i)/29;s.render(progress,i/60);uuids.add(s.scene.environment.uuid);states.push({...s.renderer.info.memory,programs:s.renderer.info.programs.length,environment:[s.scene.environment.image.width,s.scene.environment.image.height]});await new Promise(requestAnimationFrame)}
return{uuids:[...uuids],states,versionsStable:JSON.stringify(versions)===JSON.stringify(materialVersions())}});
assert.equal(run.uuids.length,1);assert.ok(run.versionsStable);assert.equal(new Set(run.states.map(s=>s.textures)).size,1);assert.equal(new Set(run.states.map(s=>s.programs)).size,1);runs.push({low,...run});await p.close();console.log(low?'low':'normal','stable target/material versions/programs/textures');}
assert.equal(errors.length,0);}finally{await browser.close();await fs.writeFile(out+'/results.json',JSON.stringify({runs,errors,pass:runs.length===2&&!errors.length},null,2))}
