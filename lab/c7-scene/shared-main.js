import {createC7Scene} from './world.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const query=new URLSearchParams(location.search);
if(query.has('clean'))document.body.classList.add('clean');
const world=await createC7Scene({canvas:document.querySelector('canvas'),width:innerWidth,height:innerHeight,
 low:query.get('quality')==='low',noGrass:query.has('no-grass'),noAerial:query.has('no-aerial'),depthStretch:Number(query.get('depth')??2.1)});
window.sceneLab=world;
let solar=Number(query.get('sun')??0),travel=Number(query.get('travel')??0),clock=0,last=performance.now();
const controls=new OrbitControls(world.camera,world.renderer.domElement);controls.enabled=false;
const reset=()=>{world.set({sun:solar,move:travel,time:clock});controls.target.fromArray(world.state.target);};
reset();
addEventListener('resize',()=>{world.resize(innerWidth,innerHeight);reset();});
document.querySelector('#sun').value=solar;document.querySelector('#travel').value=travel;
document.querySelector('#sun').oninput=e=>{solar=Number(e.target.value);reset();};
document.querySelector('#travel').oninput=e=>{travel=Number(e.target.value);controls.enabled=false;reset();};
document.querySelector('#orbit').onclick=()=>{controls.enabled=!controls.enabled;};
document.querySelector('#reset').onclick=()=>{travel=0;controls.enabled=false;reset();};
const frozen=query.has('freeze')||matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('visibilitychange',()=>{last=performance.now();});
world.renderer.domElement.addEventListener('webglcontextlost',e=>e.preventDefault());
world.renderer.domElement.addEventListener('webglcontextrestored',()=>{world.restore();reset();});
world.renderer.setAnimationLoop(ms=>{
 if(document.hidden)return;
 const dt=Math.max(0,(ms-last)/1000);last=ms;
 if(!frozen)clock+=dt;
 if(controls.enabled){controls.update();world.renderCamera(clock,controls.target);}
 else if(!frozen)world.renderState({sun:solar,move:travel,time:clock});
});
addEventListener('pagehide',()=>{world.renderer.setAnimationLoop(null);controls.dispose();world.dispose();},{once:true});
document.body.classList.add('ready');
