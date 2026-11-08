import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Encode the already rounded regular grid exactly. This function does not
// choose spatial/attribute quality; the authoring bake owns that policy.
export function encodeIntegerTerrain(geometry) {
 const p=geometry.attributes.position,n=geometry.attributes.normal,shore=geometry.attributes.aShore;
 let nx=1;while(nx<p.count&&p.getZ(nx)===p.getZ(0))nx++;
 const nz=p.count/nx,count=p.count;
 if(nx<2||nz<2||!Number.isInteger(nz)||count>2000000)throw Error('Expected bounded rectangular terrain');
 const offset=64+(nx+nz)*4,negativeOffset=offset+count*20;
 const payload=Buffer.alloc(negativeOffset+Math.ceil(count*5/8));
 payload.write('C7TIv001');payload.writeUInt32LE(nx,8);payload.writeUInt32LE(nz,12);
 for(let i=0;i<nx;i++)payload.writeFloatLE(p.getX(i),64+i*4);
 for(let j=0;j<nz;j++)payload.writeFloatLE(p.getZ(j*nx),64+(nx+j)*4);
 const getters=[k=>p.getY(k),k=>n.getX(k),k=>n.getY(k),k=>n.getZ(k),k=>shore.getX(k)],scales=[4096,4096,4096,4096,1024];
 for(let c=0;c<5;c++){
  const values=new Int32Array(count);
  for(let k=0;k<count;k++){
   const value=getters[c](k)*scales[c];
   if(!Number.isSafeInteger(value)||value< -2147483648||value>2147483647)throw Error('Terrain is not exactly representable at the declared precision');
   values[k]=value;
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
   const k=j*nx+i,pred=i&&j?values[k-1]+values[k-nx]-values[k-nx-1]:i?values[k-1]:j?values[k-nx]:0,delta=values[k]-pred;
   if(delta< -2147483648||delta>2147483647)throw Error('Terrain predictor residual overflow');
   const zigzag=((delta<<1)^(delta>>31))>>>0;
   for(let byte=0;byte<4;byte++)payload[offset+(c*4+byte)*count+k]=zigzag>>>(byte*8)&255;
   if(Object.is(getters[c](k),-0)){const bit=c*count+k;payload[negativeOffset+(bit>>3)]|=1<<(bit&7);}
  }
 }
 const gzip=gzipSync(payload,{level:9});
 const geometryHashes=Object.fromEntries([...Object.entries(geometry.attributes).map(([name,a])=>[name,sha(a.array)]),['index',sha(geometry.index.array)]]);
 return{payload,gzip,metadata:{schema:2,encoding:'C7TIv001-plane-fixed-point',nx,nz,bytes:payload.length,gzipBytes:gzip.length,payloadSha256:sha(payload),gzipSha256:sha(gzip),geometryHashes}};
}
