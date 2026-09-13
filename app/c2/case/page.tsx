import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { site, type CaseBlock, type CaseVisual } from '@/content/site'
import { TopBar } from '../top-bar'
import { SiteFooter } from '../footer'
import { Display } from '../type'
import '../c2.css'

const kulek = site.cases.list.find((c) => c.slug === 'kulek')!

const blocks = kulek.blocks as readonly CaseBlock[]
const visuals = kulek.visuals as readonly CaseVisual[]

type Section = Extract<CaseBlock, { kind: 'section' }>
type Tone = 'paper' | 'card'

const lead = blocks.find(
  (b): b is Extract<CaseBlock, { kind: 'lead' }> => b.kind === 'lead'
)
const sections = blocks.filter((b): b is Section => b.kind === 'section')

/**
 * Своё имя во вкладке. Без него страница кейса наследует заголовок корневого
 * макета, и в соседних вкладках её не отличить от главной.
 * Новых строк тут нет: имя кейса и имя бренда взяты из `content/site.ts`,
 * тире между ними — пунктуация, а не текст.
 */
export const metadata: Metadata = {
  title: `${kulek.title} — ${site.brand.name}`,
  description: kulek.teaser,
}

/** Раздел по заголовку: порядок кадров и порядок текста связаны по смыслу,
    а не по номерам, поэтому обращаться к ним по индексу нельзя. */
const part = (heading: string) => sections.find((s) => s.heading === heading)!

/** Кадр по имени файла — по той же причине. */
const shot = (name: string) =>
  visuals.find((v) => v.src.endsWith(`/${name}.webp`))!

/**
 * Полноширинный визуал встык к соседним полосам. Кадр здесь сам себе полоса:
 * его края и есть границы, поэтому падинга у него нет.
 */
function Bleed({ v }: { v: CaseVisual }) {
  return (
    <figure className="c2-band c2-band--flush c2-bleed">
      <Image
        className="c2-bleed-img"
        src={v.src}
        alt={v.alt}
        width={v.width}
        height={v.height}
        sizes="100vw"
        priority
      />
    </figure>
  )
}

/**
 * Полоса с кадром в колонке: фон полосы, кадр по центру контейнера.
 * Портретным кадрам своя, более узкая мера — в колонке 900px вертикальный
 * макет вырастает почти в полтора экрана и перестаёт читаться как кадр.
 */
function Frame({
  v,
  tone,
  portrait,
}: {
  v: CaseVisual
  tone: Tone
  portrait?: boolean
}) {
  return (
    <div className={`c2-band c2-band--${tone}`}>
      <figure className={`c2-plate${portrait ? ' c2-plate--portrait' : ''}`}>
        <Image
          className="c2-plate-img"
          src={v.src}
          alt={v.alt}
          width={v.width}
          height={v.height}
          sizes={portrait ? '560px' : '900px'}
        />
      </figure>
    </div>
  )
}

/**
 * Полоса с парой кадров в одну высоту. Ширины расходятся по пропорциям
 * кадров (`flex-grow` = ширина / высота при нулевой базе), поэтому нижние
 * и верхние края совпадают без обрезки.
 */
function Pair({ a, b, tone }: { a: CaseVisual; b: CaseVisual; tone: Tone }) {
  return (
    <div className={`c2-band c2-band--${tone}`}>
      <div className="c2-sheets">
        {[a, b].map((v) => (
          <figure
            key={v.src}
            className="c2-sheet"
            style={{ flexGrow: v.width / v.height }}
          >
            <Image
              className="c2-sheet-img"
              src={v.src}
              alt={v.alt}
              width={v.width}
              height={v.height}
              sizes="(min-width: 1000px) 440px, 45vw"
            />
          </figure>
        ))}
      </div>
    </div>
  )
}

/**
 * Текстовая полоса: заголовок по центру, колонка 620px под ним, свой фон
 * во всю ширину окна. Каждый раздел кейса — отдельная полоса, поэтому
 * границу между «Задачей» и «Решением» видно так же, как границу
 * между текстом и кадром.
 */
function Prose({ item, tone }: { item: Section; tone: Tone }) {
  const headingId = `c2-case-${item.heading.toLowerCase().replaceAll(' ', '-')}`

  return (
    <section className={`c2-band c2-band--${tone}`} aria-labelledby={headingId}>
      <div className="c2-wrap">
        <h2 className="c2-h2" id={headingId}>
          <Display text={item.heading} />
        </h2>
        <div className="c2-measure c2-measure--center">
          {item.paragraphs?.map((p) => (
            <p className="c2-p" key={p.slice(0, 24)}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Страница кейса «Картофельный Кулёк».
 *
 * Страница собрана теми же полосами, что и главная: каждый раздел и каждый
 * кадр стоят на своём фоне, `paper` и `card` идут через одну, границу держит
 * смена тона, а не линейка. Раньше все шесть разделов лежали в двух общих
 * секциях по бумаге, и ниже шапки страница читалась одним столбиком текста
 * с картинками между кусками.
 *
 * Кадры стоят там, куда относятся по смыслу: листовка и постер акции —
 * к «Решению», упаковка в руке и еда — к «Почему фиолетовый / Почему жёлтый»,
 * развёртка — к «Форме», оформление точки — к «Итогу».
 *
 * На странице только чистые мокапы. Слайды презентации (`kulek-2..5`)
 * не подключаются: у них своя типографика и свои заголовки, один из которых
 * ставит собственную «ЗАДАЧУ» поперёк раздела «Задача» этой же страницы,
 * а на другом стоит копирайт сторонней студии.
 */
export default function CasePage() {
  return (
    <>
      <a className="c2-skip" href="#c2-case-main">{site.a11y.skipToContent}</a>
      <TopBar base="/c2" mark />

      <main className="c2-root" id="c2-case-main" tabIndex={-1}>
        <section className="c2-case-head" aria-labelledby="c2-case-title">
          <div className="c2-wrap c2-grid">
            <h1 className="c2-case-title" id="c2-case-title">
              <Display text={kulek.title} />
            </h1>
            {lead ? <p className="c2-case-lead">{lead.text}</p> : null}
          </div>
        </section>

        <Bleed v={shot('kulek-1')} />

        <Prose item={part('Задача')} tone="paper" />
        <Prose item={part('Решение')} tone="card" />

        <Pair a={shot('kulek-flyer')} b={shot('kulek-pos')} tone="paper" />

        <Prose item={part('Почему фиолетовый')} tone="card" />
        <Prose item={part('Почему жёлтый')} tone="paper" />

        <Pair a={shot('kulek-inhand')} b={shot('kulek-food')} tone="card" />

        <Prose item={part('Форма')} tone="paper" />

        <Frame v={shot('kulek-dieline')} tone="card" />

        <Prose item={part('Итог')} tone="paper" />

        <Frame v={shot('kulek-terrace')} tone="card" portrait />

        <div className="c2-band c2-band--paper">
          <div className="c2-wrap">
            <Link className="c2-link c2-back" href="/c2#cases">
              <Display text={site.cases.title} />
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter base="/c2" />
    </>
  )
}
