// Sample the same triangles the renderer draws, in authored terrain metres.
// Terrain is a static rectangular grid with an a,b,a+1 / a+1,b,b+1 diagonal.
// This replaces procedural re-evaluation only for canopy occlusion queries.
export function createTerrainSampler(geometry) {
  if(geometry.userData.adaptiveTerrain)return geometry.userData.adaptiveTerrain.heightAt;
  const p=geometry.getAttribute('position'),index=geometry.index;
  let nx=1;while(nx<p.count && p.getZ(nx)===p.getZ(0))nx++;
  const nz=p.count/nx;
  if(nx<2||nz<2||!Number.isInteger(nz)||!index||index.count!==(nx-1)*(nz-1)*6)throw new Error('Expected rectangular indexed terrain');
  const xs=Float32Array.from({length:nx},(_,i)=>p.getX(i));
  const zs=Float32Array.from({length:nz},(_,j)=>p.getZ(j*nx));
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const a=j*nx+i,b=a+nx,k=(j*(nx-1)+i)*6;
    const expected=[a,b,a+1,a+1,b,b+1];
    for(let n=0;n<6;n++)if(index.getX(k+n)!==expected[n])throw new Error('Unexpected terrain diagonal');
  }
  function interval(axis,v){let lo=0,hi=axis.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(axis[m]<=v)lo=m;else hi=m}return lo}
  const stats={queries:0,outside:0,nx,nz};
  function heightAt(x,z){
    stats.queries++;
    // There is no rendered terrain beyond these bounds. Do not clamp a ray
    // to the boundary or invent an off-mesh occluder.
    if(x<xs[0]||x>xs[nx-1]||z<zs[0]||z>zs[nz-1]){stats.outside++;return -Infinity}
    const i=interval(xs,x),j=interval(zs,z),a=j*nx+i,b=a+nx;
    const u=(x-xs[i])/(xs[i+1]-xs[i]),v=(z-zs[j])/(zs[j+1]-zs[j]);
    return u+v<=1 ? p.getY(a)*(1-u-v)+p.getY(a+1)*u+p.getY(b)*v
      : p.getY(b+1)*(u+v-1)+p.getY(b)*(1-u)+p.getY(a+1)*(1-v);
  }
  heightAt.stats=stats;return heightAt;
}
