// Local production-export profiling only. No project files are served outside root.
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
const root = await fs.realpath(process.argv[2]), port = Number(process.argv[3] || 3190)
const files = new Map(), requests = []
const types = { html:'text/html; charset=utf-8',txt:'text/plain; charset=utf-8',js:'text/javascript',mjs:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',woff2:'font/woff2',wasm:'application/wasm' }
async function walk(dir = '') {
  for (const entry of await fs.readdir(path.join(root,dir), {withFileTypes:true})) {
    if (entry.name.startsWith('.')) continue
    const name = path.posix.join(dir,entry.name)
    if (entry.isDirectory()) { await walk(name); continue }
    const real = await fs.realpath(path.join(root,name))
    if (!real.startsWith(root + path.sep)) continue
    const body = await fs.readFile(real), ext = name.split('.').at(-1), text = /^(html|txt|js|mjs|css|json|svg)$/.test(ext)
    files.set('/'+name,{body,type:types[ext]||'application/octet-stream',etag:'"'+createHash('sha256').update(body).digest('hex')+'"',...(text&&body.length>512?{gzip:gzipSync(body),br:brotliCompressSync(body,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})}:{})})
  }
}
await walk()
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost'), pathname = decodeURIComponent(url.pathname)
  if (pathname === '/__qa/stats') {
    const copy = [...requests]; if (url.searchParams.has('reset')) requests.length = 0
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(copy));return
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return}
  const name = pathname.endsWith('/')?pathname+'index.html':pathname, file = files.get(name)
  if (!file) {res.writeHead(404);res.end();return}
  const start = Date.now(), encoding = req.headers['accept-encoding']||''
  const format = file.br&&encoding.includes('br')?'br':file.gzip&&encoding.includes('gzip')?'gzip':null
  const bytes = format?file[format]:file.body, cached = req.headers['if-none-match'] === file.etag
  const status = cached?304:200
  const headers = {'Content-Type':file.type,'ETag':file.etag,'Vary':'Accept-Encoding','Cache-Control':name.endsWith('.html')?'no-cache':name.startsWith('/_next/')?'public, max-age=31536000, immutable':'public, max-age=600','X-Content-Type-Options':'nosniff'}
  if (!cached) {headers['Content-Length']=bytes.length;if(format)headers['Content-Encoding']=format}
  res.writeHead(status,headers);res.end(cached||req.method==='HEAD'?undefined:bytes)
  requests.push({path:name,start,end:Date.now(),status,encoding:format,bodyBytes:cached||req.method==='HEAD'?0:bytes.length,decodedBytes:file.body.length})
})
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({root,port,files:files.size,compression:'precomputed br quality5/gzip for text; binary transports stay raw',cache:'HTML revalidate; hashed Next1year; other assets600s'})))
