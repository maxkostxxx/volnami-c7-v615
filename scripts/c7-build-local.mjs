#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

async function manifest(dir='app/c7') {
  const result={}
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const name=`${dir}/${entry.name}`
    if(entry.isDirectory())Object.assign(result,await manifest(name))
    else result[name]=createHash('sha256').update(await readFile(name)).digest('hex')
  }
  return result
}
// The new renderer is loaded as native modules outside the Next bundle. Include
// its complete portable package so a stale world cannot pass source validation.
async function allSources(){
  const shared = {}
  for (const file of [
    'app/globals.css', 'app/layout.tsx', 'app/fonts.ts', 'tsconfig.json',
    'package.json', 'package-lock.json', 'next.config.ts',
    'content/legal/policy.txt',
    'content/legal/form.txt',
    'content/legal/cookie.txt',
  ])
    shared[file] = createHash('sha256').update(await readFile(file)).digest('hex')
  return {
    ...shared,
    ...await manifest(),
    ...await manifest('app/legal'),
    ...await manifest('app/policy'),
    ...await manifest('app/agreement'),
    ...await manifest('app/cookie'),
    ...await manifest('public/3d/c7/runtime-v646'),
  }
}
const before=await allSources()
const startedAt=new Date().toISOString()
// The pinned Next/Webpack combination crashes on a second build while restoring
// filesystem snapshots containing lab symlinks (WasmHash.update(undefined)).
// Keep dependencies/configuration intact; discard only this regenerable cache.
// Upstream report: https://github.com/webpack/webpack/issues/21636
// The process-local webpack hook below disables cache reads and writes.
// Preserve existing snapshots; no global cache deletion is needed.
const localAssetLinks=process.env.C7_LOCAL_ASSET_LINKS==='1'
const env={...process.env}
env.NODE_OPTIONS=[env.NODE_OPTIONS,'--require='+path.resolve('scripts/c7-local-webpack-memory.cjs')].filter(Boolean).join(' ')
if(localAssetLinks)env.NODE_OPTIONS=[env.NODE_OPTIONS,'--import='+pathToFileURL(path.resolve('scripts/c7-local-asset-links.mjs')).href].filter(Boolean).join(' ')
const code=await new Promise(resolve=>{
  const child=spawn('npm',['run','build'],{stdio:'inherit',env})
  child.on('exit',resolve)
})
if(code!==0)process.exit(Number(code)||1)
const after=await allSources()
if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('C7 sources changed while building; export is not accepted as current evidence')
await writeFile('out/c7-build.json',JSON.stringify({startedAt,completedAt:new Date().toISOString(),localAssetLinks,compilerCache:'disabled for this local build only',artifactKind:localAssetLinks?'Local preview only; public assets are relative file symlinks, not portable':'Static export',sources:after},null,2))
console.log('Verified C7 export source manifest: out/c7-build.json')
