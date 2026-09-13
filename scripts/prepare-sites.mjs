#!/usr/bin/env node
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (packageJson.name !== 'volnami') throw new Error('Refusing to prepare an unexpected project')

const out = path.join(root, 'out')
const dist = path.join(root, 'dist')
await stat(path.join(out, 'index.html'))

await rm(dist, { recursive: true, force: true })
await mkdir(path.join(dist, 'client'), { recursive: true })
await mkdir(path.join(dist, 'server'), { recursive: true })
await cp(out, path.join(dist, 'client'), { recursive: true })

const worker = `const filePattern = /\\/[^/]+\\.[^/]+$/
const contentTypes = new Map([
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

function normalizeContentType(response, pathname) {
  const extension = pathname.slice(pathname.lastIndexOf('.')).toLowerCase()
  const contentType = contentTypes.get(extension)
  if (!contentType || response.status === 404) return response

  const headers = new Headers(response.headers)
  headers.set('Content-Type', contentType)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }

    const url = new URL(request.url)
    if (url.pathname !== '/' && !url.pathname.endsWith('/') && !filePattern.test(url.pathname)) {
      url.pathname += '/'
      return Response.redirect(url.toString(), 308)
    }

    let response = await env.ASSETS.fetch(new Request(url.toString(), request))
    if (response.status === 404 && url.pathname.endsWith('/')) {
      const indexUrl = new URL(url)
      indexUrl.pathname += 'index.html'
      response = await env.ASSETS.fetch(new Request(indexUrl.toString(), request))
    }

    if (response.status !== 404) return normalizeContentType(response, url.pathname)

    const fallbackUrl = new URL('/404.html', url)
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl.toString(), request))
    return new Response(fallback.body, { status: 404, headers: fallback.headers })
  },
}
`

await writeFile(path.join(dist, 'server', 'index.js'), worker)
console.log('Sites bundle prepared from out/')
