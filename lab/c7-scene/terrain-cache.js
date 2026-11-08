import {fetchBinaryInput,decompressBinaryInput} from './binary-transfer.js';
import * as T from 'three';

// Cache of the regular terrain BEFORE adaptive tessellation. Encoding is
// lossless relative to the stored attributes; manifest.precision declares the
// v602 scalar rounding against the procedural authoring source.
// The original tessellator and its sampler still run unchanged. Every restored
// attribute/index is checked against its baked byte hash before use.
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(v => v.toString(16).padStart(2, '0')).join('');

export function decodeTerrain(payload, meta) {
  if(meta.encoding==='C7TIv001-plane-fixed-point')return decodeIntegerTerrain(payload,meta);
  if (meta.schema !== 1 || meta.encoding !== 'float32-planar-xor-le' || meta.three !== T.REVISION)
    throw Error('Unsupported terrain cache');
  const { nx, nz } = meta;
  if (!Number.isInteger(nx) || !Number.isInteger(nz) || nx < 2 || nz < 2 || nx * nz > 2000000)
    throw Error('Invalid terrain cache dimensions');
  const count = nx * nz, expected = (nx + nz + count * 5) * 4;
  if (payload.byteLength !== expected || meta.bytes !== expected) throw Error('Terrain cache size mismatch');
  const endian = new Uint8Array(new Uint32Array([0x01020304]).buffer);
  if (endian[0] !== 4) throw Error('Terrain cache requires little endian');
  if(meta.transport!==undefined){
    if(meta.transport!=='byteplanes32-v1')throw Error('Unsupported terrain transport');
    const input=new Uint8Array(payload),restored=new Uint8Array(payload.byteLength),words=payload.byteLength/4;
    for(let channel=0;channel<4;channel++)for(let i=0;i<words;i++)restored[i*4+channel]=input[channel*words+i];
    payload=restored.buffer;
  }
  const words = new Uint32Array(payload), floats = new Float32Array(payload);
  const xs = floats.subarray(0, nx), zs = floats.subarray(nx, nx + nz);
  for (const axis of [xs, zs]) for (let i = 0; i < axis.length; i++)
    if (!Number.isFinite(axis[i]) || (i && axis[i] <= axis[i - 1])) throw Error('Invalid terrain cache axis');
  const channels = [], predictor = new Float32Array(1), predictorBits = new Uint32Array(predictor.buffer);
  for (let channel = 0; channel < 5; channel++) {
    const decoded = new Float32Array(count), bits = new Uint32Array(decoded.buffer);
    const offset = nx + nz + channel * count;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      predictor[0] = i && j ? (decoded[k - 1] + decoded[k - nx]) - decoded[k - nx - 1]
        : i ? decoded[k - 1] : j ? decoded[k - nx] : 0;
      bits[k] = words[offset + k] ^ predictorBits[0];
      if (!Number.isFinite(decoded[k])) throw Error('Non-finite cached terrain');
    }
    channels.push(decoded);
  }
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, at = k * 3;
    positions[at] = xs[i]; positions[at + 1] = channels[0][k]; positions[at + 2] = zs[j];
    normals[at] = channels[1][k]; normals[at + 1] = channels[2][k]; normals[at + 2] = channels[3][k];
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  for (let j = 0, k = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + nx;
    indices[k++] = a; indices[k++] = b; indices[k++] = a + 1;
    indices[k++] = a + 1; indices[k++] = b; indices[k++] = b + 1;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setAttribute('aShore', new T.BufferAttribute(channels[4], 1));
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  return geometry;
}

