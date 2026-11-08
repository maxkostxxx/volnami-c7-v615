#!/usr/bin/env node
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const repository = process.env.GITHUB_PAGES_REPOSITORY || 'volnami-c7-v615'
const basePath = `/${repository}`
const source = resolve(process.env.GITHUB_PAGES_SOURCE || 'out')
const target = resolve(process.env.GITHUB_PAGES_OUTPUT || 'output/github-pages')
const include = [
  '_next', 'c7', 'policy', 'agreement', 'cookie', 'logo',
  '3d/c7/backdrop', '3d/c7/runtime-v646',
  'cases/c7', 'cases/ekorancho', 'cases/kulek',
]

async function exists(path) {
  try { await access(path, constants.R_OK); return true } catch { return false }
}

async function textFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await textFiles(path))
    else if (/\.(?:html|js|css)$/i.test(entry.name)) files.push(path)
  }
  return files
}

function withBasePath(text) {
  return text
    .replace(/(["'])\/(3d|cases|logo)\//g, (_match, quote, directory) => `${quote}${basePath}/${directory}/`)
    .replace(/url\(\/(3d|cases|logo)\//g, (_match, directory) => `url(${basePath}/${directory}/`)
    .replaceAll('href="/"', `href="${basePath}/"`)
    .replace(/href="\/(policy|agreement|cookie)\//g, `href="${basePath}/$1/`)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
for (const item of include) {
  const from = join(source, item)
  if (!await exists(from)) throw new Error(`Missing Pages asset: ${relative(source, from)}`)
  await cp(from, join(target, item), { recursive: true })
}

for (const file of await textFiles(target)) {
  const original = await readFile(file, 'utf8')
  const rewritten = withBasePath(original)
  if (rewritten !== original) await writeFile(file, rewritten)
}

await writeFile(join(target, '.nojekyll'), '')
await writeFile(join(target, 'index.html'), `<!doctype html><meta http-equiv="refresh" content="0;url=${basePath}/c7/"><title>Volnami C7</title><a href="${basePath}/c7/">Открыть Volnami C7</a>\n`)
console.log(JSON.stringify({ source, target, repository, files: (await textFiles(target)).length }))
