#!/usr/bin/env node
/**
 * scripts/check.mjs <роут>
 *
 * Проверка одного роута на мобильных, планшетной и десктопных ширинах:
 *   - полностраничные скриншоты 390 / 768 / 1280 / 1440 / 1920
 *   - падает при горизонтальном скролле на любой ширине
 *   - падает при любой ошибке в консоли
 *   - падает, если картинка не загрузилась (naturalWidth === 0)
 *   - контраст текста к фону, порог 4.5:1, падает при нарушении
 *   - отдельный скриншот с prefers-reduced-motion: reduce
 *   - отчёт, код выхода 0 или 1
 *
 * Пример: node scripts/check.mjs /c1
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { mkdir } from 'node:fs/promises'
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
const CONTRAST_MIN = 4.5

/** screenshots/<роут>/<ширина>.png; корень "/" кладётся в screenshots/root/ */
const OUT = path.resolve(
  process.cwd(),
  'screenshots',
  ROUTE === '/' ? 'root' : ROUTE.replace(/^\/+|\/+$/g, '')
)

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /React DevTools/i,
  /^Failed to load resource/i, // Chromium дублирует каждый упавший запрос
]
const IGNORE_REQUEST_FAIL = [
  /net::ERR_ABORTED/, // отменённые префетчи <Link>
  /\/favicon\.ico(\?|$)/,
  /\/_next\/static\/webpack\/.*\.hot-update\.json/,
]

const findings = []
const fail = (check, where, message, detail) =>
  findings.push({ level: 'error', check, where, message, detail })
const warn = (check, where, message, detail) =>
  findings.push({ level: 'warn', check, where, message, detail })

// ------------------------------------------------------------------ dev-сервер
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
    if (await probeHttp(BASE, 15_000)) {
      console.log(`• переиспользую уже поднятый dev-сервер на ${BASE}`)
      return
    }
    throw new Error(`порт ${PORT} занят процессом, который не отвечает по HTTP`)
  }
  console.log(`• поднимаю: next dev -p ${PORT}`)
  proc = spawn(nextBin(), ['dev', '-p', String(PORT), '-H', HOST], {
    cwd: process.cwd(),
    // своя группа процессов, чтобы kill(-pid) достал и дочерние
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', BROWSER: 'none', FORCE_COLOR: '0' },
  })
  weStartedIt = true
  let log = ''
  proc.stdout.on('data', (d) => (log += d))
  proc.stderr.on('data', (d) => (log += d))
  let died = null
  proc.once('exit', (code, sig) => {
    died = `next dev упал на старте (code=${code} signal=${sig})\n${log.slice(-4000)}`
  })

  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (died) throw new Error(died)
    if ((await probeTcp(PORT, HOST)) && (await probeHttp(BASE, 30_000))) {
      console.log('• dev-сервер готов')
      return
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`dev-сервер не поднялся за 180с\n${log.slice(-4000)}`)
}

function hardKill(signal = 'SIGKILL') {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      // отрицательный pid = вся группа процессов
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
  console.log('• dev-сервер остановлен')
}

process.once('exit', () => hardKill('SIGKILL'))
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => {
    hardKill('SIGKILL')
    process.exit(130)
  })
}
process.once('uncaughtException', (e) => {
  console.error(e)
  hardKill('SIGKILL')
  process.exit(1)
})
process.once('unhandledRejection', (e) => {
  console.error(e)
  hardKill('SIGKILL')
  process.exit(1)
})