export async function loadTerrainGeometry({ generate, timeoutMs = 1500, signal, inputs } = {}) {
  if (typeof generate !== 'function') throw TypeError('Terrain fallback generator required');
  const started = performance.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  const checkAbort = () => { if (signal?.aborted) throw new DOMException('Terrain preparation aborted', 'AbortError'); };
  signal?.addEventListener('abort', onAbort, { once: true });
  let geometry;
  try {
    checkAbort();
    if (typeof DecompressionStream !== 'function') throw Error('Gzip decompression unavailable');
    const request = async name => {
      if(inputs)return inputs.take(name,controller.signal);
      const response = await fetch(new URL(name, import.meta.url), { signal: controller.signal });
      if (!response.ok) throw Error(`Terrain cache HTTP ${response.status}: ${name}`);
      return response.arrayBuffer();
    };
    const [meta, gzip, source] = await Promise.all([
      request('./terrain-cache/manifest.json').then(b => JSON.parse(new TextDecoder().decode(b))),
      inputs?inputs.takeCompressed('./terrain-cache/geometry.bin.gz',controller.signal):fetchBinaryInput('./terrain-cache/geometry.bin.gz',{signal:controller.signal}),
      request('./terrain.js'),
    ]);
    if (await digest(source) !== meta.sourceSha256 || (gzip.format==='gzip'&&await digest(gzip.bytes) !== meta.gzipSha256))
      throw Error('Stale or damaged terrain cache');
    const payload = await decompressBinaryInput(gzip,{signal:controller.signal});
    if (await digest(payload) !== meta.payloadSha256) throw Error('Terrain cache payload hash mismatch');
    checkAbort();
    geometry = decodeTerrain(payload, meta);
    const actual = Object.fromEntries(await Promise.all([
      ...Object.entries(geometry.attributes).map(async ([name, attribute]) => [name, await digest(attribute.array)]),
      digest(geometry.index.array).then(hash => ['index', hash]),
    ]));
    if (Object.entries(actual).some(([name, hash]) => hash !== meta.geometryHashes[name]))
      throw Error('Restored terrain byte hash mismatch');
    checkAbort();
    geometry.userData.terrainCache = { mode: 'loaded', gzipBytes: gzip.bytes.byteLength, compression: gzip.format,
      milliseconds: performance.now() - started, sourceSha256: meta.sourceSha256 };
    return geometry;
  } catch (error) {
    geometry?.dispose();
    controller.abort();
    // Optional acceleration must never replace the scene with stale geometry.
    checkAbort();
    console.warn('C7 terrain cache fallback:', error.message);
    const fallback = await generate();
    if (signal?.aborted) { fallback.dispose(); checkAbort(); }
    fallback.userData.terrainCache = { mode: 'fallback', reason: error.message,
      milliseconds: performance.now() - started };
    return fallback;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}


// Lossless transport for the v602-and-later rounded regular grid. No geometry
// approximation: x/z Float32 bits and negative-zero bits remain explicit.
export function decodeIntegerTerrain(payload, meta) {
  const {nx,nz}=meta;
  if(meta.schema!==2||meta.encoding!=='C7TIv001-plane-fixed-point'||meta.three!==T.REVISION
    ||!Number.isInteger(nx)||!Number.isInteger(nz)||nx<2||nz<2||nx*nz>2000000)
    throw Error('Unsupported integer terrain cache');
  const count=nx*nz,offset=64+(nx+nz)*4,negativeOffset=offset+count*20;
  const expected=negativeOffset+Math.ceil(count*5/8);
  if(payload.byteLength!==expected||meta.bytes!==expected)throw Error('Integer terrain size mismatch');
  const bytes=new Uint8Array(payload),header=new DataView(payload);
  if(new TextDecoder().decode(bytes.subarray(0,8))!=='C7TIv001'
    ||header.getUint32(8,true)!==nx||header.getUint32(12,true)!==nz||header.getUint32(16,true)!==0)
    throw Error('Invalid integer terrain header');
  if(bytes.subarray(20,64).some(v=>v!==0))throw Error('Unsupported integer terrain flags');
  const axes=[new Float32Array(nx),new Float32Array(nz)];let at=64;
  for(const axis of axes)for(let i=0;i<axis.length;i++,at+=4){
    const value=header.getFloat32(at,true);
    if(!Number.isFinite(value)||(i&&value<=axis[i-1]))throw Error('Invalid integer terrain axis');
    axis[i]=value;
  }
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),shore=new Float32Array(count),values=new Int32Array(count);
  const scales=[4096,4096,4096,4096,1024];
  for(let channel=0;channel<5;channel++){
    const channelOffset=offset+channel*4*count;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i,pred=i&&j?values[k-1]+values[k-nx]-values[k-nx-1]:i?values[k-1]:j?values[k-nx]:0;
      const zigzag=(bytes[channelOffset+k]|bytes[channelOffset+count+k]<<8|bytes[channelOffset+count*2+k]<<16|bytes[channelOffset+count*3+k]<<24)>>>0;
      const integer=pred+((zigzag>>>1)^-(zigzag&1));
      if(integer< -2147483648||integer>2147483647)throw Error('Integer terrain overflow');
      values[k]=integer;
      const bit=channel*count+k,negativeZero=(bytes[negativeOffset+(bit>>3)]>>(bit&7))&1;
      if(negativeZero&&integer!==0)throw Error('Invalid terrain negative zero');
      const value=negativeZero?-0:integer/scales[channel];
      if(channel===0){positions[k*3]=axes[0][i];positions[k*3+1]=value;positions[k*3+2]=axes[1][j];}
      else if(channel<4)normals[k*3+channel-1]=value;
      else shore[k]=value;
    }
  }
  const indices=new Uint32Array((nx-1)*(nz-1)*6);
  for(let j=0,k=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const a=j*nx+i,b=a+nx;
    indices[k++]=a;indices[k++]=b;indices[k++]=a+1;
    indices[k++]=a+1;indices[k++]=b;indices[k++]=b+1;
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
  geometry.setAttribute('aShore',new T.BufferAttribute(shore,1));
  geometry.setIndex(new T.BufferAttribute(indices,1));
  return geometry;
}
