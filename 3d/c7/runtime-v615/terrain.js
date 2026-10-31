import { finishBuild, finishBuildAsync } from './cooperative-build.js';
async function terrainRows(count, map) {
 return finishBuildAsync((function*(){
  const rows=new Array(count);
  for(let i=0;i<count;i++){rows[i]=map(undefined,i);yield;}
  return rows;
 })());
}
import * as T from './vendor/three/three.module.js';

export const WATER_LEVEL=.72;
export const referenceCamera=new T.PerspectiveCamera(45,16/9,.1,8000);
// Calibrated against the original/reflected tree, rather than assuming that
// the optical horizon equals the visible skyline of the intervening hills.
export const referenceHorizonY=355;
const referenceFocalY=360/Math.tan(T.MathUtils.degToRad(referenceCamera.fov)/2);
export const referenceLookAt=new T.Vector3(0,37-133*(360-referenceHorizonY)/referenceFocalY,-48);
referenceCamera.position.set(0,37,85);referenceCamera.lookAt(referenceLookAt);referenceCamera.updateMatrixWorld();
const ray=(x,y)=>new T.Vector3(x/640-1,1-y/360,.5).unproject(referenceCamera).sub(referenceCamera.position).normalize();
const atZ=(x,y,z)=>{const d=ray(x,y);return referenceCamera.position.clone().addScaledVector(d,(z-85)/d.z)};
const bankPixels=[[0,583],[194,529],[133,492],[251,474],[402,476],[532,483],[656,481],[819,466],[959,482],[1135,473],[1280,480],[1340,555],[1280,595],[1090,612],[924,653],[748,698],[624,707],[476,686],[309,642],[142,603]];
const bankCurve=new T.CatmullRomCurve3(bankPixels.map(([x,y])=>{const d=ray(x,y);return referenceCamera.position.clone().addScaledVector(d,(WATER_LEVEL-37)/d.y)}),true,'centripetal');
export const bank=bankCurve.getPoints(256).slice(0,-1);
function exactDistance(x,z){let d2=1e9,inside=false;for(let i=0,j=bank.length-1;i<bank.length;j=i++) {const a=bank[j],b=bank[i],dx=b.x-a.x,dz=b.z-a.z;const t=T.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);d2=Math.min(d2,(x-a.x-t*dx)**2+(z-a.z-t*dz)**2);if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside}return Math.sqrt(d2)*(inside?-1:1)}
// Fixed world distance field accelerates blade placement; no screen-space data.
// Moving the horizon also changes the water-plane intersections. Derive the
// field from the complete bank: the old fixed z>=-180 domain misclassified a
// part of the recalibrated lake as dry terrain. Outside this padded box is dry.
const bankBounds=new T.Box3().setFromPoints(bank),PAD=60;
const sdfMinX=bankBounds.min.x-PAD,sdfMinZ=bankBounds.min.z-PAD;
const N=512,M=400,DX=(bankBounds.max.x-bankBounds.min.x+2*PAD)/(N-1),DZ=(bankBounds.max.z-bankBounds.min.z+2*PAD)/(M-1),sdf=new Float32Array(N*M);
// Module evaluation yields while preserving the deterministic world fields.
await finishBuildAsync((function*(){
 for(let j=0;j<M;j++){
  for(let i=0;i<N;i++)sdf[j*N+i]=exactDistance(sdfMinX+i*DX,sdfMinZ+j*DZ);
  yield;
 }
})());
export function shoreDistance(x,z){const u=(x-sdfMinX)/DX,v=(z-sdfMinZ)/DZ;if(u<0||v<0||u>=N-1||v>=M-1)return 40;const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;return T.MathUtils.lerp(T.MathUtils.lerp(sdf[j*N+i],sdf[j*N+i+1],a),T.MathUtils.lerp(sdf[(j+1)*N+i],sdf[(j+1)*N+i+1],a),b)}
const smooth=(a,b,x)=>{let t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const bell=x=>Math.exp(-x*x);
// Measured image contours become curved, finite three-dimensional landforms.
function monotoneTangents(points,key){
 const n=points.length,slope=new Float64Array(n-1),span=new Float64Array(n-1),m=new Float64Array(n);
 for(let i=0;i<n-1;i++){span[i]=points[i+1].x-points[i].x;slope[i]=(points[i+1][key]-points[i][key])/span[i]}
 m[0]=slope[0];m[n-1]=slope[n-2];
 for(let i=1;i<n-1;i++){
  // A measured crest/valley is an actual extremum. Unrestricted Catmull
  // tangents continued rising past the highest control point, giving a tip.
  if(slope[i-1]*slope[i]<=0){m[i]=0;continue}
  const a=2*span[i]+span[i-1],b=span[i]+2*span[i-1];
  m[i]=(a+b)/(a/slope[i-1]+b/slope[i]);
 }
 return m;
}
function authoredWidth(points,x){
 if(!points)return 1;
 let i=0;while(i<points.length-2&&points[i+1][0]<x)i++;
 const a=points[i],b=points[i+1];return T.MathUtils.lerp(a[1],b[1],smooth(a[0],b[0],x));
}
// The lake-side fold has a geometric relationship to the far waterline.
// Intersect the actual closed bank at a fixed world X; its northern crossing
// is the water-facing foot of this ridge. Outer terrain can have no crossing.
function farBankAtX(x){
 let north=Infinity;
 for(let j=0,i=bank.length-1;j<bank.length;i=j++){
  const a=bank[i],b=bank[j];if((a.x>x)===(b.x>x))continue;
  north=Math.min(north,a.z+(b.z-a.z)*(x-a.x)/(b.x-a.x));
 }
 return north;
}
function depthBehindBank(px,py,initialZ,offset){
 // Solve along the measured image ray, since changing depth changes world X.
 // A bracketed solve remains stable at the sharply curving right-hand bay.
 const f=z=>z-farBankAtX(atZ(px,py,z).x)+offset;
 let previous=null,best=initialZ,bestDistance=Infinity;
 for(let z=initialZ-100;z<=initialZ+180;z+=2){
  const value=f(z);
  if(Number.isFinite(value)&&previous&&value*previous.value<=0){
   let a=previous.z,b=z;
   for(let i=0;i<28;i++){const middle=(a+b)/2;if(f(middle)*previous.value>0)a=middle;else b=middle;}
   const candidate=(a+b)/2,distance=Math.abs(candidate-initialZ);
   if(distance<bestDistance){best=candidate;bestDistance=distance;}
  }
  previous=Number.isFinite(value)?{z,value}:null;
 }
 return best;
}
const ridge=(z,width,pixels,options={})=>{
 const curve=options.curve??8;
 const points=pixels.map(([x,y])=>{
  const nominal=atZ(x,y,z),authoredDepth=z+curve*Math.sin(nominal.x*.009)-(options.leftDepthShift??0)*(1-smooth(230,390,x));
  const depth=options.bankOffsets?depthBehindBank(x,y,authoredDepth,authoredWidth(options.bankOffsets,x)):authoredDepth,p=atZ(x,y,depth);
  // The global shoreline ramp also applies at an oblique bay. Recover the
  // requested amplitude before that ramp so its crest remains on the ray.
  const shoreFactor=options.bankOffsets?Math.max(.1,smooth(0,15,shoreDistance(p.x,p.z))):1;
  // Bend the actual ridge in depth, then recover each measured point from
  // its original image ray. The camera-space landmarks remain authored.
  // Ridge amplitudes are relative to the lake plane, as heightAt adds that
  // elevation once after composing the terrain.
  const depthScale=options.leftDepthShift?(85-depth)/(85-z-curve*Math.sin(nominal.x*.009)):1;
  return{x:p.x,y:(p.y-WATER_LEVEL)/shoreFactor,z:depth,width:width*authoredWidth(options.widths,x)*depthScale,depthScale};
 });
 return{bankRelative:!!options.bankOffsets,z,width,frontWidth:options.frontWidth??Infinity,blend:options.blend??10,points,tangents:{y:monotoneTangents(points,'y'),z:monotoneTangents(points,'z'),width:monotoneTangents(points,'width'),depthScale:monotoneTangents(points,'depthScale')}};
};
const ridges=[
// Background crests sit inside the low valleys of the main skyline. A generic
// sine mound here raised the left horizon to y=340, erasing the sunrise valley.
ridge(-500,82,[[-500,395],[0,377],[100,381],[180,383],[263,374],[328,383],[430,391],[565,386],[730,390],[912,383],[1055,386],[1165,375],[1280,380],[1800,397]],{leftDepthShift:260}),
// A low, separate rear fold is visible through the side valleys. Its centre
// stays low so it cannot become another competing skyline behind the peaks.
ridge(-420,62,[[-500,399],[0,367],[80,378],[155,380],[230,370],[300,375],[390,389],[640,402],[900,390],[1030,385],[1130,380],[1200,373],[1280,379],[1800,398]],{curve:13,blend:5,leftDepthShift:260}),
// Close shoulder samples describe the broad rounded caps in image3; they do
// not change the measured highest points (480,293) and (685,311).
ridge(-340,83,[[-500,388],[0,340],[180,376],[290,375],[390,323],[430,304],[455,296],[480,293],[505,297],[530,307],[553,324],[575,339],[590,352],[598,357],[610,349],[622,341],[654,322],[670,314],[685,311],[703,313],[723,322],[741,337],[755,351],[870,347],[1080,382],[1280,354],[1800,380]],{curve:11,leftDepthShift:260,frontWidth:45,blend:6,widths:[[0,.86],[480,1.04],[685,.91],[870,1.15],[1280,.88]]}),
// The broad right-hand shoulder is the nearer ridge, not a pointed background
// mountain. Its observed crest is around (815,327) in the 1280x720 reference.
// At horizon355 the far bank moves back by 40–58m. Translate the four front
// folds by comparable amounts, preserving their gaps and original image rays.
// Keeping their old Z coordinates would put the two right crests underwater.
ridge(-280,46,[[-500,407],[0,389],[160,418],[275,385],[355,355],[398,347],[430,353],[450,362],[466,366],[505,366],[591,393],[715,359],[767,334],[815,327],[850,331],[881,341],[958,383],[1050,424],[1215,391],[1450,359],[1900,405]],{curve:18,frontWidth:25,blend:5,widths:[[0,.85],[398,1.0],[591,1.18],[815,1.18],[1050,.88],[1450,1.0]]}),
// A separate intermediate fold is visible between the left main ridge and the
// long lake-side wave. Its depth creates overlap/parallax, not a painted crease.
ridge(-247,19,[[-500,430],[0,410],[140,427],[280,398],[375,379],[465,397],[560,422],[655,429],[760,407],[880,393],[995,430],[1110,439],[1245,418],[1900,446]],{curve:10,blend:3.5,frontWidth:15}),
ridge(-224,18,[[-500,442],[0,421],[140,443],[280,422],[350,404],[402,399],[447,406],[526,438],[638,442],[748,433],[817,413],[856,410],[892,416],[956,442],[1065,456],[1208,438],[1450,411],[1900,435]],{curve:16,frontWidth:9,blend:4,bankOffsets:[[0,40],[480,40],[638,40],[735,20],[856,25],[1280,25]],widths:[[0,.9],[402,1.1],[638,1.05],[856,1],[1065,.95],[1450,1.08]]}),
// The lower right shoulder turns toward the water ahead of the long wave. It
// vanishes into the low middle bank instead of becoming a straight raised rim.
ridge(-207,20,[[-500,490],[0,470],[180,481],[300,469],[400,450],[520,468],[640,479],[760,458],[847,427],[890,422],[926,430],[980,450],[1110,471],[1280,465],[1900,490]],{curve:9,blend:3}),
// A distinct valley ridge crosses upward behind the first tree. Image3 shows
// its crest around (120,400), (160,392), (240,380), (320,367); it is in front
// of the distant left skyline, not a colour/normal band on that skyline.
ridge(-445,30,[[-500,445],[0,414],[80,407],[120,400],[160,392],[200,386],[240,380],[280,373],[320,367],[360,367],[400,380],[450,410],[550,445],[1800,445]],{curve:9,frontWidth:30,blend:2})];
// One-dimensional waterline lookup keeps the Hermite shoulder O(1) per
// height sample. At the bank's lateral ends the replacement fades away,
// avoiding a profile discontinuity where no northern crossing exists.
const FAR_BANK_SAMPLES=4097,farBankStep=(bankBounds.max.x-bankBounds.min.x)/(FAR_BANK_SAMPLES-1);
const farBankDepths=Float64Array.from({length:FAR_BANK_SAMPLES},(_,i)=>
 farBankAtX(T.MathUtils.clamp(bankBounds.min.x+i*farBankStep,bankBounds.min.x+1e-6,bankBounds.max.x-1e-6)));
function sampledFarBank(x){
 if(x<=bankBounds.min.x||x>=bankBounds.max.x)return Infinity;
 const position=(x-bankBounds.min.x)/farBankStep,i=Math.min(FAR_BANK_SAMPLES-2,Math.floor(position));
 return T.MathUtils.lerp(farBankDepths[i],farBankDepths[i+1],position-i);
}
const ridgeChannels=['y','z','width','depthScale'],ridgeScratch=new Float64Array(4);
const ridgeLastSample=new WeakMap();
function ridgeSample(r,x){
 const cached=ridgeLastSample.get(r);
 if(cached&&Object.is(cached.x,x)){ridgeScratch.set(cached.values);return ridgeScratch;}
 let i=0;const q=r.points;while(i<q.length-2&&q[i+1].x<x)i++;
 const a=q[i],b=q[i+1],span=b.x-a.x,t=T.MathUtils.clamp((x-a.x)/span,0,1),t2=t*t,t3=t2*t;
 const h0=2*t3-3*t2+1,h1=t3-2*t2+t,h2=-2*t3+3*t2,h3=t3-t2;
 for(let channel=0;channel<4;channel++){
  const key=ridgeChannels[channel];if(key==='depthScale'&&!r.tangents.depthScale){ridgeScratch[channel]=1;continue;}ridgeScratch[channel]=h0*a[key]+h1*span*r.tangents[key][i]+h2*b[key]+h3*span*r.tangents[key][i+1];
 }
 if(cached){cached.x=x;cached.values.set(ridgeScratch);}
 else ridgeLastSample.set(r,{x,values:ridgeScratch.slice()});
 return ridgeScratch;
}
// Author cross-section changes along the actual 3D crest. Resolve the
// reference marks once to world X; runtime curvature is a spatial field.
const frontShapeControls=[[0,2,1],[480,2,1],[610,12,1],[660,12,1],[710,6,1],[780,4,0],[1280,4,0]].map(([px,power,mix])=>{
 const r=ridges[5];let low=r.points[0].x,high=r.points.at(-1).x;
 for(let i=0;i<48;i++){const x=(low+high)/2,sample=ridgeSample(r,x),height=WATER_LEVEL+sample[0]*smooth(0,15,shoreDistance(x,sample[1])),p=new T.Vector3(x,height,sample[1]).project(referenceCamera);if((p.x+1)*640<px)low=x;else high=x;}
 return{x:(low+high)/2,power,mix};
});
function frontShape(x){let i=0;while(i<frontShapeControls.length-2&&frontShapeControls[i+1].x<x)i++;const a=frontShapeControls[i],b=frontShapeControls[i+1],t=smooth(a.x,b.x,x);return{power:T.MathUtils.lerp(a.power,b.power,t),mix:T.MathUtils.lerp(a.mix,b.mix,t)};}
function union(a,b,k=7,floor=0){
 // Standard polynomial smooth-max raises even two zero contributions by k/4.
 // Eight such unions built a 5–6 m flat shelf. Only round a genuine overlap;
 // empty Gaussian tails must retain the existing valley floor.
 // A smooth symmetric width also preserves the rounded derivative at a=b;
 // multiplying the final correction by a weight would leave a normal crease.
 k*=smooth(0,k,a-floor)*smooth(0,k,b-floor);
 if(k<1e-7)return Math.max(a,b);
 const h=Math.max(k-Math.abs(a-b),0)/k;
 return Math.max(a,b)+h*h*k*.25}

// The front bank is the continuous curve through reference controls12..19,0.
// Parameterise its actual 3D arc by horizontal ray direction, not screen UVs.
// That lets a dry-side crest keep the bank's silhouette while its viewer-facing
// slope falls away from the sun. This is static world geometry, not an overlay.
// A closed Catmull arc turns back on itself just outside the left frame:
// two shore depths then share one horizontal ray. A monotone Hermite profile
// through the same near-bank anchors gives one depth per direction, preserving
// every measured anchor and a continuous extension beyond the reference frame.
const nearControls=[...bankPixels.slice(12),bankPixels[0]].map(([x,y])=>{
 const d=ray(x,y),p=referenceCamera.position.clone().addScaledVector(d,(WATER_LEVEL-37)/d.y);
 return{x:p.x/(85-p.z),z:p.z};
}).sort((a,b)=>a.x-b.x);
const nearTangents=monotoneTangents(nearControls,'z');
const nearMinU=nearControls[0].x,nearMaxU=nearControls.at(-1).x;
const NEAR_LOOKUP_SIZE=4097,nearBankZ=new Float64Array(NEAR_LOOKUP_SIZE);
for(let i=0,j=0;i<NEAR_LOOKUP_SIZE;i++){
 const u=T.MathUtils.lerp(nearMinU,nearMaxU,i/(NEAR_LOOKUP_SIZE-1));
 while(j<nearControls.length-2&&nearControls[j+1].x<u)j++;
 const a=nearControls[j],b=nearControls[j+1],span=b.x-a.x,t=(u-a.x)/span,t2=t*t,t3=t2*t;
 nearBankZ[i]=(2*t3-3*t2+1)*a.z+(t3-2*t2+t)*span*nearTangents[j]
             +(-2*t3+3*t2)*b.z+(t3-t2)*span*nearTangents[j+1];
}
function frontBankDepth(u){
 const step=(nearMaxU-nearMinU)/(NEAR_LOOKUP_SIZE-1);
 if(u<nearMinU){const slope=(nearBankZ[1]-nearBankZ[0])/step;return nearBankZ[0]+T.MathUtils.clamp(slope,-250,250)*.25*Math.tanh((u-nearMinU)/.25)}
 if(u>nearMaxU){const last=NEAR_LOOKUP_SIZE-1,slope=(nearBankZ[last]-nearBankZ[last-1])/step;return nearBankZ[last]+T.MathUtils.clamp(slope,-250,250)*.25*Math.tanh((u-nearMaxU)/.25)}
 const f=(u-nearMinU)/step,i=Math.min(NEAR_LOOKUP_SIZE-2,Math.floor(f));
 return T.MathUtils.lerp(nearBankZ[i],nearBankZ[i+1],f-i);
}
// A narrower western shoulder and broader eastern shoulder reproduce the
// reference's lit crest over a shaded foreground slope. This changes the
// physical cap, keeping the shoreline and measured crest rays fixed.
function foregroundCapWidth(s,x){return 7 + 5 * smooth(-45, 45, x);}

function foregroundCrestDepth(x){return 36+24*(1-smooth(-90,10,x));}
function foregroundHeight(x,z,existing){
 const cameraDepth=85-z;if(cameraDepth<=5)return existing;
 const u=x/cameraDepth,bankZ=frontBankDepth(u),s=z-bankZ;
 if(s<=-20||s>=170)return existing;
 const outsideU=Math.max(nearMinU-u,u-nearMaxU,0);
 const weight=smooth(-20,0,s)*(1-smooth(0,.35,outsideU))*(1-smooth(110,170,s))*smooth(5,15,cameraDepth);
 if(weight<=0)return existing;
 const crest=foregroundCrestDepth(x),scale=crest/36;
 const dryS=Math.max(0,s),envelope=(37-WATER_LEVEL)*dryS/(85-bankZ);
 // The bank-facing half is a real broad convex shoulder. A width6 tail left
 // a near-horizontal shelf exposed by side views; preserve the s36 crest
 // and its tangent, while keeping the accepted camera-facing cap unchanged.
 const lowMeadow=.22*(1-Math.exp(-dryS/3)),ridge=bell((dryS-crest)/(dryS<crest?18*scale:foregroundCapWidth(dryS,x)*scale));
 let height=WATER_LEVEL+T.MathUtils.lerp(lowMeadow,envelope,ridge);
 // A monotone water-to-crest shoulder replaces the nearly horizontal
 // Gaussian tail. It stays below the original reference sightline envelope,
 // meets water at s0, and preserves both height and derivative at s36.
 if(dryS<crest){
  const t=dryS/crest;
  height=WATER_LEVEL+envelope*t*(2-t);
  // Retain the original water-edge profile through all root admission
  // thresholds; changing a rejected root must not shift downstream RNG.
  const oldT=dryS/36,shoreHeight=WATER_LEVEL+envelope*oldT*(2-oldT);
  height=T.MathUtils.lerp(shoreHeight,height,smooth(18,28,dryS));
 }
 if(dryS>44*scale){
   // CPU candidate only: preserve the entire measured crest and its front
   // shoulder through s44, then continue downhill with a C1 exponential tail.
   // It approaches a gentle downhill slope, not a horizontal shelf. Old hills
   // return only beyond s110, outside the tested initial-camera frusta.
   const join=44*scale,rate=(37-WATER_LEVEL)/(85-bankZ),width=foregroundCapWidth(join,x)*scale,b=bell((join-crest)/width);
   const low=.22*(1-Math.exp(-join/3)),lowD=.22/3*Math.exp(-join/3),bD=-2*(join-crest)/(width*width)*b;
   const H=WATER_LEVEL+low+(rate*join-low)*b;
   const derivative=lowD+(rate-lowD)*b+(rate*join-low)*bD;
   const distance=dryS-join,length=6,slope=.035,drop=length*Math.max(0,-derivative-slope);
   const continued=H-drop*(1-Math.exp(-distance/length))-slope*distance;
   // Close the dry valley above the lake plane; the continuation must not
   // create unmodelled flooded holes behind the foreground crest.
   const floor=WATER_LEVEL+.05,v=continued-floor,softness=.08;
   height=floor+Math.max(v,0)+softness*Math.log1p(Math.exp(-Math.abs(v)/softness));
 }
 return T.MathUtils.lerp(existing,height,weight);
}
function submergedFrontHeight(x,z,d){
 const floor=WATER_LEVEL-Math.min(12,-d*.35);
 if(d < -6)return floor;
 const r=ridges[5],sample=ridgeSample(r,x),bankDepth=sampledFarBank(x),gap=bankDepth-sample[1];
 if(!Number.isFinite(gap)||gap<=0||z<bankDepth-.1||z>bankDepth+8)return floor;
 const edgeWeight=smooth(bankBounds.min.x,bankBounds.min.x+12,x)*(1-smooth(bankBounds.max.x-12,bankBounds.max.x,x));
 const weight=edgeWeight*smooth(0,12,gap)*(1-smooth(52,70,gap))*(1-smooth(.5,6,-d))*frontShape(x).mix;
 const crestHeight=sample[0]*smooth(0,15,shoreDistance(x,sample[1]));
 // Continue the same descending power slope through the water plane, then
 // round into the existing lake floor entirely below water. No surface shelf.
 const continued=WATER_LEVEL+Math.min(0,crestHeight*(1-Math.pow((z-sample[1])/gap,frontShape(x).power)));
 return T.MathUtils.lerp(floor,continued,weight);
}
// A shallow continuous shoulder on the distant owner hill.
// Its entire added volume ends behind z=-313, leaving the separate tree-root
// ridge and its placements untouched. The external rear peak is unchanged.
const rearContinuousShoulder=ridge(-322,8,[[395,369],[430,347],[455,330],[476,324],[494,332],[515,347],[536,365],[548,374],[575,391]],{curve:0,frontWidth:20,blend:1.2});
function rearContinuousFold(x,z,existing){
 if(x<=-115||x>=-28||z<=-345||z>=-313)return existing;
 const sample=ridgeSample(rearContinuousShoulder,x),depth=z-sample[1];
 const width=T.MathUtils.lerp(8,20,smooth(-4,8,depth));
 const support=smooth(-115,-98,x)*(1-smooth(-42,-28,x))*smooth(-345,-335,z)*(1-smooth(-318,-313,z));
 const candidate=WATER_LEVEL+sample[0]*Math.exp(-Math.pow(depth/width,2));
 // Fade the displacement, not the whole hill height: maintain the existing
 // back slope and its continuous derivative at the bounded ownership edge.
 return existing+Math.max(0,union(existing,candidate,1.2,WATER_LEVEL)-existing)*support;
}


// The current root belongs to the old rear Gaussian. Add a separate low green
// shoulder in front, touching just below that existing root rather than lifting
// or freezing the tree. A below-max C1 join cannot overshoot that contact.
const rearRootMound=ridge(-310.92033308973043,10,[[390,385],[430,365],[455,357],[478,357],[500,360],[520,365],[546,381]],{curve:0,frontWidth:22,blend:2});
function rearRootMoundHeight(x,z){
 const sample=ridgeSample(rearRootMound,x),depth=z-sample[1],width=T.MathUtils.lerp(10,22,smooth(-4,8,depth));
 return WATER_LEVEL+(sample[0]-.02)*Math.exp(-Math.pow(depth/width,2));
}
function rearRootMoundFold(x,z,existing){
 if(x<=-115||x>=-30||z<=-318||z>=-265)return existing;
 const support=smooth(-115,-100,x)*(1-smooth(-42,-30,x))*smooth(-318,-313,z)*(1-smooth(-285,-265,z));
 const delta=Math.max(0,rearRootMoundHeight(x,z)-existing);
 return existing+support*delta*smooth(0,2,delta);
}

function baseHeightAt(x,z){const d=shoreDistance(x,z);if(d<0)return submergedFrontHeight(x,z,d);
 // A real rear valley descends behind the authored ridges. Keeping this base
 // at lake level made the finite mesh edge a horizontal skyline at y=357.
 // Blend each crest above the same base so max/union cannot restore that shelf.
 const base=-80*smooth(440,760,-z),shoreFade=smooth(0,15,d);
 let h=base+.5;for(const r of ridges){const sample=ridgeSample(r,x),depth=z-sample[1];
  // A broad back must not send a tall Gaussian tail through the next lower
  // wave. Ease into a bounded front shoulder, preserving the rounded cap.
  const width=T.MathUtils.lerp(sample[2],Math.min(sample[2],r.frontWidth*sample[3]),smooth(-12,12,depth));
  let profile=base+(sample[0]-base)*bell(depth/width);
  if(r.bankRelative&&depth>=0){
   const bankDepth=sampledFarBank(x),gap=bankDepth-sample[1];
   if(Number.isFinite(gap)&&gap>0){
    // Use one rounded front between the measured crest and its waterline:
    // Power shoulder: zero crest slope, nonzero slope at the water. The previous Gaussian
    // and shore fade both steepened this same face, producing a thin lit lip.
    const edgeWeight=smooth(bankBounds.min.x,bankBounds.min.x+12,x)
      *(1-smooth(bankBounds.max.x-12,bankBounds.max.x,x));
    // Join the unchanged back over one metre. At an oblique crest the
    // existing shoreline ramp has a small derivative; this keeps it C1.
    const weight=edgeWeight*smooth(0,12,gap)*(1-smooth(52,70,gap))*smooth(0,1,depth)*frontShape(x).mix;
    const crestHeight=sample[0]*smooth(0,15,shoreDistance(x,sample[1]));
    // heightAt still applies the shoreline ramp once to the composed terrain.
    // Undo it for this already shore-relative contribution, not for other hills.
    const front=crestHeight*(1-Math.pow(T.MathUtils.clamp(depth/gap,0,1),frontShape(x).power))/Math.max(.0001,shoreFade);
    profile=T.MathUtils.lerp(profile,base+front,weight);
   }
  }
  h=union(h,profile,r.blend,base)}
 // Side folds close the valley in depth; the distant horizon is authored above.
 // A real low western fold joins the back ridge to the near west mound.
 // Previously every contribution here fell below the constant0.5m floor.
 // Broad curvature follows the land; it is not random noise or a light mask.
 const westFold=(6+2*bell((x+205)/75))*bell((z+177-10*Math.sin((x+170)*.012))/31)
   *(1-smooth(-150,-115,x))*smooth(-520,-370,x);
 const west=20*bell((x+145)/78)*bell((z+52)/68);
 const eastNear=union(26*bell((x-230)/65)*bell((z+150)/35),26*bell((x-190)/60)*bell((z+25)/45),5,0);
 const east=eastNear+15*bell((x-360)/120)*bell((z+100)/100);
 const near=11*bell((z-49)/44)*(.13+.87*smooth(0,58,Math.abs(x+4)));
 const next=16*bell((x+65)/90)*bell((z-145)/52)+13*bell((x-85)/85)*bell((z-205)/60);
 const sideWest=union(18*bell((x+245)/65)*bell((z+155)/32),12*bell((x+205)/45)*bell((z+140)/26),4,0)*(1-smooth(-180,-145,x));
 for(const v of[westFold,west,east,near,next,sideWest])h=union(h,base+v,5,base);
 // Rounded waterline, no artificial dark/bare ribbon. Fine detail is material-scale.
 return foregroundHeight(x,z,rearRootMoundFold(x,z,rearContinuousFold(x,z,WATER_LEVEL+h*shoreFade)));
}
// An independently authored world-space roll. Its front normal follows its
// own nearly level Z axis, instead of inheriting the lake bend through a
// normalized crest-to-bank coordinate. The final toe meets the actual bank.
const axisUpperPoints=[[700,445,-224],[748,433,-224],[817,413,-220],[856,410,-220],[892,416,-220],[956,442,-220],[1065,456,-215],[1140,449,-210]].map(([px,py,z])=>{const p=atZ(px,py,z);return{x:p.x,y:p.y,z,width:1}});
const axisUpper={points:axisUpperPoints,tangents:{y:monotoneTangents(axisUpperPoints,'y'),z:monotoneTangents(axisUpperPoints,'z'),width:monotoneTangents(axisUpperPoints,'width')}};
function axisHermite(z,a,ha,ma,b,hb,mb){const span=b-a,t=T.MathUtils.clamp((z-a)/span,0,1),t2=t*t,t3=t2*t;return(2*t3-3*t2+1)*ha+(t3-2*t2+t)*span*ma+(-2*t3+3*t2)*hb+(t3-t2)*span*mb;}
const axisLowerPoints=[[720,473],[780,450],[817,438],[847,427],[890,422],[926,430],[980,450],[1040,468],[1100,474]].map(([px,py])=>{const p=atZ(px,py,-210);return{x:p.x,y:Math.max(WATER_LEVEL+.1,p.y),z:-210,width:1}});
const axisLower={points:axisLowerPoints,tangents:{y:monotoneTangents(axisLowerPoints,'y'),z:monotoneTangents(axisLowerPoints,'z'),width:monotoneTangents(axisLowerPoints,'width')}};
function axisSection(x){
 const upper=[...ridgeSample(axisUpper,x)],lower=[...ridgeSample(ridges[6],x)],bankZ=sampledFarBank(x);
 const weight=smooth(48,65,x)*(1-smooth(100,135,x));if(weight<=0)return null;
 const upperZ=upper[1],upperHeight=upper[0],frontZ=-210,frontHeight=ridgeSample(axisLower,x)[0];
 if(frontZ>=bankZ-2)return null;
 const joinZ=upperZ-18,joinHeight=baseHeightAt(x,joinZ),e=.05,joinSlope=(baseHeightAt(x,joinZ+e)-baseHeightAt(x,joinZ-e))/(2*e);
 const span=frontZ-upperZ,valleyAmplitude=T.MathUtils.clamp((.5*span*2.1-Math.abs(upperHeight-frontHeight))/2,0,4),valleyHeight=Math.max(WATER_LEVEL+.5,Math.min(upperHeight,frontHeight)-valleyAmplitude),drop=upperHeight+frontHeight-2*valleyHeight;
 const valleyZ=T.MathUtils.lerp(upperZ,frontZ,T.MathUtils.clamp((upperHeight-valleyHeight)/Math.max(.001,drop),.001,.999));
 return{weight,joinZ,joinHeight,joinSlope,upperZ,upperHeight,valleyZ,valleyHeight,valleyAmplitude,frontZ,frontHeight,bankZ,width:11};
}
const AXIS_MIN=48,AXIS_MAX=135,AXIS_SAMPLES=2049,AXIS_STEP=(AXIS_MAX-AXIS_MIN)/(AXIS_SAMPLES-1);
const axisRows=await terrainRows(AXIS_SAMPLES,(_,i)=>axisSection(AXIS_MIN+i*AXIS_STEP));
function axisSample(x){if(x<=AXIS_MIN||x>=AXIS_MAX)return null;const f=(x-AXIS_MIN)/AXIS_STEP,i=Math.min(AXIS_SAMPLES-2,Math.floor(f)),a=axisRows[i],b=axisRows[i+1];if(!a||!b)return null;const s={};for(const k of Object.keys(a))s[k]=T.MathUtils.lerp(a[k],b[k],f-i);return s;}
function axisHeightAt(x,z,existing){
 const s=axisSample(x);if(!s||z<=s.joinZ||z>s.bankZ+2)return existing;
 let h;
 if(z<=s.upperZ)h=axisHermite(z,s.joinZ,s.joinHeight,s.joinSlope,s.upperZ,s.upperHeight,0);
 else if(z<=s.frontZ&&s.valleyAmplitude<.001)h=axisHermite(z,s.upperZ,s.upperHeight,0,s.frontZ,s.frontHeight,0);
 else if(z<=s.valleyZ)h=axisHermite(z,s.upperZ,s.upperHeight,0,s.valleyZ,s.valleyHeight,0);
 else if(z<=s.frontZ)h=axisHermite(z,s.valleyZ,s.valleyHeight,0,s.frontZ,s.frontHeight,0);
 else{
  const d=z-s.frontZ,gap=s.bankZ-s.frontZ,A=s.frontHeight-WATER_LEVEL;
  // Preserve the rounded crest, then join its actual value and tangent to
  // the water with one monotone C1 section. A Gaussian plus a low linear
  // foot produced an almost horizontal shelf before the shoreline.
  const join=Math.min(3,s.width*s.width/(2*gap));
  const joinH=A*Math.exp(-Math.pow(join/s.width,2));
  const joinM=-2*join/(s.width*s.width)*joinH;
  const toeM=-Math.min(.08,2*A/gap);
  h=WATER_LEVEL+(d<=join?A*Math.exp(-Math.pow(d/s.width,2)):
    axisHermite(d,join,joinH,joinM,gap,0,toeM));
 }
 const shorelineHold=smooth(.07,.3,Math.abs(shoreDistance(x,z))),beyondBank=1-smooth(0,2,z-s.bankZ);
 return T.MathUtils.lerp(existing,h,s.weight*shorelineHold*beyondBank);
}
// Bounded, ordered shoulder/valley/roll section. The shoulder ends twenty
// reference pixels below the upper crest. Its depth is solved from a real
// 22 degree sightline to the bank, so its volume can occlude the lower roll.
function leftCurve(points){return{points,tangents:{y:monotoneTangents(points,'y'),z:monotoneTangents(points,'z'),width:monotoneTangents(points,'width')}};}
const leftShoulderPixels=[[0,441],[140,463],[280,447],[350,435],[400,432],[438,437],[480,447],[526,461],[580,466],[638,470],[748,453]];
const leftShoulderCurve=leftCurve(leftShoulderPixels.map(([px,py])=>{
 const f=z=>{const p=atZ(px,py,z),bank=sampledFarBank(p.x);return p.y-WATER_LEVEL-Math.tan(22*Math.PI/180)*(bank-z)*2.1;};
 let result=null,previous=null;
 for(let z=-270;z<-120;z+=.5){const value=f(z);if(Number.isFinite(value)&&previous&&value*previous.value<=0){let a=previous.z,b=z;for(let i=0;i<32;i++){const c=(a+b)/2;if(f(c)*previous.value>0)a=c;else b=c;}result=(a+b)/2;break;}previous=Number.isFinite(value)?{z,value}:null;}
 const p=atZ(px,py,result??-195);return{x:p.x,y:p.y,z:p.z,width:1};
}));
const leftReferenceFrontCurve=leftCurve([[0,476],[180,478],[280,467],[350,455],[400,450],[438,453],[480,460],[520,468],[580,476],[638,479],[748,470]].map(([px,py])=>{
 let z=-185;for(let i=0;i<32;i++){const p=atZ(px,py,z),s=[...ridgeSample(leftShoulderCurve,p.x)],bank=sampledFarBank(p.x);if(!Number.isFinite(bank))break;z=T.MathUtils.lerp(s[1],bank,.62);}
 const p=atZ(px,py,z);return{x:p.x,y:p.y,z:p.z,width:1};
}));

const leftFrontCurve=leftCurve([[0,476],[180,478],[280,467],[350,465],[400,458],[438,452],[480,455],[520,466],[580,476],[638,479],[748,470]].map(([px,py])=>{
 let z=-185;for(let i=0;i<32;i++){const p=atZ(px,py,z),s=[...ridgeSample(leftShoulderCurve,p.x)],bank=sampledFarBank(p.x);if(!Number.isFinite(bank))break;z=T.MathUtils.lerp(s[1],bank,.62);}
 const p=atZ(px,py,z);return{x:p.x,y:p.y,z:p.z,width:1};
}));
function leftProfileValue(nodes,z){let i=0;while(i<nodes.length-2&&nodes[i+1].z<z)i++;const a=nodes[i],b=nodes[i+1];return axisHermite(z,a.z,a.h,a.m,b.z,b.h,b.m);}
const LEFT_DRY_JOIN=-110,LEFT_DRY_TOE=sampledFarBank(LEFT_DRY_JOIN),LEFT_DRY_SLOPE=(sampledFarBank(LEFT_DRY_JOIN+.05)-sampledFarBank(LEFT_DRY_JOIN-.05))/.1;
function leftContinuedToe(x){return x>=LEFT_DRY_JOIN?sampledFarBank(x):LEFT_DRY_TOE+LEFT_DRY_SLOPE*(x-LEFT_DRY_JOIN);}
function buildLeftOccludedRow(x,frontCurve,shoulderReference=null,tangentOnly=false){
 const upper=[...ridgeSample(ridges[5],x)],shoulder=[...ridgeSample(leftShoulderCurve,x)],front=[...ridgeSample(frontCurve,x)],bankZ=leftContinuedToe(x),upperZ=upper[1],joinZ=upperZ-12;
 // The lower roll belongs to the left entrance. Finish its support before
 // the central saddle: extending it through x=25 compressed the broad main
 // crest into a second, narrow rim. The original shoreline stays authoritative.
 const q=smooth(-154,-120,x)*(1-smooth(-42,-18,x));
 if(q<=0||!Number.isFinite(bankZ)||bankZ-upperZ<12)return null;
 const e=.03,derivative=z=>(baseHeightAt(x,z+e)-baseHeightAt(x,z-e))/(2*e),joinH=baseHeightAt(x,joinZ),upperH=baseHeightAt(x,upperZ),bankH=baseHeightAt(x,bankZ),joinM=derivative(joinZ),bankM=derivative(bankZ),gap=bankZ-upperZ;
 const shoulderZ=T.MathUtils.clamp(shoulder[1],upperZ+gap*.2,bankZ-gap*.15),rawFrontZ=T.MathUtils.clamp(front[1],shoulderZ+gap*.03,bankZ-gap*.06),rawFrontH=Math.max(bankH+.08,Math.min(front[0],upperH-.2));
 // Use the same roll fade on both sides of the dry/wet boundary.
 // The former branch made a narrow high-gradient strip near x=-110.
 const dryRoll=smooth(.1,1.2,front[0]-bankH),frontZ=T.MathUtils.lerp(bankZ-.001,rawFrontZ,dryRoll),frontH=T.MathUtils.lerp(bankH+bankM*(frontZ-bankZ),rawFrontH,dryRoll),shoulderH=shoulderReference??T.MathUtils.clamp(shoulder[0],frontH+.2,upperH-.1);
 // An extinct fold loses both amplitude and valley-to-cap span. Its knots
 // revert to samples of the monotone source curve, never equal-height flats.
 const actualRoll=Math.min(1,Math.max(0,(frontH-bankH-.1)/2)),amplitude=.65*q*actualRoll,backSpan=Math.max(.001,Math.min(1.3*q*actualRoll*dryRoll,(frontZ-shoulderZ)*.2)),valleyZ=frontZ-backSpan,valleyH=T.MathUtils.lerp(bankH+bankM*(valleyZ-bankZ),frontH-amplitude,dryRoll),rollM=T.MathUtils.lerp(bankM,0,dryRoll);
 const target=[{z:joinZ,h:joinH,m:joinM},{z:upperZ,h:upperH,m:0},{z:shoulderZ,h:shoulderH,m:-.6},{z:valleyZ,h:valleyH,m:rollM},{z:frontZ,h:frontH,m:rollM},{z:bankZ,h:bankH,m:Math.min(-.15,bankM)}];
 const oldZ=[joinZ,upperZ,upperZ+gap*.45,upperZ+gap*.68,upperZ+gap*.76,bankZ],nodes=[];
 if(tangentOnly){
  for(const index of[15,16,17]){const segment=Math.floor(index/8),j=index%8,t=j/8,z0=T.MathUtils.lerp(oldZ[segment],oldZ[segment+1],t),z1=T.MathUtils.lerp(target[segment].z,target[segment+1].z,t);nodes.push({x:T.MathUtils.lerp(z0,z1,q),y:T.MathUtils.lerp(baseHeightAt(x,z0),leftProfileValue(target,z1),q)});}
  return{shoulderH:target[2].h,shoulderSlope:T.MathUtils.lerp(monotoneTangents(nodes,'y')[1],-.6,q)};
 }
 for(let segment=0;segment<5;segment++)for(let j=0;j<8;j++){const t=j/8,z0=T.MathUtils.lerp(oldZ[segment],oldZ[segment+1],t),z1=T.MathUtils.lerp(target[segment].z,target[segment+1].z,t);nodes.push({x:T.MathUtils.lerp(z0,z1,q),y:T.MathUtils.lerp(baseHeightAt(x,z0),leftProfileValue(target,z1),q)});}
 nodes.push({x:bankZ,y:bankH});const slopes=monotoneTangents(nodes,'y');slopes[0]=joinM;slopes[8]=0;slopes[40]=bankM;
 // Preserve the nonzero shoulder tangent; only actual crest/valley extrema
 // have zero tangents. The intermediate shoulder is not another bright rim.
 slopes[16]=T.MathUtils.lerp(slopes[16],-.6,q);
 return{nodes,slopes,joinZ,bankZ,q,target};
}
function leftOccludedRow(x){
 const reference=buildLeftOccludedRow(x,leftReferenceFrontCurve,null,true);if(!reference)return null;
 const row=buildLeftOccludedRow(x,leftFrontCurve,reference.shoulderH);
 // Keep the accepted upper shoulder and its C1 end tangent exactly. Only
 // the following valley/front segment follows the newly authored lower arc.
 row.slopes[16]=reference.shoulderSlope;return row;
}
const LEFT_OCCLUDED_MIN=-177.5,LEFT_OCCLUDED_MAX=25,LEFT_OCCLUDED_COUNT=4609,LEFT_OCCLUDED_STEP=(LEFT_OCCLUDED_MAX-LEFT_OCCLUDED_MIN)/(LEFT_OCCLUDED_COUNT-1);
const leftOccludedRows=await terrainRows(LEFT_OCCLUDED_COUNT,(_,i)=>leftOccludedRow(LEFT_OCCLUDED_MIN+i*LEFT_OCCLUDED_STEP));
function leftOccludedHeightAt(x,z,existing){
 if(x<=LEFT_OCCLUDED_MIN||x>=LEFT_OCCLUDED_MAX)return existing;
 const f=(x-LEFT_OCCLUDED_MIN)/LEFT_OCCLUDED_STEP,i=Math.min(LEFT_OCCLUDED_COUNT-2,Math.floor(f)),a=leftOccludedRows[i],b=leftOccludedRows[i+1];if(!a||!b)return existing;const t=f-i,joinZ=T.MathUtils.lerp(a.joinZ,b.joinZ,t),bankZ=T.MathUtils.lerp(a.bankZ,b.bankZ,t);if(z<=joinZ||z>=bankZ)return existing;
 let k=0;while(k<39&&T.MathUtils.lerp(a.nodes[k+1].x,b.nodes[k+1].x,t)<z)k++;
 const p=a.nodes[k],q=a.nodes[k+1],r=b.nodes[k],s=b.nodes[k+1];return axisHermite(z,T.MathUtils.lerp(p.x,r.x,t),T.MathUtils.lerp(p.y,r.y,t),T.MathUtils.lerp(a.slopes[k],b.slopes[k],t),T.MathUtils.lerp(q.x,s.x,t),T.MathUtils.lerp(q.y,s.y,t),T.MathUtils.lerp(a.slopes[k+1],b.slopes[k+1],t));
}


function authoredHeightAt(x,z){return leftOccludedHeightAt(x,z,axisHeightAt(x,z,baseHeightAt(x,z)));}
// A finite world-X/Z continuation behind the protected initial foreground.
// The original radial chart is retained through s58. This new chart has a
// fixed X extent and never converges at the original camera's z85 position.
const NEAR_WORLD_MIN=-320,NEAR_WORLD_MAX=320,NEAR_WORLD_COUNT=4097;
const nearWorldStep=(NEAR_WORLD_MAX-NEAR_WORLD_MIN)/(NEAR_WORLD_COUNT-1);
function nearWorldJoinZ(x){
 const join=foregroundCrestDepth(x)*(40/36);
 let low=-5,high=5;
 for(let i=0;i<36;i++){const u=(low+high)/2,p=u*(85-frontBankDepth(u)-join);if(p<x)low=u;else high=u;}
 return frontBankDepth((low+high)/2)+join;
}
function nearWorldValley(x,z){
 // Authored meadow ridges behind the first camera. The protected shore and
 // near crest are unchanged; retreat reveals real hills rather than a floor.
 const rolls=[
  smooth(50,85,z)*13*Math.exp(-(((x+55)/90)**2+((z-55)/32)**2)),
  smooth(50,85,z)*16*Math.exp(-(((x-90)/90)**2+((z-75)/25)**2)),
  (35+12*bell((x-80)/45)+12*bell((x+80)/45))*Math.exp(-(((x+5)/200)**2+((z-110)/(26+46*smooth(110,140,z)))**2)),
  35.5*Math.exp(-(((x+18)/32)**2+((z-140)/27)**2)),
  32.5*Math.exp(-(((x-17)/25)**2+((z-155)/28)**2)),
  31*Math.exp(-(((x)/36)**2+((z-150)/23)**2))
 ];
 let h=0;for(const [i,roll] of rolls.entries())h=union(h,roll,i>2?6:3,0);
 return WATER_LEVEL+.5+h;
}
const nearWorldRows=await terrainRows(NEAR_WORLD_COUNT,(_,i)=>{
 const x=NEAR_WORLD_MIN+i*nearWorldStep,z=nearWorldJoinZ(x),e=.05;
 return{z,H:authoredHeightAt(x,z),D:(authoredHeightAt(x,z+e)-authoredHeightAt(x,z-e))/(2*e)};
});
function nearWorldSample(x){
 const f=(x-NEAR_WORLD_MIN)/nearWorldStep,i=Math.min(NEAR_WORLD_COUNT-2,Math.max(0,Math.floor(f))),a=nearWorldRows[i],b=nearWorldRows[i+1],t=T.MathUtils.clamp(f-i,0,1);
 return{z:T.MathUtils.lerp(a.z,b.z,t),H:T.MathUtils.lerp(a.H,b.H,t),D:T.MathUtils.lerp(a.D,b.D,t)};
}
function nearWorldContinuation(x,z,existing){
 if(x<=NEAR_WORLD_MIN||x>=NEAR_WORLD_MAX||z>=380)return existing;
 const row=nearWorldSample(x),t=z-row.z;if(t<=0)return existing;
 // Continue the crest in fixed world X/Z. Its broad camera-facing half
 // no longer shrinks radially toward the first camera position.
 const floor=WATER_LEVEL+.8,amplitude=Math.max(.01,row.H-floor);
 const rate=-row.D/amplitude;
 // Preserve the exact join height and derivative, then relax the inherited
 // steep initial grade rather than extending it exponentially all downhill.
 const depthScale=foregroundCrestDepth(x)/36;
 const relaxedDistance=8*depthScale*(-Math.expm1(-t/(8*depthScale)));
 const h=floor+amplitude*Math.exp(-rate*relaxedDistance-(t/(35*depthScale))**2);
 const meadow=nearWorldValley(x,z);
 const continued=union(h,meadow,5,WATER_LEVEL+.5);
 // Two metres preserve exact value/tangent of the existing field even with
 // the small interpolation error of the immutable world-X lookup.
 const weight=smooth(0,2,t)*(1-smooth(220,320,Math.abs(x)))*(1-smooth(320,380,z));
 return T.MathUtils.lerp(existing,continued,weight);
}
function greenRootBaseHeight(x,z){return innerRearHeight(x,z,nearWorldContinuation(x,z,authoredHeightAt(x,z)));}
function unsculptedHeightAt(x,z){return greenRootCapHeight(x,z,greenRootBaseHeight(x,z));}


export function normalAt(x,z){const e=.2;return new T.Vector3(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize()}
export function surfacePoint(px,py){const d=ray(px,py),p=new T.Vector3();let a=1,b=1200;for(let t=1;t<1200;t+=2){p.copy(referenceCamera.position).addScaledVector(d,t);if(p.y<=heightAt(p.x,p.z)){b=t;a=t-2;break}}for(let i=0;i<18;i++){const t=(a+b)/2;p.copy(referenceCamera.position).addScaledVector(d,t);if(p.y>heightAt(p.x,p.z))a=t;else b=t}return referenceCamera.position.clone().addScaledVector(d,b)}
function* buildTerrainGeometry(){
 const xs=[],zs=[];for(let x=-1084;x<=700;x+=Math.abs(x)<240?1.1:3)xs.push(x);for(let z=-1076;z<=390;z+=z> -250&&z<130?.8:z> -440?1.4:4)zs.push(z);
 const nx=xs.length,nz=zs.length,p=new Float32Array(nx*nz*3),normals=new Float32Array(p.length),shore=new Float32Array(nx*nz),indices=new Uint32Array((nx-1)*(nz-1)*6);
 let index=0;
 for(let j=0;j<nz;j++){
  // Preserve the arithmetic/order while allowing UI input and cancellation.
  yield;
  for(let i=0;i<nx;i++){if(i%64===0)yield;const x=xs[i],z=zs[j],k=j*nx+i,n=normalAt(x,z);p.set([x,heightAt(x,z),z],k*3);normals.set(n.toArray(),k*3);shore[k]=shoreDistance(x,z);if(i<nx-1&&j<nz-1){const a=k,b=k+nx;indices[index++]=a;indices[index++]=b;indices[index++]=a+1;indices[index++]=a+1;indices[index++]=b;indices[index++]=b+1;}}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.setAttribute('aShore',new T.BufferAttribute(shore,1));g.setIndex(new T.BufferAttribute(indices,1));return g;
}
export function createTerrainGeometry(){return finishBuild(buildTerrainGeometry());}
export function createTerrainGeometryAsync(scheduling){return finishBuildAsync(buildTerrainGeometry(),{timerYieldMs:16,...scheduling});}

export function rearMeadowOwnerAt(x,z){
 if(x<=-155||x>=5||z<=-420||z>=-275)return 0;
 const base=-80*smooth(440,760,-z);let rear=base,other=base+.5;
 for(let i=0;i<ridges.length;i++){
  const r=ridges[i],sample=ridgeSample(r,x),depth=z-sample[1];
  const width=T.MathUtils.lerp(sample[2],Math.min(sample[2],r.frontWidth*sample[3]),smooth(-12,12,depth));
  const h=WATER_LEVEL+base+(sample[0]-base)*bell(depth/width);
  if(i===2)rear=h;else other=Math.max(other,h);
 }
 rear=rearContinuousFold(x,z,rear);
 const geography=smooth(-145,-105,x)*(1-smooth(-40,-5,x))*smooth(-420,-380,z);
 other=Math.max(other,rearRootMoundHeight(x,z)+.2);
 return geography*smooth(0,3,rear-other);
}

// Rear inner crest: a visible inner crest must have its own valley,
// rather than lie below the old broad rear surface. All coordinates are world
// space after authoring; this is a genuine C1 section, never a normal mask.
// Fixed authored X/Y/Z values from the reviewed 3D reconstruction.
// Corresponding reference marks:410/362,430/347,455/330,476/324,494/332,515/347,536/365,550/376.
const innerRearPoints=[[-105.32844151312081,33.794404826774816,-313],[-96.70188541949551,40.68382038881465,-315.24324993407885],[-86.04670980203605,48.62774133915724,-319.31492490970527],[-76.65088556670068,51.48864714526548,-321.3009204821506],[-67.75464604910296,47.67350049039123,-318.40168657046553],[-57.34976240231969,40.670324056588655,-313.7768874890672],[-47.16136618039755,32.46532829241792,-309.1029298385278],[-40.52593102443657,27.544105905397586,-306.3050859665958]].map(([x,y,z])=>({x,y,z,width:1}));
const innerRearCurve={points:innerRearPoints,tangents:{y:monotoneTangents(innerRearPoints,'y'),z:monotoneTangents(innerRearPoints,'z'),width:monotoneTangents(innerRearPoints,'width')}};
const innerRearMin=-120,innerRearMax=-44,innerRearCount=1025;
const innerRearRows=await terrainRows(innerRearCount,(_,i)=>{
 const x=T.MathUtils.lerp(innerRearMin,innerRearMax,i/(innerRearCount-1)),c=[...ridgeSample(innerRearCurve,x)],rear=[...ridgeSample(ridges[2],x)],crestZ=c[1],crestH=c[0];
 const joinZ=rear[1]+2,frontZ=Math.max(crestZ+3,Math.min(crestZ+10,-312)),valleyZ=crestZ-6;
 const e=.05,H=z=>baseHeightAt(x,z),D=z=>(H(z+e)-H(z-e))/(2*e);
 return{x,joinZ,joinH:H(joinZ),joinD:D(joinZ),valleyZ,valleyH:crestH-1,crestZ,crestH,frontZ,frontH:H(frontZ),frontD:D(frontZ),weight:smooth(-120,-95,x)*(1-smooth(-55,-44,x))};
});
function innerRearSample(x){
 if(x<=innerRearMin||x>=innerRearMax)return null;
 const f=(x-innerRearMin)/(innerRearMax-innerRearMin)*(innerRearCount-1),i=Math.min(innerRearCount-2,Math.floor(f)),a=innerRearRows[i],b=innerRearRows[i+1],r={};for(const k of Object.keys(a))r[k]=T.MathUtils.lerp(a[k],b[k],f-i);return r;
}
function innerRearHeight(x,z,existing){
 const r=innerRearSample(x);if(!r||z<=r.joinZ||z>=r.frontZ)return existing;
 let h;
 if(z<r.valleyZ)h=axisHermite(z,r.joinZ,r.joinH,r.joinD,r.valleyZ,r.valleyH,0);
 else if(z<r.crestZ)h=axisHermite(z,r.valleyZ,r.valleyH,0,r.crestZ,r.crestH,0);
 else h=axisHermite(z,r.crestZ,r.crestH,0,r.frontZ,r.frontH,r.frontD);
 return T.MathUtils.lerp(existing,h,r.weight);
}



// Isolated rear-root geometry. The root cap is a genuine C1 terrain section,
// bounded between the existing inner gold crest and the foreground ridge.
// Its authored control points follow fixed world rays only at construction;
// runtime terrain samples use world X/Z and do not read a reference bitmap.
const greenRootPoints=[
 [410,350,-311],[430,356,-311],[450,362,-311],[455,361,-311],[465,358,-311],[478,357,-310.92033308973043],
 [490,358,-308],[505,360,-305],[520,365,-297],[540,373,-287],[550,382,-284]
].map(([px,py,z])=>{const p=atZ(px,py,z);return{x:p.x,y:p.y,z,width:1};});
const greenRootCurve={points:greenRootPoints,tangents:{y:monotoneTangents(greenRootPoints,'y'),z:monotoneTangents(greenRootPoints,'z'),width:monotoneTangents(greenRootPoints,'width')}};
const greenRootMin=-120,greenRootMax=-40,greenRootCount=1361;
const greenRootRows=await terrainRows(greenRootCount,(_,i)=>{
 const x=T.MathUtils.lerp(greenRootMin,greenRootMax,i/(greenRootCount-1)),c=[...ridgeSample(greenRootCurve,x)],r=innerRearSample(x);
 const rootZ=c[1],rootH=c[0],joinZ=Math.min(rootZ-4,r?.crestZ??rootZ-10),valleyZ=rootZ-Math.min(3.5,(rootZ-joinZ)*.45),peakZ=rootZ-1;
 let frontZ=Math.max(rootZ+8,ridgeSample(ridges[3],x)[1]+14);
 const H=z=>greenRootBaseHeight(x,z),e=.025,D=z=>(H(z+e)-H(z-e))/(2*e);
 // Choose a C1 front join whose cubic is monotone. Preserve the existing
 // boundary derivative rather than flattening the face into a linear ramp.
 const acceptable=z=>{const slope=(H(z)-rootH)/(z-rootZ),a=-.3/slope,b=D(z)/slope;return slope<0&&a>=0&&a<=3&&b>=0&&b<=3;};
 if(!acceptable(frontZ)){const initial=frontZ;for(let step=.5;step<=24;step+=.5){if(acceptable(initial+step)){let lo=initial+step-.5,hi=initial+step;for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(acceptable(mid))hi=mid;else lo=mid;}frontZ=hi;break;}}}

 return{x,joinZ,joinH:H(joinZ),joinD:D(joinZ),valleyZ,valleyH:rootH-.55,peakZ,peakH:rootH+.15,rootZ,rootH,frontZ,frontH:H(frontZ),frontD:D(frontZ),weight:smooth(-110,-86,x)*(1-smooth(-54,-44,x))};
});
function greenRootSample(x){
 if(x<=greenRootMin||x>=greenRootMax)return null;
 const f=(x-greenRootMin)/(greenRootMax-greenRootMin)*(greenRootCount-1),i=Math.min(greenRootCount-2,Math.floor(f)),a=greenRootRows[i],b=greenRootRows[i+1],r={};
 for(const k of Object.keys(a))r[k]=T.MathUtils.lerp(a[k],b[k],f-i);return r;
}
function greenRootDescending(z,a,h0,m0,b,h1,m1){
 return axisHermite(z,a,h0,m0,b,h1,m1);
}
function greenRootCapHeight(x,z,existing){
 const r=greenRootSample(x);if(!r||z<=r.joinZ||z>=r.frontZ)return existing;
 let h;
 if(z<r.valleyZ)h=greenRootDescending(z,r.joinZ,r.joinH,r.joinD,r.valleyZ,r.valleyH,0);
 else if(z<r.peakZ)h=axisHermite(z,r.valleyZ,r.valleyH,0,r.peakZ,r.peakH,0);
 else if(z<r.rootZ)h=axisHermite(z,r.peakZ,r.peakH,0,r.rootZ,r.rootH,-.3);
 else h=greenRootDescending(z,r.rootZ,r.rootH,-.3,r.frontZ,r.frontH,r.frontD);
 return T.MathUtils.lerp(existing,h,r.weight);
}


// Bounded sculpt smoothing of the dry entrance. Operates on actual terrain
// heights in world units, never on the reference image or rendered colours.
const sculptMinX=-177,sculptMinZ=-245,sculptStep=.5,sculptNX=219,sculptNZ=221;
const sculptData=await finishBuildAsync((function*(){
const sculptOriginal=new Float64Array(sculptNX*sculptNZ),sculptMask=new Float64Array(sculptOriginal.length);
let values=new Float64Array(sculptOriginal.length),sculptNext=new Float64Array(sculptOriginal.length);
for(let j=0;j<sculptNZ;j++){
yield;
for(let i=0;i<sculptNX;i++){
 const x=sculptMinX+i*sculptStep,z=sculptMinZ+j*sculptStep,k=j*sculptNX+i;
 sculptOriginal[k]=values[k]=unsculptedHeightAt(x,z);
 const upperZ=ridgeSample(ridges[5],x)[1];
 sculptMask[k]=smooth(-165,-151,x)*(1-smooth(-98,-78,x))*smooth(upperZ+1,upperZ+8,z)*(1-smooth(-155,-145,z))*smooth(.05,2,shoreDistance(x,z));
}}
// Regularized world-space surface fairing: keep the crest, shore and outer
// boundary fixed. A6m physical neighbourhood removes the compressed fold
// without averaging dry land across the lake. Store only displacement so
// untouched analytical heights and the exact shoreline remain authoritative.
const sculptWX=1/(sculptStep*sculptStep),sculptWZ=sculptWX/(2.1*2.1);
sculptNext.set(sculptOriginal);
const active=new Uint32Array(sculptOriginal.length);let activeCount=0;
for(let j=1;j<sculptNZ-1;j++)for(let i=1;i<sculptNX-1;i++){
 const k=j*sculptNX+i;if(36*sculptMask[k]>0)active[activeCount++]=k;
}
for(let iteration=0;iteration<600;iteration++){
 yield;
 for(let a=0;a<activeCount;a++){
  const k=active[a],L2=36*sculptMask[k];
  const sum=sculptWX*(values[k-1]+values[k+1])+sculptWZ*(values[k-sculptNX]+values[k+sculptNX]);
  sculptNext[k]=(sculptOriginal[k]+L2*sum)/(1+2*L2*(sculptWX+sculptWZ));
 }
 const swap=values;values=sculptNext;sculptNext=swap;
}
for(let k=0;k<values.length;k++)values[k]-=sculptOriginal[k];
return values;
})());
function sculptCubic(a,b,c,d,t){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
function sculptSample(x,z){
 const fx=(x-sculptMinX)/sculptStep,fz=(z-sculptMinZ)/sculptStep,i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;
 const at=(a,b)=>sculptData[T.MathUtils.clamp(b,0,sculptNZ-1)*sculptNX+T.MathUtils.clamp(a,0,sculptNX-1)];
 const row=b=>sculptCubic(at(i-1,b),at(i,b),at(i+1,b),at(i+2,b),tx);
 return sculptCubic(row(j-1),row(j),row(j+1),row(j+2),tz);
}
// Bounded4m physical fairing of the compressed right-hand folds. The
// lake edge and main tree-bearing ridge are outside its moving region.
const rightSculptMinX=15,rightSculptMinZ=-242,rightSculptStep=.5,rightSculptNX=251,rightSculptNZ=139;
const rightSculptData=await finishBuildAsync((function*(){
const rightSculptOriginal=new Float64Array(rightSculptNX*rightSculptNZ),rightSculptMask=new Float64Array(rightSculptOriginal.length);
let values=new Float64Array(rightSculptOriginal.length),rightSculptNext=new Float64Array(rightSculptOriginal.length);
for(let j=0;j<rightSculptNZ;j++){
yield;
for(let i=0;i<rightSculptNX;i++){
 const x=rightSculptMinX+i*rightSculptStep,z=rightSculptMinZ+j*rightSculptStep,k=j*rightSculptNX+i;
 rightSculptOriginal[k]=values[k]=unsculptedHeightAt(x,z);
 const upperZ=ridgeSample(ridges[5],x)[1];
 rightSculptMask[k]=smooth(20,42,x)*(1-smooth(115,134,x))*smooth(-239,-226,z)*(1-smooth(-190,-176,z))*smooth(2,8,shoreDistance(x,z));
}}
// Regularized world-space surface fairing: keep the crest, shore and outer
// boundary fixed. A4m physical neighbourhood removes the compressed fold
// without averaging dry land across the lake. Store only displacement so
// untouched analytical heights and the exact shoreline remain authoritative.
const rightSculptWX=1/(rightSculptStep*rightSculptStep),rightSculptWZ=rightSculptWX/(2.1*2.1);
rightSculptNext.set(rightSculptOriginal);
const active=new Uint32Array(rightSculptOriginal.length);let activeCount=0;
for(let j=1;j<rightSculptNZ-1;j++)for(let i=1;i<rightSculptNX-1;i++){
 const k=j*rightSculptNX+i;if(16*rightSculptMask[k]>0)active[activeCount++]=k;
}
for(let iteration=0;iteration<400;iteration++){
 yield;
 for(let a=0;a<activeCount;a++){
  const k=active[a],L2=16*rightSculptMask[k];
  const sum=rightSculptWX*(values[k-1]+values[k+1])+rightSculptWZ*(values[k-rightSculptNX]+values[k+rightSculptNX]);
  rightSculptNext[k]=(rightSculptOriginal[k]+L2*sum)/(1+2*L2*(rightSculptWX+rightSculptWZ));
 }
 const swap=values;values=rightSculptNext;rightSculptNext=swap;
}
for(let k=0;k<values.length;k++)values[k]-=rightSculptOriginal[k];
return values;
})());
function rightSculptCubic(a,b,c,d,t){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
function rightSculptSample(x,z){
 const fx=(x-rightSculptMinX)/rightSculptStep,fz=(z-rightSculptMinZ)/rightSculptStep,i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;
 const at=(a,b)=>rightSculptData[T.MathUtils.clamp(b,0,rightSculptNZ-1)*rightSculptNX+T.MathUtils.clamp(a,0,rightSculptNX-1)];
 const row=b=>rightSculptCubic(at(i-1,b),at(i,b),at(i+1,b),at(i+2,b),tx);
 return rightSculptCubic(row(j-1),row(j),row(j+1),row(j+2),tz);
}
// Bounded6m physical fairing of the east bay side slope. The
// lake edge and main tree-bearing ridge are outside its moving region.
const eastSculptMinX=155,eastSculptMinZ=-200,eastSculptStep=.5,eastSculptNX=191,eastSculptNZ=251;
const eastSculptData=await finishBuildAsync((function*(){
const eastSculptOriginal=new Float64Array(eastSculptNX*eastSculptNZ),eastSculptMask=new Float64Array(eastSculptOriginal.length);
let values=new Float64Array(eastSculptOriginal.length),eastSculptNext=new Float64Array(eastSculptOriginal.length);
for(let j=0;j<eastSculptNZ;j++){
yield;
for(let i=0;i<eastSculptNX;i++){
 const x=eastSculptMinX+i*eastSculptStep,z=eastSculptMinZ+j*eastSculptStep,k=j*eastSculptNX+i;
 eastSculptOriginal[k]=values[k]=unsculptedHeightAt(x,z);
 const upperZ=ridgeSample(ridges[5],x)[1];
 eastSculptMask[k]=smooth(160,180,x)*(1-smooth(220,245,x))*smooth(-195,-175,z)*(1-smooth(-100,-80,z))*smooth(2,10,shoreDistance(x,z));
}}
// Regularized world-space surface fairing: keep the crest, shore and outer
// boundary fixed. A4m physical neighbourhood removes the compressed fold
// without averaging dry land across the lake. Store only displacement so
// untouched analytical heights and the exact shoreline remain authoritative.
const eastSculptWX=1/(eastSculptStep*eastSculptStep),eastSculptWZ=eastSculptWX/(2.1*2.1);
eastSculptNext.set(eastSculptOriginal);
const active=new Uint32Array(eastSculptOriginal.length);let activeCount=0;
for(let j=1;j<eastSculptNZ-1;j++)for(let i=1;i<eastSculptNX-1;i++){
 const k=j*eastSculptNX+i;if(36*eastSculptMask[k]>0)active[activeCount++]=k;
}
for(let iteration=0;iteration<400;iteration++){
 yield;
 for(let a=0;a<activeCount;a++){
  const k=active[a],L2=36*eastSculptMask[k];
  const sum=eastSculptWX*(values[k-1]+values[k+1])+eastSculptWZ*(values[k-eastSculptNX]+values[k+eastSculptNX]);
  eastSculptNext[k]=(eastSculptOriginal[k]+L2*sum)/(1+2*L2*(eastSculptWX+eastSculptWZ));
 }
 const swap=values;values=eastSculptNext;eastSculptNext=swap;
}
for(let k=0;k<values.length;k++)values[k]-=eastSculptOriginal[k];
return values;
})());
function eastSculptCubic(a,b,c,d,t){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
function eastSculptSample(x,z){
 const fx=(x-eastSculptMinX)/eastSculptStep,fz=(z-eastSculptMinZ)/eastSculptStep,i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;
 const at=(a,b)=>eastSculptData[T.MathUtils.clamp(b,0,eastSculptNZ-1)*eastSculptNX+T.MathUtils.clamp(a,0,eastSculptNX-1)];
 const row=b=>eastSculptCubic(at(i-1,b),at(i,b),at(i+1,b),at(i+2,b),tx);
 return eastSculptCubic(row(j-1),row(j),row(j+1),row(j+2),tz);
}
// Bounded6m physical fairing of the west bay side slope at the western near-bank join. The
// lake edge and main tree-bearing ridge are outside its moving region.
const westSculptMinX=-165,westSculptMinZ=-120,westSculptStep=.5,westSculptNX=171,westSculptNZ=181;
const westSculptData=await finishBuildAsync((function*(){
const westSculptOriginal=new Float64Array(westSculptNX*westSculptNZ),westSculptMask=new Float64Array(westSculptOriginal.length);
let values=new Float64Array(westSculptOriginal.length),westSculptNext=new Float64Array(westSculptOriginal.length);
for(let j=0;j<westSculptNZ;j++){
yield;
for(let i=0;i<westSculptNX;i++){
 const x=westSculptMinX+i*westSculptStep,z=westSculptMinZ+j*westSculptStep,k=j*westSculptNX+i;
 westSculptOriginal[k]=values[k]=unsculptedHeightAt(x,z);
 westSculptMask[k]=smooth(-160,-140,x)*(1-smooth(-100,-85,x))*smooth(-115,-95,z)*(1-smooth(-45,-35,z))*smooth(2,10,shoreDistance(x,z));
}}
// Regularized world-space surface fairing: keep the crest, shore and outer
// boundary fixed. A4m physical neighbourhood removes the compressed fold
// without averaging dry land across the lake. Store only displacement so
// untouched analytical heights and the exact shoreline remain authoritative.
const westSculptWX=1/(westSculptStep*westSculptStep),westSculptWZ=westSculptWX/(2.1*2.1);
westSculptNext.set(westSculptOriginal);
const active=new Uint32Array(westSculptOriginal.length);let activeCount=0;
for(let j=1;j<westSculptNZ-1;j++)for(let i=1;i<westSculptNX-1;i++){
 const k=j*westSculptNX+i;if(36*westSculptMask[k]>0)active[activeCount++]=k;
}
for(let iteration=0;iteration<400;iteration++){
 yield;
 for(let a=0;a<activeCount;a++){
  const k=active[a],L2=36*westSculptMask[k];
  const sum=westSculptWX*(values[k-1]+values[k+1])+westSculptWZ*(values[k-westSculptNX]+values[k+westSculptNX]);
  westSculptNext[k]=(westSculptOriginal[k]+L2*sum)/(1+2*L2*(westSculptWX+westSculptWZ));
 }
 const swap=values;values=westSculptNext;westSculptNext=swap;
}
for(let k=0;k<values.length;k++)values[k]-=westSculptOriginal[k];
return values;
})());
function westSculptCubic(a,b,c,d,t){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
function westSculptSample(x,z){
 const fx=(x-westSculptMinX)/westSculptStep,fz=(z-westSculptMinZ)/westSculptStep,i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;
 const at=(a,b)=>westSculptData[T.MathUtils.clamp(b,0,westSculptNZ-1)*westSculptNX+T.MathUtils.clamp(a,0,westSculptNX-1)];
 const row=b=>westSculptCubic(at(i-1,b),at(i,b),at(i+1,b),at(i+2,b),tx);
 return westSculptCubic(row(j-1),row(j),row(j+1),row(j+2),tz);
}
export function heightAt(x,z){
 const existing=unsculptedHeightAt(x,z);
 let h=existing;
 if(x>-165&&x<-78&&z>-235&&z<-145)h+=sculptSample(x,z)*smooth(0,.8,shoreDistance(x,z));
 if(x>20&&x<134&&z>-239&&z<-176)h+=rightSculptSample(x,z)*smooth(2,5,shoreDistance(x,z));
 if(x>160&&x<245&&z>-195&&z<-80)h+=eastSculptSample(x,z)*smooth(2,5,shoreDistance(x,z));
 if(x>-160&&x<-85&&z>-115&&z<-35)h+=westSculptSample(x,z)*smooth(2,5,shoreDistance(x,z));
 // Round the left side of the near crest rather than flattening its centre.
  // The compact support starts behind the entry eye and avoids tree roots.
  const shoulderMask=smooth(-37,-27,x)*(1-smooth(23,33,x))*smooth(85,93,z)*(1-smooth(140,153,z));
  h+=2.8*shoulderMask*Math.exp(-(((x+21)/13)**2+((z-110)/20)**2));
  return h;
}
