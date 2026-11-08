// Serve only a prepared C7 package, on loopback, without directory listings.
import http from 'node:http'
import path from 'node:path'
import { readFile, realpath } from 'node:fs/promises'

const root = await realpath(process.argv[2])
const port = Number(process.argv[3] || 3017)
const types = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
  try {
    const url = new URL(req.url, 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)
    if (['/', '/c7', '/c7/case/miratorg-extra-meat', '/policy', '/agreement', '/cookie'].includes(pathname)) {
      const to = pathname === '/' ? '/c7/' : pathname + '/'
      res.writeHead(307, { Location: to + url.search }); res.end(); return
    }
    if (pathname.split('/').some(part => part.startsWith('.')) || pathname.includes('\\')) throw new Error('Invalid path')
    if (pathname.endsWith('/')) pathname += 'index.html'
    const file = await realpath(path.join(root, pathname))
    if (!file.startsWith(root + path.sep)) throw new Error('Outside package')
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      // Keep the reviewed HTML byte-identical; in particular, avoid edge email rewriting.
      'Cache-Control': pathname.startsWith('/_next/') ? 'public, max-age=31536000, immutable, no-transform' : 'no-cache, no-transform',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Страница не найдена')
  }
})
server.listen(port, '127.0.0.1', () => console.log(`C7 preview listening on http://127.0.0.1:${port}`))
