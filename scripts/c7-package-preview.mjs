// Self-contained C7 review export. Never copies the repository or changes out/.
import { readFile, writeFile, mkdir, readdir, stat, copyFile, realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import path from 'node:path'

const destination = process.argv[2]
if (!destination) throw new Error('Usage: node scripts/c7-package-preview.mjs <new-directory>')
const target = path.resolve(destination)
await mkdir(target) // Refuse to overwrite a previous review package.
const build = JSON.parse(await readFile('out/c7-build.json', 'utf8'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const runFile=promisify(execFile)
for (const [file, hash] of Object.entries(build.sources)) {
  if (sha(await readFile(file)) !== hash) throw new Error('Stale export: ' + file)
}
const files = new Set()
async function walk(dir, accept = () => true) {
  for (const entry of await readdir('out/' + dir, { withFileTypes: true })) {
    const rel = dir + '/' + entry.name
    if (!accept(rel)) continue
    if (entry.isDirectory()) await walk(rel, accept)
    else files.add(rel)
  }
}
for (const route of ['c7', 'policy', 'agreement', 'cookie']) await walk(route)
// Native renderer modules and their relative resources are outside Next chunks.
const runtimeRoot='3d/c7/runtime-v646'
const runtime=JSON.parse(await readFile('out/'+runtimeRoot+'/package.json','utf8'))
for(const [relative,record] of Object.entries(runtime.files)){
  if(relative.includes('..')||path.isAbsolute(relative))throw Error('Unsafe runtime path: '+relative)
  if(sha(await readFile('out/'+runtimeRoot+'/'+relative))!==record.sha256)throw Error('Runtime package mismatch: '+relative)
  files.add(runtimeRoot+'/'+relative)
}
files.add(runtimeRoot+'/package.json')
await walk('_next/static/chunks', rel => !/^_next\/static\/chunks\/app\/(?:c[1-6](?:\/|$)|page-)/.test(rel))
// HTML includes both responsive posters, image originals, route CSS and preload fonts.
const sources = await Promise.all([...files].filter(f => /\.(?:html|txt)$/.test(f)).map(f => readFile('out/' + f, 'utf8')))
for (const source of sources) {
  for (const match of source.matchAll(/\/(?:_next|3d|cases|logo)\/[^\s<>"'\\,?]+?\.(?:css|woff2|webp|png|jpe?g|svg)/g)) files.add(match[0].slice(1))
}
for (const file of [...files].filter(f => f.endsWith('.css'))) {
  const css = await readFile('out/' + file, 'utf8')
  for (const match of css.matchAll(/url\((?:["'])?([^)'"\s]+\.woff2)/g)) {
    files.add(match[1].startsWith('/') ? match[1].slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])))
  }
}
const manifest = []
for (const file of [...files].sort()) {
  if (file.includes('..') || path.isAbsolute(file)) throw new Error('Unsafe asset path: ' + file)
  const bytes = await readFile('out/' + file) // Dereference local asset symlinks.
  const to = path.join(target, file)
  await mkdir(path.dirname(to), { recursive: true })
  // APFS copy-on-write keeps each review package independent without writing
  // the same immutable assets again. Other filesystems retain a normal copy.
  if(process.platform==='darwin')await runFile('/bin/cp',['-c',await realpath('out/'+file),to])
  else await copyFile(await realpath('out/'+file),to)
  if(sha(await readFile(to))!==sha(bytes))throw new Error('Copied asset mismatch: '+file)
  manifest.push({ file, bytes: (await stat(to)).size, sha256: sha(bytes) })
}
const generated = {
  'robots.txt': 'User-agent: *\nDisallow: /\n',
  'index.html': '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="0;url=/c7/"><title>Volnami</title><a href="/c7/">Открыть Volnami</a></html>\n',
}
// Next's minifier strips vendor banners. Keep the distributed library's
// original copyright/license notice alongside the portable site.
const dependencies = JSON.parse(await readFile('package.json', 'utf8')).dependencies
if (dependencies?.gsap) {
  const core = await readFile('node_modules/gsap/gsap-core.js', 'utf8')
  const notice = core.match(/\/\*![\s\S]*?\*\//)?.[0]
  if (!notice) throw new Error('Missing GSAP distribution notice')
  generated['THIRD_PARTY_NOTICES.txt'] = notice + '\n\nGSAP Standard No Charge License: https://gsap.com/standard-license\n'
}
for(const [file,text]of Object.entries(generated)){
  const bytes=Buffer.from(text);await writeFile(path.join(target,file),bytes)
  manifest.push({file,bytes:bytes.length,sha256:sha(bytes)})
}
await writeFile(target + '-manifest.json', JSON.stringify({ createdAt: new Date().toISOString(), build, files: manifest, bytes: manifest.reduce((sum, file) => sum + file.bytes, 0) }, null, 2))
console.log(JSON.stringify({ target, files: manifest.length, bytes: manifest.reduce((sum, file) => sum + file.bytes, 0) }))
