import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const archiveConcepts = [
  ['c1', 'Тёмный кинематографичный', 'Глубина воды, антиква и крупные проектные полосы.', 'архив первой волны'],
  ['c2', 'Светлый предметный', 'Тихая предметная композиция, воздух и редакционная точность.', 'архив первой волны'],
  ['c3', 'Типографический', 'Фирменная типографика, зелёное поле и графическая система дуг.', 'архив первой волны'],
]
const finalists = [
  ['c4', 'Портфель в пространстве', 'Настоящая WebGL-сцена: упаковка из кейса становится физическим выставочным объектом.', 'новое направление'],
  ['c5', 'Доказательства', 'Жёсткий чёрно-белый редакционный индекс, где работу доказывает само портфолио.', 'новое направление'],
  ['c6', 'Сцена', 'Фотографическая драматургия и управляемый свет на реальном кадре конференции.', 'новое направление'],
]

function cards(concepts) {
  return concepts.map(([route, title, description, state]) => {
    const png = readFileSync(resolve(root, 'screenshots', route, '1440.png')).toString('base64')
    return `<article class="concept">
      <div class="meta"><span>${state}</span><span>/${route}</span></div>
      <h2>${title}</h2><p>${description}</p>
      <figure class="shot">
        <img src="data:image/png;base64,${png}" alt="Полная страница концепта ${title}">
      </figure>
    </article>`
  }).join('\n')
}

function document({ title, heading, intro, concepts }) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:"><title>${title}</title><style>
:root{--ink:#101010;--muted:#5e5e5e;--rule:#c8c8c8;--paper:#fff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.wrap{max-width:1240px;margin:auto;padding:56px 28px 100px}header{display:grid;grid-template-columns:2fr 1fr;gap:40px;padding-bottom:48px;border-bottom:1px solid var(--rule)}h1{font-size:clamp(42px,7vw,92px);line-height:.92;letter-spacing:-.055em;margin:0;max-width:10ch}header p{font-size:18px;max-width:42ch;margin:0;align-self:end}.grid{display:grid;grid-template-columns:1fr 1fr;gap:80px 28px;padding-top:72px}.concept{min-width:0}.meta{display:flex;justify-content:space-between;border-top:1px solid var(--ink);padding-top:10px;color:var(--muted);font-size:13px}.concept h2{font-size:32px;line-height:1;margin:24px 0 10px;letter-spacing:-.035em}.concept>p{min-height:48px;max-width:50ch;color:var(--muted)}.shot{height:620px;margin:0;overflow:auto;border:1px solid var(--rule);background:#eee;overscroll-behavior:contain}.shot img{display:block;width:100%;height:auto}@media(max-width:760px){.wrap{padding:32px 16px 70px}header,.grid{grid-template-columns:1fr}.grid{gap:60px}.shot{height:520px}header p{margin-top:24px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main class="wrap"><header><h1>${heading}</h1><p>${intro}</p></header><section class="grid" aria-label="Концепты">${cards(concepts)}</section></main></body></html>`
}

writeFileSync(resolve(root, 'Volnami-3-finalista.html'), document({
  title: 'Volnami — три финальных концепта',
  heading: 'Volnami — три финальных концепта',
  intro: 'Три самостоятельных направления на реальных работах агентства. Каждый полный кадр можно прокрутить внутри рамки.',
  concepts: finalists,
}))

writeFileSync(resolve(root, 'Volnami-6-konceptov.html'), document({
  title: 'Volnami — полный архив концептов',
  heading: 'Volnami — полный архив концептов',
  intro: 'Финальная тройка показана первой. Исходные варианты сохранены ниже как архив и резерв.',
  concepts: [...finalists, ...archiveConcepts],
}))

console.log('Volnami-3-finalista.html')
console.log('Volnami-6-konceptov.html')
