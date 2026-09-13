#!/usr/bin/env node
/**
 * scripts/tokens.mjs <роут>
 *
 * Печатает JSON с фактически применёнными в браузере значениями:
 *   - цвета фона и текста (с площадью, чтобы отличить базовый фон от акцента)
 *   - все font-family
 *   - все border-radius
 *   - шкала вертикальных отступов между секциями
 *   - максимальная ширина контентной колонки
 *
 * Замеряется вычисленный стиль, а не то, что написано в CSS: в фазе 4
 * сравниваются реально собранные страницы, а не намерения.
 *
 * Пример: node scripts/tokens.mjs /c1 > design/tokens-c1.json
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROUTE = (process.argv[2] || '/').trim()
if (!ROUTE.startsWith('/')) {
  console.error(`Роут должен начинаться со слэша. Получено: ${ROUTE}`)
  process.exit(2)
}

const HOST = '127.0.0.1'
const PORT = Number(process.env.QA_PORT ?? 3000)
const BASE = `http://${HOST}:${PORT}`
const WIDTH = Number(process.env.QA_WIDTH ?? 1440)

let proc = null
let weStartedIt = false

function probeTcp(port, host, timeout = 400) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host })
    const done = (ok) => {
      s.destroy()
      resolve(ok)
    }
    s.setTimeout(timeout)
    s.once('connect', () => done(true))
    s.once('timeout', () => done(false))
    s.once('error', () => done(false))
  })
}

async function probeHttp(url, ms = 2500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'manual' })
    return r.status > 0
  } catch {
    return false
  }
}

function nextBin() {
  const local = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next'
  )
  if (existsSync(local)) return local
  throw new Error('next не найден в node_modules/.bin — сначала npm install')
}

async function ensureServer() {
  if (await probeTcp(PORT, HOST)) {
    if (await probeHttp(BASE, 15_000)) return
    throw new Error(`порт ${PORT} занят процессом, который не отвечает по HTTP`)
  }
  proc = spawn(nextBin(), ['dev', '-p', String(PORT), '-H', HOST], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', BROWSER: 'none', FORCE_COLOR: '0' },
  })
  weStartedIt = true
  let log = ''
  proc.stdout.on('data', (d) => (log += d))
  proc.stderr.on('data', (d) => (log += d))
  let died = null
  proc.once('exit', (c, s) => (died = `next dev упал (code=${c} signal=${s})\n${log.slice(-2000)}`))
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (died) throw new Error(died)
    if ((await probeTcp(PORT, HOST)) && (await probeHttp(BASE, 30_000))) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`dev-сервер не поднялся за 180с\n${log.slice(-2000)}`)
}

function hardKill(signal = 'SIGKILL') {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(-proc.pid, signal)
    }
  } catch (e) {
    if (e.code !== 'ESRCH') console.error('kill не сработал:', e.message)
  }
}

async function stopServer() {
  if (!weStartedIt || !proc || proc.exitCode !== null) return
  const exited = new Promise((r) => proc.once('exit', r))
  hardKill('SIGTERM')
  const won = await Promise.race([
    exited.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 5000)),
  ])
  if (!won) hardKill('SIGKILL')
}

process.once('exit', () => hardKill('SIGKILL'))
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => {
    hardKill('SIGKILL')
    process.exit(130)
  })
}

const COLLECT = () => {
  const round = (n) => Math.round(n * 100) / 100
  const hex = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return c
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (p.length >= 4 && p[3] === 0) return null
    const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    const base = '#' + h(p[0]) + h(p[1]) + h(p[2])
    return p.length >= 4 && p[3] < 1 ? `${base}@${round(p[3])}` : base
  }

  const bg = new Map()
  const fg = new Map()
  const fonts = new Map()
  const radii = new Map()
  let maxContent = 0
  let maxContentSel = ''

  const all = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden'
  })

  for (const el of all) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const area = Math.max(0, r.width) * Math.max(0, r.height)

    const b = hex(cs.backgroundColor)
    if (b) bg.set(b, round((bg.get(b) || 0) + area / 1000))

    const t = (el.textContent || '').trim()
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    )
    if (ownText && t) {
      const c = hex(cs.color)
      if (c) fg.set(c, (fg.get(c) || 0) + 1)
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      const key = `${fam} ${cs.fontWeight} ${round(parseFloat(cs.fontSize))}px/${cs.lineHeight}`
      fonts.set(key, (fonts.get(key) || 0) + 1)
    }

    for (const corner of [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius',
    ]) {
      const v = cs[corner]
      if (v && v !== '0px') radii.set(v, (radii.get(v) || 0) + 1)
    }

    // ширина контентной колонки: элементы с настоящим текстом
    if (ownText && t.length > 40 && r.width > maxContent && r.width < window.innerWidth) {
      maxContent = r.width
      maxContentSel = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/)[0] : '')
    }
  }

  // Вертикальный ритм. Зазора между соседними блоками недостаточно:
  // отбивы чаще заданы падингом внутри секции, и тогда зазор равен нулю.
  // Поэтому меряем и фактический просвет между содержимым соседних секций,
  // и объявленные вертикальные падинги/маржины секционного уровня.
  const main = document.querySelector('main') || document.body
  const isSection = (el) =>
    el.tagName === 'SECTION' ||
    el.tagName === 'HEADER' ||
    el.tagName === 'FOOTER' ||
    el.parentElement === main
  const sections = [...main.querySelectorAll('section, header, footer')].concat(
    [...main.children]
  ).filter((el, i, a) => {
    if (a.indexOf(el) !== i) return false
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && el.getBoundingClientRect().height > 8
  })

  // объявленные вертикальные отбивы секционного уровня
  const padScale = new Set()
  for (const el of sections) {
    const cs = getComputedStyle(el)
    for (const prop of ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom']) {
      const v = round(parseFloat(cs[prop]) || 0)
      if (v >= 8) padScale.add(v)
    }
  }

  // фактический просвет между последним и первым видимым содержимым соседей
  const contentBox = (el) => {
    let top = Infinity, bottom = -Infinity
    for (const n of el.querySelectorAll('*')) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const t = (n.textContent || '').trim()
      const isImg = n.tagName === 'IMG' || n.tagName === 'SVG'
      const own = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
      if (!own && !isImg) continue
      if (!t && !isImg) continue
      const r = n.getBoundingClientRect()
      if (r.height <= 0) continue
      top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom)
    }
    return top === Infinity ? null : { top, bottom }
  }
  const tops = [...main.children].filter((el) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && el.getBoundingClientRect().height > 8
  })
  const gaps = []
  const sectionLabel = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : el.classList.length ? `.${el.classList[0]}` : '')
  for (let i = 1; i < tops.length; i++) {
    const a = contentBox(tops[i - 1]), b = contentBox(tops[i])
    if (!a || !b) continue
    gaps.push({
      between: `${sectionLabel(tops[i - 1])} → ${sectionLabel(tops[i])}`,
      gap: round(b.top - a.bottom),
    })
  }

  const sortDesc = (m, n) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, weight: v }))

  return {
    backgrounds: sortDesc(bg, 12),
    textColors: sortDesc(fg, 12),
    fonts: sortDesc(fonts, 20),
    fontFamilies: [...new Set([...fonts.keys()].map((k) => k.split(' ')[0]))],
    borderRadii: sortDesc(radii, 12),
    sectionGaps: gaps,
    sectionGapScale: [...new Set(gaps.map((g) => g.gap))].sort((a, b) => a - b),
    sectionPaddingScale: [...padScale].sort((a, b) => a - b),
    maxContentWidth: round(maxContent),
    maxContentWidthSelector: maxContentSel,
    documentHeight: document.documentElement.scrollHeight,
  }
}

let out = null
let crash = null
try {
  await ensureServer()
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: 1000 },
      deviceScaleFactor: 1,
      baseURL: BASE,
    })
    const page = await context.newPage()
    await page.goto(ROUTE, { waitUntil: 'load', timeout: 120_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.waitForLoadState('networkidle').catch(() => {})
    out = await page.evaluate(COLLECT)
    out = { route: ROUTE, width: WIDTH, ...out }
    await context.close()
  } finally {
    await browser.close()
    await stopServer()
  }
} catch (e) {
  crash = e
  await stopServer()
}

if (crash) {
  console.error(crash.stack || crash.message)
  process.exit(1)
}
console.log(JSON.stringify(out, null, 2))
