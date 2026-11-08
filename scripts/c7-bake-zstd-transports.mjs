// Exact alternatives for browsers lacking native Brotli decompression.
import fs from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';import{execFileSync}from'node:child_process';
const root=path.resolve(process.argv[2]??'lab/c7-scene'),hash=x=>createHash('sha256').update(x).digest('hex');
const{binaryTransports}=await import(pathToFileURL(path.join(root,'binary-transports.js'))),{ZSTDDecoder}=await import(pathToFileURL(path.join(root,'vendor/zstd/zstddec.js'))),decoder=new ZSTDDecoder();await decoder.init();
for(const[name,meta]of Object.entries(binaryTransports)){
 const raw=gunzipSync(await fs.readFile(path.join(root,name))),zstd=execFileSync('/opt/homebrew/bin/zstd',['-19','--long=24','--single-thread','-c'],{input:raw,maxBuffer:32e6});
 if(!Buffer.from(decoder.decode(zstd,raw.length)).equals(raw))throw Error('Zstd roundtrip '+name);
 const file=name.replace(/\.gz$/,'.zst');await fs.writeFile(path.join(root,file),zstd);meta.zstd={file,bytes:zstd.length,sha256:hash(zstd)};console.log({name,bytes:zstd.length});
}
await fs.writeFile(path.join(root,'binary-transports.js'),'// Exact gzip/Brotli payloads plus c7-bake-zstd-transports.mjs alternatives.\nexport const binaryTransports='+JSON.stringify(binaryTransports,null,2)+';\n');
