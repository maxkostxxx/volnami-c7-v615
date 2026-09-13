import type { Metadata } from 'next'
import Image from 'next/image'
import { site } from '@/content/site'
import Chrome from '../Chrome'
import Footer from '../Footer'
import '../c1.css'

/**
 * Концепт 1, страница кейса «Картофельный Кулёк».
 * Устройство — чередование визуалов и воздушных типографических секций.
 * Подзаголовки идут своей структурой (Задача / Решение / Почему фиолетовый /
 * Почему жёлтый / Форма / Итог) и к общему шаблону не приводятся.
 *
 * Визуалы — семь чистых мокапов из архива. Листы презентации
 * (`kulek-2..5.webp`) не подключаются: у них своя типографика, свои заливки,
 * собственный заголовок «ЗАДАЧА», противоречащий секции «Задача», и чужой
 * копирайт. Подробности — в комментарии к `visuals` в content/site.ts.
 *
 * Кадры разложены по смыслу секций: листовка и POS — к «Решению»,
 * развёртка — к «Форме», разворот с точкой продаж — к «Итогу».
 */

const kulek = site.cases.list.find((c) => c.slug === 'kulek')!

export const metadata: Metadata = {
  title: `${kulek.title} — ${site.brand.name}`,
  description: kulek.teaser,
}

type LeadBlock = Extract<(typeof kulek.blocks)[number], { kind: 'lead' }>
type SectionBlock = Extract<(typeof kulek.blocks)[number], { kind: 'section' }>

const lead = kulek.blocks.find((b): b is LeadBlock => b.kind === 'lead')!
const sections = kulek.blocks.filter((b): b is SectionBlock => b.kind === 'section')

const visual = (name: string) => kulek.visuals.find((v) => v.src.includes(name))!

function Block({ block }: { block: SectionBlock }) {
  return (
    <div className="c1-wrap c1-grid c1-case-block">
      <h2 className="c1-case-heading">{block.heading}</h2>
      <div className="c1-case-text">
        {block.paragraphs?.map((p) => (
          <p key={p.slice(0, 20)}>{p}</p>
        ))}
      </div>
    </div>
  )
}

/** Печатный макет: живёт в колонке сетки, а не встык к краю окна. */
function Sheet({ name, className }: { name: string; className?: string }) {
  const v = visual(name)
  return (
    <figure className={className ? `c1-figure ${className}` : 'c1-figure'}>
      <Image src={v.src} alt={v.alt} width={v.width} height={v.height} />
    </figure>
  )
}

/** Разворот из двух кадров одной пропорции, встык к краям окна. */
function Spread({ names }: { names: [string, string] }) {
  return (
    <div className="c1-figure-spread">
      {names.map((n) => {
        const v = visual(n)
        return (
          <figure key={v.src}>
            <Image src={v.src} alt={v.alt} width={v.width} height={v.height} />
          </figure>
        )
      })}
    </div>
  )
}

export default function CasePage() {
  const hero = visual('kulek-1')

  return (
    <div className="c1-root">
      <a className="c1-skip" href="#c1-main">{site.a11y.skipToContent}</a>
      <Chrome base="/c1" />

      <main className="c1-main" id="c1-main" tabIndex={-1}>
        {/*
          Кадр идёт от края до края окна, заголовок лежит на нём слева внизу.
          Затемнение уведено влево и вверх: под заголовком остаётся тёмная
          толща (иначе название дублировало бы золотой логотип, набранный
          в самом кадре), а плашка перестаёт стоять на светлой картошке.
        */}
        <section className="c1-case-hero" aria-labelledby="c1-case-title">
          <Image
            className="c1-case-hero-media"
            src={hero.src}
            alt={hero.alt}
            width={hero.width}
            height={hero.height}
            priority
          />
          <span className="c1-case-hero-scrim" aria-hidden="true" />
          <div className="c1-wrap c1-case-hero-caption">
            <h1 className="c1-case-title" id="c1-case-title">{kulek.title}</h1>
          </div>
        </section>

        {/*
          Дальше страница устроена той же титровой схемой, что и главная:
          подзаголовок кейса стоит в левом поле (колонки 1–2), текст — колонкой
          справа (3–8), на одной с ним горизонтали. Линеек нет ни одной,
          секции отбиваются сменой плоскости глубины и полноширинными кадрами
          (первый экран и закрывающий разворот). Макеты собраны в ту же
          плоскость, что и текст, к которому относятся: врозь плоскости
          пришлось бы менять девять раз и страница стала бы полосатой.
        */}
        <div className="c1-case-section c1-plane--near">
          <div className="c1-wrap c1-grid">
            <p className="c1-case-lead">{lead.text}</p>
          </div>

          {/* Задача и Решение */}
          <Block block={sections[0]} />
          <Block block={sections[1]} />

          {/* к «Решению»: листовка на открытие и постер акции */}
          <div className="c1-wrap c1-grid c1-case-figures">
            <Sheet name="kulek-flyer" className="c1-figure--half-left" />
            <Sheet name="kulek-pos" className="c1-figure--half-right" />
          </div>
        </div>

        {/* Почему фиолетовый и Почему жёлтый */}
        <div className="c1-case-section c1-plane--mid">
          <Block block={sections[2]} />
          <Block block={sections[3]} />

          {/* к цвету: фирменная жёлто-золотая еда на фиолетовом */}
          <div className="c1-wrap c1-grid c1-case-figures">
            <Sheet name="kulek-food" className="c1-figure--wide" />
          </div>
        </div>

        {/* Форма */}
        <div className="c1-case-section c1-plane--near">
          <Block block={sections[4]} />

          <div className="c1-wrap c1-grid c1-case-figures">
            <Sheet name="kulek-dieline" className="c1-figure--sheet" />
          </div>
        </div>

        {/* Итог */}
        <div className="c1-case-section c1-plane--mid">
          <Block block={sections[5]} />
        </div>

        <Spread names={['kulek-inhand', 'kulek-terrace']} />
      </main>

      <Footer base="/c1" />
    </div>
  )
}
