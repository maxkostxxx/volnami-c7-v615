import {finishBuild, finishBuildAsync} from './cooperative-build.js';
import * as T from 'three';

// Static terrain tessellation: retain the dense grid around curved folds,
// coarsen planar areas, and stitch every shared boundary with original vertices.
// Positions, shading normals and shore coordinates remain the authored data.
function* buildAdaptiveTerrain(geometry,{heightTolerance=.03,normalTolerance=.015}={}){
 const started=performance.now(),p=geometry.attributes.position,n=geometry.attributes.normal;
 let nx=1;while(nx<p.count&&p.getZ(nx)===p.getZ(0))nx++;
 const nz=p.count/nx;if(!Number.isInteger(nz))throw Error('Expected rectangular terrain');
 const xs=Float32Array.from({length:nx},(_,i)=>p.getX(i)),zs=Float32Array.from({length:nz},(_,j)=>p.getZ(j*nx));
 const leaves=[],rows=new Map(),cols=new Map();
 const cut=(map,k,v)=>{let set=map.get(k);if(!set){set=new Set();map.set(k,set)}set.add(v)};
 function add(i0,j0,i1,j1){const leaf={i0,j0,i1,j1};leaves.push(leaf);for(const i of[i0,i1])for(const j of[j0,j1]){cut(rows,j,i);cut(cols,i,j)}}
 function fits(i0,j0,i1,j1){
  const a=j0*nx+i0,b=j1*nx+i0,c=j0*nx+i1,d=j1*nx+i1;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const u=(xs[i]-xs[i0])/(xs[i1]-xs[i0]),v=(zs[j]-zs[j0])/(zs[j1]-zs[j0]),k=j*nx+i;
   const ids=u+v<=1?[a,c,b]:[d,b,c],w=u+v<=1?[1-u-v,u,v]:[u+v-1,1-u,1-v];
   const h=w[0]*p.getY(ids[0])+w[1]*p.getY(ids[1])+w[2]*p.getY(ids[2]);
   if(Math.abs(h-p.getY(k))>heightTolerance)return false;
   let dx=w[0]*n.getX(ids[0])+w[1]*n.getX(ids[1])+w[2]*n.getX(ids[2]);
   let dy=w[0]*n.getY(ids[0])+w[1]*n.getY(ids[1])+w[2]*n.getY(ids[2]);
   let dz=w[0]*n.getZ(ids[0])+w[1]*n.getZ(ids[1])+w[2]*n.getZ(ids[2]);
   const len=Math.hypot(dx,dy,dz);dx=dx/len-n.getX(k);dy=dy/len-n.getY(k);dz=dz/len-n.getZ(k);
   if(dx*dx+dy*dy+dz*dz>normalTolerance*normalTolerance)return false;
  }return true;
 }
 function divide(i0,j0,i1,j1){
  const w=i1-i0,h=j1-j0;if(w===1&&h===1){add(i0,j0,i1,j1);return}
  // A thin rectangle has no interior grid vertex for a watertight centre fan.
  if(w>1&&h>1&&fits(i0,j0,i1,j1)){add(i0,j0,i1,j1);return}
  const ii=w>1?[i0,Math.floor((i0+i1)/2),i1]:[i0,i1],jj=h>1?[j0,Math.floor((j0+j1)/2),j1]:[j0,j1];
  for(let j=0;j<jj.length-1;j++)for(let i=0;i<ii.length-1;i++)divide(ii[i],jj[j],ii[i+1],jj[j+1]);
 }
 for(let j=0;j<nz-1;j+=32)for(let i=0;i<nx-1;i+=32){divide(i,j,Math.min(i+32,nx-1),Math.min(j+32,nz-1));yield;}
 for(const [k,set]of rows)rows.set(k,[...set].sort((a,b)=>a-b));for(const [k,set]of cols)cols.set(k,[...set].sort((a,b)=>a-b));
 // Shared-boundary cuts are sorted. Visit only this leaf's range; scanning
 // every cut (and copying/reversing whole rows) made startup quadratic.
 function lowerBound(axis,value){let lo=0,hi=axis.length;while(lo<hi){const m=(lo+hi)>>>1;if(axis[m]<value)lo=m+1;else hi=m;}return lo;}
 function upperBound(axis,value){let lo=0,hi=axis.length;while(lo<hi){const m=(lo+hi)>>>1;if(axis[m]<=value)lo=m+1;else hi=m;}return lo;}
 const indices=[],cellLeaf=new Int32Array((nx-1)*(nz-1));
 for(const [id,leaf]of leaves.entries()){
  if(id%64===0)yield;
  const{i0,j0,i1,j1}=leaf;leaf.start=indices.length;
  if(i1-i0===1&&j1-j0===1){const a=j0*nx+i0,b=j1*nx+i0;indices.push(a,b,a+1,a+1,b,b+1)}else{
   const ring=[];
   const left=cols.get(i0),bottom=rows.get(j1),right=cols.get(i1),top=rows.get(j0);
   for(let k=lowerBound(left,j0);k<left.length&&left[k]<j1;k++)ring.push(left[k]*nx+i0);
   for(let k=lowerBound(bottom,i0);k<bottom.length&&bottom[k]<i1;k++)ring.push(j1*nx+bottom[k]);
   for(let k=upperBound(right,j1)-1;k>=0&&right[k]>j0;k--)ring.push(right[k]*nx+i1);
   for(let k=upperBound(top,i1)-1;k>=0&&top[k]>i0;k--)ring.push(j0*nx+top[k]);
   const center=Math.floor((j0+j1)/2)*nx+Math.floor((i0+i1)/2);
   for(let k=0;k<ring.length;k++)indices.push(center,ring[k],ring[(k+1)%ring.length]);
  }
  leaf.end=indices.length;for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++)cellLeaf[j*(nx-1)+i]=id;
 }
 const originalTriangles=geometry.index.count/3;geometry.setIndex(indices);
 function interval(axis,value){let lo=0,hi=axis.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(axis[m]<=value)lo=m;else hi=m}return lo}
 function heightAt(x,z,normalTarget){
  if(x<xs[0]||x>xs[nx-1]||z<zs[0]||z>zs[nz-1])return -Infinity;
  const i=interval(xs,x),j=interval(zs,z),leaf=leaves[cellLeaf[j*(nx-1)+i]];
  for(let k=leaf.start;k<leaf.end;k+=3){
   const a=indices[k],b=indices[k+1],c=indices[k+2],ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c);
   const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
   if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8){
    if(normalTarget){const n=geometry.getAttribute('normal');normalTarget.set(
      u*n.getX(a)+v*n.getX(b)+w*n.getX(c),
      u*n.getY(a)+v*n.getY(b)+w*n.getY(c),
      u*n.getZ(a)+v*n.getZ(b)+w*n.getZ(c)).normalize();}
    return u*p.getY(a)+v*p.getY(b)+w*p.getY(c);
   }
  }
  throw Error('Adaptive terrain triangle not found');
 }
 const stats={originalTriangles,triangles:indices.length/3,leaves:leaves.length,heightTolerance,normalTolerance,buildMilliseconds:performance.now()-started};
 geometry.userData.adaptiveTerrain={
  preparationSampler(){return {xs,zs,cellLeaf,indices:geometry.index.array,positions:p.array,ranges:Uint32Array.from(leaves.flatMap(l=>[l.start,l.end]))};},
  heightAt,normalAt(x,z,target){heightAt(x,z,target);return target;},stats};return geometry;
}

export function adaptTerrain(geometry, options) { return finishBuild(buildAdaptiveTerrain(geometry, options)); }
export function adaptTerrainAsync(geometry, options, scheduling) { return finishBuildAsync(buildAdaptiveTerrain(geometry, options), scheduling); }