// ------------------------------------------------ инструментовка внутри страницы
const EARLY_CAPTURE = () => {
  const buf = []
  Object.defineProperty(window, '__qa', { value: { errors: buf }, configurable: false })
  const s = (v) => {
    try {
      return typeof v === 'string' ? v : (v && v.stack) || JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  window.addEventListener(
    'error',
    (e) => {
      if (e.target && e.target !== window && e.target.nodeType === 1) {
        const url = e.target.currentSrc || e.target.src || e.target.href || ''
        buf.push({
          kind: 'resource',
          url,
          text: `не загрузился <${e.target.tagName.toLowerCase()}> ${url}`,
        })
      } else {
        buf.push({ kind: 'error', text: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` })
      }
    },
    true // фаза захвата: ошибки ресурсов не всплывают
  )
  window.addEventListener('unhandledrejection', (e) =>
    buf.push({ kind: 'unhandledrejection', text: s(e.reason) })
  )
  const orig = console.error.bind(console)
  console.error = (...a) => {
    buf.push({ kind: 'console.error', text: a.map(s).join(' ') })
    orig(...a)
  }
}

const CSS_PATH_SRC = `
  const cssPath = el => {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 5; e = e.parentElement) {
      if (e.id) { parts.unshift(e.tagName.toLowerCase() + '#' + e.id); break; }
      let t = e.tagName.toLowerCase();
      const cls = (e.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) t += '.' + cls.join('.');
      const sibs = e.parentElement ? [...e.parentElement.children].filter(c => c.tagName === e.tagName) : [];
      if (sibs.length > 1) t += ':nth-of-type(' + (sibs.indexOf(e) + 1) + ')';
      parts.unshift(t);
    }
    return parts.join(' > ');
  };`

// ---------------------------------------------------------------- «устаканить»
async function settle(page) {
  await page.waitForLoadState('load')
  await page.evaluate(async () => {
    const se = document.scrollingElement || document.documentElement
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < se.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  // Присвоение loading='eager' ленивой картинке действительно запускает загрузку.
  await page.evaluate(() => {
    for (const i of document.querySelectorAll('img[loading="lazy"]')) i.loading = 'eager'
  })
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((res) => {
              const t = setTimeout(res, 10000)
              const d = () => {
                clearTimeout(t)
                res()
              }
              img.addEventListener('load', d, { once: true })
              img.addEventListener('error', d, { once: true })
            })
      )
    ).then(() => undefined)
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // второй раз: шрифты, запрошенные во время прокрутки
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForLoadState('networkidle').catch(() => {})
}

// ------------------------------------------------------- горизонтальный скролл
async function checkOverflow(page, where, viewport) {
  const r = await page.evaluate(`(() => {
    ${CSS_PATH_SRC}
    window.scrollTo(0, 0);
    const se = document.scrollingElement || document.documentElement;
    const body = document.body;
    const vw = window.innerWidth;
    const clientW = se.clientWidth;
    const scrollW = Math.max(se.scrollWidth, body ? body.scrollWidth : 0);
    const fullPageW = Math.max(
      body ? body.scrollWidth : 0, document.documentElement.scrollWidth,
      body ? body.offsetWidth : 0, document.documentElement.offsetWidth,
      body ? body.clientWidth : 0, document.documentElement.clientWidth);
    const clipX = v => v === 'hidden' || v === 'clip';
    const clipped = clipX(getComputedStyle(document.documentElement).overflowX)
                 || (body && clipX(getComputedStyle(body).overflowX));
    const offenders = [];
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    for (let el = w.currentNode; el; el = w.nextNode()) {
      let scrolled = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { scrolled = true; break; }
      }
      if (scrolled) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const right = b.right + window.scrollX;
      const left  = b.left  + window.scrollX;
      if (right > vw + 1 || left < -1) {
        offenders.push({ sel: cssPath(el), left: Math.round(left), right: Math.round(right),
                         w: Math.round(b.width), pos: cs.position });
      }
      if (offenders.length >= 40) break;
    }
    return { vw, clientW, scrollW, fullPageW, clipped, offenders };
  })()`)

  const over = r.scrollW - r.clientW
  const top = r.offenders
    .slice(0, 8)
    .map((o) => `      ${o.sel}  [${o.left}..${o.right}] w=${o.w} pos=${o.pos}`)
    .join('\n')
  if (over > 1) {
    fail(
      'h-scroll',
      where,
      `горизонтальный скролл: scrollWidth ${r.scrollW} > clientWidth ${r.clientW} (+${over}px)`,
      top
    )
  } else if (r.fullPageW > viewport.width + 1) {
    fail(
      'h-scroll',
      where,
      `полностраничный скриншот вышел бы шириной ${r.fullPageW}px при вьюпорте ${viewport.width}px`,
      top
    )
  } else if (r.offenders.length && r.clipped) {
    warn(
      'h-scroll',
      where,
      `скролла нет (overflow-x hidden/clip на html/body его маскирует), но ${r.offenders.length} элемент(ов) вылезают за вьюпорт`,
      top
    )
  } else if (r.offenders.length) {
    warn(
      'h-scroll',
      where,
      `${r.offenders.length} элемент(ов) выходят за вьюпорт, не создавая скролла`,
      top
    )
  }
}

// ------------------------------------------------------------------- картинки
async function checkImages(page, where, net, reported) {
  const data = await page.evaluate(`(() => {
    ${CSS_PATH_SRC}
    const abs = u => { try { return new URL(u, location.href).href; } catch { return null; } };
    const imgs = [...document.querySelectorAll('img')].map(img => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      const cs = getComputedStyle(img);
      return { sel: cssPath(img), src, abs: abs(src), complete: img.complete,
               nw: img.naturalWidth, nh: img.naturalHeight,
               nimg: img.getAttribute('data-nimg'), alt: img.getAttribute('alt'),
               isSvg: /\\.svg(\\?|#|$)/i.test(src),
               shown: cs.display !== 'none' && cs.visibility !== 'hidden' };
    });
    const props = ['background-image','mask-image','-webkit-mask-image','border-image-source','list-style-image'];
    const re = /url\\((['"]?)([^'")]+)\\1\\)/g;
    const seen = new Set(); const bg = [];
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (!cs) continue;
        if (pseudo && (cs.content === 'none' || cs.display === 'none')) continue;
        for (const p of props) {
          const v = cs.getPropertyValue(p);
          if (!v || v === 'none') continue;
          re.lastIndex = 0; let m;
          while ((m = re.exec(v))) {
            const raw = m[2];
            if (raw.startsWith('data:') || raw.startsWith('#')) continue;
            const a = abs(raw); if (!a || seen.has(a)) continue;
            seen.add(a); bg.push({ url: a, prop: p, pseudo, sel: cssPath(el) });
          }
        }
      }
    }
    return { imgs, bg };
  })()`)

  for (const i of data.imgs) {
    const n = i.abs ? net.get(i.abs) : null
    if (!i.src) {
      fail('image', where, `<img> с пустым src`, `      ${i.sel}`)
      continue
    }
    // Незагруженная ленивая картинка отдаёт complete === false и до проверки
    // naturalWidth не доходит — ложного срабатывания тут быть не может.
    if (!i.complete) {
      warn('image', where, `картинка не догрузилась: ${i.src}`, `      ${i.sel}`)
      continue
    }
    if (i.nw === 0) {
      if (i.abs && reported.has(i.abs)) continue
      if (i.isSvg && n && n.status >= 200 && n.status < 400) {
        // SVG без собственных размеров — не поломка, если отдался 2xx
        warn(
          'image',
          where,
          `у SVG нет внутренних размеров (naturalWidth 0), но он отдался ${n.status}: ${i.src}`,
          `      ${i.sel}`
        )
      } else {
        if (i.abs) reported.add(i.abs)
        fail(
          'image',
          where,
          `картинка не загрузилась (naturalWidth 0${n ? `, HTTP ${n.status ?? n.error}` : ', нет записи в сети'}): ${i.src}`,
          `      ${i.sel}${i.nimg ? ' [next/image data-nimg=' + i.nimg + ']' : ''}`
        )
      }
    }
    if (i.shown && i.alt === null) {
      warn('alt', where, `у картинки нет атрибута alt: ${i.src}`, `      ${i.sel}`)
    }
  }

  if (data.bg.length) {
    const results = await page.evaluate(
      (urls) =>
        Promise.all(
          urls.map(
            (u) =>
              new Promise((res) => {
                const im = new Image()
                const t = setTimeout(() => res({ u, ok: false, reason: 'таймаут' }), 10000)
                im.onload = () => {
                  clearTimeout(t)
                  res({ u, ok: im.naturalWidth > 0 || /\.svg(\?|#|$)/i.test(u), reason: 'ok' })
                }
                im.onerror = () => {
                  clearTimeout(t)
                  res({ u, ok: false, reason: 'ошибка' })
                }
                im.src = u
              })
          )
        ),
      data.bg.map((b) => b.url)
    )
    for (const r of results) {
      if (r.ok) continue
      if (reported.has(r.u)) continue
      reported.add(r.u)
      const owner = data.bg.find((b) => b.url === r.u)
      const n = net.get(r.u)
      fail(
        'bg-image',
        where,
        `фоновый ресурс не загрузился (${r.reason}${n ? `, HTTP ${n.status ?? n.error}` : ''}): ${r.u}`,
        `      ${owner.sel}${owner.pseudo ?? ''}  {${owner.prop}}`
      )
    }
  }
}

// ------------------------------------------------------------------- контраст
function opaqueRgb(value) {
  const m = String(value).match(/^rgba?\(([^)]+)\)$/i)
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null
  if (parts.length >= 4 && parts[3] < 0.999) return null
  return parts.slice(0, 3)
}

function contrastRatio(foreground, background) {
  const fg = opaqueRgb(foreground)
  const bg = opaqueRgb(background)
  if (!fg || !bg) return null
  const luminance = (rgb) => {
    const linear = rgb.map((value) => {
      const channel = value / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

async function checkContrast(page, where) {
  const res = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const seen = new Set()
  const emit = (node, level, label) => {
    const d = (node.any || []).find((c) => c.id === 'color-contrast')?.data || {}
    if (typeof d.contrastRatio !== 'number') return
    if (d.contrastRatio >= CONTRAST_MIN) return
    const sel = Array.isArray(node.target) ? node.target.join(' ') : String(node.target)
    if (seen.has(sel)) return
    seen.add(sel)
    const msg = `контраст ${d.contrastRatio}:1 < ${CONTRAST_MIN}:1 ${label} fg=${d.fgColor ?? '?'} bg=${d.bgColor ?? '?'} ${d.fontSize ?? ''} ${d.fontWeight ?? ''}`
    ;(level === 'error' ? fail : warn)(
      'contrast',
      where,
      msg,
      `      ${sel}\n      ${(node.html || '').slice(0, 160)}`
    )
  }
  // Настоящие провалы WCAG AA (axe ждёт 4.5:1 для обычного текста, 3:1 для крупного).
  for (const v of res.violations) for (const n of v.nodes) emit(n, 'error', '[WCAG AA]')
  // Крупный текст, который axe пропустил на 3:1, но наш порог 4.5:1 строже.
  // ТЗ требует 4.5:1 для текста к фону без оговорок — поэтому это тоже FAIL.
  for (const p of res.passes) for (const n of p.nodes) emit(n, 'error', '[порог ТЗ 4.5:1]')
  // incomplete отдаёт contrastRatio: 0 — через emit() их гнать нельзя.
  // Но если сам текстовый узел задаёт полностью непрозрачные color и
  // background-color, их можно надёжно пересчитать без axe. Это сохраняет
  // FAIL даже когда соседний/перекрывающий элемент заставил axe вернуть
  // bgOverlap — именно такой случай покрывает обязательный негативный тест.
  for (const inc of res.incomplete)
    for (const n of inc.nodes) {
      const d = (n.any || []).find((c) => c.id === 'color-contrast')?.data || {}
      const sel = Array.isArray(n.target) ? n.target.join(' ') : String(n.target)
      const direct = await page
        .evaluate((selector) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const style = getComputedStyle(el)
          let background = style.backgroundColor
          let source = el
          const opaque = (value) => {
            const match = String(value).match(/^rgba?\(([^)]+)\)$/i)
            if (!match) return false
            const values = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
            return values.length === 3 || values[3] >= 0.999
          }
          while (!opaque(background) && source.parentElement) {
            source = source.parentElement
            const parentStyle = getComputedStyle(source)
            // Для incomplete берём фон предка только когда он задан прямо
            // в style: это надёжный тестовый/локальный фон, а не далёкая
            // плоскость под изображением или псевдоэлементом.
            if (source.style.backgroundColor && parentStyle.backgroundImage === 'none') {
              background = parentStyle.backgroundColor
            }
          }
          return {
            foreground: style.color,
            background,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          }
        }, sel)
        .catch(() => null)
      const ratio = direct ? contrastRatio(direct.foreground, direct.background) : null
      if (typeof ratio === 'number' && ratio < CONTRAST_MIN) {
        if (!seen.has(sel)) {
          seen.add(sel)
          fail(
            'contrast',
            where,
            `контраст ${ratio.toFixed(2)}:1 < ${CONTRAST_MIN}:1 [явный фон, резервный расчёт] fg=${direct.foreground} bg=${direct.background} ${direct.fontSize} ${direct.fontWeight}`,
            `      ${sel}\n      ${(n.html || '').slice(0, 160)}`
          )
        }
        continue
      }
      warn(
        'contrast',
        where,
        `контраст не определяется (${d.messageKey || 'bgColor'}) — под текстом картинка, градиент или перекрытие, смотреть глазами`,
        `      ${sel}\n      ${(n.html || '').slice(0, 160)}`
      )
    }
}

// ------------------------------------------------------------------ проход
function wireContext(context, whereFn, reported) {
  const net = new Map()
  context.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (IGNORE_CONSOLE.some((re) => re.test(t))) return
    const l = m.location()
    fail('console', whereFn(), `console.error: ${t}`, `      ${l.url}:${l.lineNumber}:${l.columnNumber}`)
  })
  context.on('weberror', (e) => {
    const err = e.error()
    fail(
      'pageerror',
      whereFn(),
      `необработанное исключение: ${err && err.message ? err.message : String(err)}`,
      err && err.stack ? '      ' + err.stack.split('\n').slice(0, 4).join('\n      ') : undefined
    )
  })
  context.on('requestfailed', (req) => {
    const f = req.failure()
    const txt = `${req.url()} ${f ? f.errorText : ''}`
    net.set(req.url(), { error: f ? f.errorText : 'failed' }) // записать ДО фильтра
    if (IGNORE_REQUEST_FAIL.some((re) => re.test(txt))) return
    if (reported.has(req.url())) return
    reported.add(req.url())
    fail('request', whereFn(), `запрос упал [${req.resourceType()}]: ${txt}`)
  })
  context.on('response', (r) => {
    net.set(r.url(), { status: r.status() })
    if (r.status() >= 400 && !IGNORE_REQUEST_FAIL.some((re) => re.test(r.url()))) {
      if (reported.has(r.url())) return
      reported.add(r.url())
      fail('request', whereFn(), `HTTP ${r.status()} на ${r.url()}`)
    }
  })
  return net
}

async function drainEarlyBuffer(page, where, reported) {
  const early = await page.evaluate(() => (window.__qa ? window.__qa.errors.splice(0) : []))
  for (const e of early) {
    if (IGNORE_CONSOLE.some((re) => re.test(e.text))) continue
    if (e.kind === 'resource' && e.url && reported.has(e.url)) continue
    fail('in-page', where, `${e.kind}: ${e.text}`)
  }
}

async function run() {
  await mkdir(OUT, { recursive: true })
  await ensureServer()

  const browser = await chromium.launch({ headless: true })
  try {
    for (const vp of VIEWPORTS) {
      const where = `${ROUTE} @ ${vp.width}`
      const reported = new Set()
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        baseURL: BASE,
      })
      const net = wireContext(context, () => where, reported)
      await context.addInitScript(EARLY_CAPTURE)
      const page = await context.newPage()
      try {
        const resp = await page.goto(ROUTE, { waitUntil: 'commit', timeout: 120_000 })
        if (resp && resp.status() >= 400) fail('nav', where, `навигация вернула HTTP ${resp.status()}`)
        await settle(page)
        await drainEarlyBuffer(page, where, reported)
        await checkOverflow(page, where, vp)
        await checkImages(page, where, net, reported)
        await checkContrast(page, where)
        await page.screenshot({
          path: path.join(OUT, `${vp.width}.png`),
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
        })
      } finally {
        await context.close()
      }
    }

    // reduced-motion проверяется и на телефоне, и на широком десктопе.
    for (const vp of [VIEWPORTS[0], VIEWPORTS[VIEWPORTS.length - 1]]) {
      const where = `${ROUTE} @ ${vp.width} prefers-reduced-motion:reduce`
      const reported = new Set()
      const rm = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        baseURL: BASE,
        reducedMotion: 'reduce',
      })
      wireContext(rm, () => where, reported)
      await rm.addInitScript(EARLY_CAPTURE)
      const rp = await rm.newPage()
      try {
        await rp.goto(ROUTE, { waitUntil: 'commit', timeout: 120_000 })
        const applied = await rp.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches
        )
        if (!applied) fail('reduced-motion', where, 'эмуляция prefers-reduced-motion не применилась')
        await settle(rp)
        await drainEarlyBuffer(rp, where, reported)
        await rp.screenshot({
          path: path.join(OUT, `${vp.width}-reduced-motion.png`),
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
        })
      } finally {
        await rm.close()
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
}

// --------------------------------------------------------------------- отчёт
const t0 = Date.now()
let crash = null
try {
  await run()
} catch (e) {
  crash = e
}

const errors = findings.filter((f) => f.level === 'error')
const warns = findings.filter((f) => f.level === 'warn')
const groups = new Map()
for (const f of findings) {
  if (!groups.has(f.where)) groups.set(f.where, [])
  groups.get(f.where).push(f)
}
console.log('\n' + '='.repeat(72))
console.log(`ПРОВЕРКА  ${BASE}${ROUTE}  ${(Date.now() - t0) / 1000}с`)
console.log('='.repeat(72))
for (const [where, list] of groups) {
  console.log(`\n${where}`)
  for (const f of list) {
    console.log(`  ${f.level === 'error' ? 'ПАДЕНИЕ' : 'внимание'}  [${f.check}] ${f.message}`)
    if (f.detail) console.log(f.detail)
  }
}
if (crash) console.log(`\nФАТАЛЬНО: ${crash.stack || crash.message}`)
console.log(`\nскриншоты: ${OUT}`)
console.log(`${errors.length} падений, ${warns.length} предупреждений`)
process.exitCode = crash || errors.length ? 1 : 0
