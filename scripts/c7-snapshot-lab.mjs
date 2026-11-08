import {mkdir,readdir,copyFile,symlink,readFile,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const name=process.argv[2];
if(!name||!/^[a-z0-9-]+$/.test(name))throw new Error('Pass unique lowercase snapshot name');
const path=`lab/c7-snapshots/${name}`;
await mkdir('lab/c7-snapshots',{recursive:true});await mkdir(path);
const sources={};
for(const file of await readdir('lab/c7-scene'))if(/\.(js|html)$/.test(file)){await copyFile(`lab/c7-scene/${file}`,`${path}/${file}`);sources[file]=createHash('sha256').update(await readFile(`${path}/${file}`)).digest('hex');}
for(const dir of['assets','vendor'])await symlink(`../../c7-scene/${dir}`,`${path}/${dir}`,'dir');
// Derived geometry/light data changes with the live terrain. A snapshot must
// retain its own version, otherwise later terrain edits silently invalidate it.
const cacheSources={},run=promisify(execFile);
for(const dir of['sky-data','left-sky-data','terrain-cache']){
 const from=`lab/c7-scene/${dir}`,to=`${path}/${dir}`;
 if(process.platform==='darwin')await run('/bin/cp',['-cR',from,to]);
 else await cp(from,to,{recursive:true});
 for(const file of await readdir(from)){
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const expected=hash(await readFile(`${from}/${file}`));
  if(expected!==hash(await readFile(`${to}/${file}`)))throw Error('Snapshot data mismatch: '+dir+'/'+file);
  cacheSources[dir+'/'+file]=expected;
 }
}
await writeFile(`${path}/snapshot.json`,JSON.stringify({created:new Date().toISOString(),sources,cacheSources,assets:'Shared immutable licensed source assets; derived geometry/horizon caches are independent verified copies.'},null,2));
console.log(`http://127.0.0.1:3027/${path}/`);
