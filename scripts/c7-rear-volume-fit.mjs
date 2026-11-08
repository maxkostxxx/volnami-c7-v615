import * as T from 'three';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {heightAt,surfacePoint} from '../lab/c7-snapshots/water-canopy-v22/terrain.js';
import {createAtmosphere as oldAtmosphere} from '../lab/c7-snapshots/water-canopy-v22/atmosphere.js';
import {createAtmosphere} from '../evidence/rear-volume-v29/atmosphere.js';
const output='evidence/rear-volume-v29';await mkdir(output,{recursive:true});
const input=new T.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.0284,.13383,.83777);
const matrixOut=new T.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602);
const inverse=rgb=>{
 const v=new T.Vector3(...rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4})).applyMatrix3(matrixOut.clone().invert());
 for(const k of['x','y','z']){const y=v[k],a=y*.983729-1,b=y*.432951-.0245786,c=y*.238081+.000090537;v[k]=(-b-Math.sqrt(b*b-4*a*c))/(2*a)}return v.applyMatrix3(input.clone().invert()).multiplyScalar(.6/.9);
};
const display=v=>{
 v=v.clone().multiplyScalar(.9/.6).applyMatrix3(input);
 for(const k of['x','y','z']){const x=v[k];v[k]=(x*(x+.0245786)-.000090537)/(x*(.983729*x+.432951)+.238081);}
 return v.applyMatrix3(matrixOut).toArray().map(x=>{x=T.MathUtils.clamp(x,0,1);return 255*(x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055)});
};
const radiance=inverse([239,214,183]),sunDirection=new T.Vector3(-.49/2.1,.022/2.1,-.87).normalize();
const oldAerial=oldAtmosphere({heightAt,sunDirection,skyRadiance:radiance,params:{depthStretch:2.1,depthPivotZ:85,hazeSaturation:.5,mistNearZ:-285,mistFarZ:-355,mistExtinction:.03}});
const sources=['screenshots/c7/2026-10-24-scene-rebuild-exec083/bank-canopy-v21/1280x720-sun0.png','screenshots/c7/2026-10-24-reference-rebuild-exec081/source/image3.jpg'];
const pixels=await Promise.all(sources.map(async p=>({data:await sharp(p).removeAlpha().raw().toBuffer()})));
const mean=(data,x,y,w=10,h=8)=>{const out=[0,0,0];for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)for(let c=0;c<3;c++)out[c]+=data[(j*1280+i)*3+c]/(w*h);return out};
const samples=[[475,317],[440,310],[500,310],[680,325]].map(([x,y])=>{
 const p=surfacePoint(x,y),world=[p.x,p.y,85+(p.z-85)*2.1],baseline=oldAerial.debugSample(world,[0,37,85]);
 const rgb=mean(pixels[0].data,x-5,y-4),target=mean(pixels[1].data,x-5,y-4);
 const base=inverse(rgb).sub(new T.Vector3(...baseline.inScatteringRadiance).multiplyScalar(1-baseline.transmittance)).divideScalar(baseline.transmittance);
 return{x,y,world,rgb,target,base,baseline};
});
const treeRoot=surfacePoint(478,357),treeHeight=31/720*2*(85-treeRoot.z)*Math.tan(Math.PI/8),treePoint=[treeRoot.x,treeRoot.y+treeHeight*.65,85+(treeRoot.z-85)*2.1];
const aerial=createAtmosphere({heightAt,sunDirection,skyRadiance:radiance,params:{depthStretch:2.1,depthPivotZ:85,heightScale:160}});
const fits=[];
for(const mistNearZ of[-305,-310,-315])for(const mistFarZ of[-325,-335,-350])for(const mistCenterX of[-90,-70,-50])for(const mistWidthX of[25,45,80])for(const mistOutsideWeight of[.04,.1,.2])for(const mistExtinction of[.06,.12,.24,.48])for(const hazeMaxLuminance of[.8,1,1.2])for(const hazeSaturation of[.6,.8,1]){
 const params={mistNearZ,mistFarZ,mistCenterX,mistWidthX,mistOutsideWeight,mistExtinction,hazeMaxLuminance,hazeSaturation};aerial.setParams(params);let error=0;
 const predictions=samples.map((s,i)=>{const d=aerial.debugSample(s.world,[0,37,85]),rgb=display(s.base.clone().multiplyScalar(d.transmittance).add(new T.Vector3(...d.inScatteringRadiance).multiplyScalar(1-d.transmittance)));error+=rgb.reduce((sum,v,c)=>sum+(v-s.target[c])**2,0)*(i===0?3:i===3?.25:1);return{xy:[s.x,s.y],rgb,target:s.target,T:d.transmittance}});
 const treeT=aerial.debugSample(treePoint,[0,37,85]).transmittance;error+=Math.max(0,.98-treeT)**2*1e6;
 fits.push({params,error,predictions,treeT});
}
fits.sort((a,b)=>a.error-b.error);await writeFile(output+'/fit.json',JSON.stringify({method:'Invert ACES and current aerosol at representative surface rays. ROI-average nonlinear approximation; GPU must verify. No source mutation.',samples,treePoint,fits:fits.slice(0,10)},null,2));console.log(fits.slice(0,3));
