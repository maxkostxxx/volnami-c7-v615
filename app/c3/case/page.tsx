import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'
import { Chrome } from '../chrome'
import { Contacts } from '../contacts'
import { Footer } from '../footer'
import '../c3.css'

/**
 * Страница кейса «Картофельный Кулёк».
 *
 * Главная сначала говорит типографикой и показывает только три небольшие
 * миниатюры портфолио. Здесь агентство раскрывает работу: после текстового
 * первого экрана визуал въезжает во всю ширину,
 * обрезанный сверху фирменной дугой. Дальше чередование воздушных
 * типографических секций и кадров.
 *
 * Структура подзаголовков у Кулька своя (Задача / Решение / Почему фиолетовый /
 * Почему жёлтый / Форма / Итог) и к общему шаблону не приводится.
 *
 * Кадры — семь чистых мокапов из `content/site.ts`. Слайды презентации
 * (`kulek-2..5.webp`) не подключаются: у них своя типографика и свои
 * заголовки, спорящие с текстом страницы. Порядок расставлен по смыслу кейса:
 * листовка и POS — к «Решению», кулёк в руке и еда — к «Почему жёлтый»,
 * развёртка — к «Форме», веранда — к «Итогу».
 */

const kulek = site.cases.list.find((item) => item.slug === 'kulek')!
const V = kulek.visuals

/**
 * Своё имя во вкладке. Без него страница наследовала заголовок макета
 * «Volnami — креативное агентство полного цикла», и кейс было не отличить
 * от главной. Обе строки — из `content/site.ts`, ничего не сочинено:
 * название кейса и имя бренда, описание — тот же лид, что стоит на странице.
 */
export const metadata: Metadata = {
  title: `${kulek.title} — ${site.brand.name}`,
  description: kulek.teaser,
}

type Visual = (typeof V)[number]
type Section = { heading: string; paragraphs: readonly string[] }

const sections: Section[] = []
let leadText = ''
for (const block of kulek.blocks) {
  if (block.kind === 'lead') {
    leadText = block.text
  } else if (block.kind === 'section' && block.paragraphs) {
    sections.push({ heading: block.heading, paragraphs: block.paragraphs })
  }
}

/** Полноширинный кадр. Первый обрезан сверху дугой — кадр въезжает волной. */
function Bleed({ visual, arc = false }: { visual: Visual; arc?: boolean }) {
  return (
    <div className={arc ? 'c3-bleed c3-bleed-arc' : 'c3-bleed'}>
      <Image
        src={visual.src}
        alt={visual.alt}
        width={visual.width}
        height={visual.height}
        sizes="100vw"
        priority={arc}
      />
    </div>
  )
}

/**
 * Пара кадров. Ширины колонок заданы пропорциями самих кадров, поэтому оба
 * заканчиваются на одной высоте, а внутренний масштаб остаётся читаемым.
 */
function Pair({ left, right }: { left: Visual; right: Visual }) {
  return (
    <div className="c3-pair c3-band">
      {[left, right].map((visual) => (
        <Image
          key={visual.src}
          src={visual.src}
          alt={visual.alt}
          width={visual.width}
          height={visual.height}
          sizes="50vw"
          style={{ '--c3-ar': visual.width / visual.height } as CSSProperties}
        />
      ))}
    </div>
  )
}

/** Одиночный вертикальный кадр: во всю ширину он занял бы два экрана. */
function Figure({ visual }: { visual: Visual }) {
  return (
    <div className="c3-figure c3-band">
      <Image
        src={visual.src}
        alt={visual.alt}
        width={visual.width}
        height={visual.height}
        sizes="680px"
      />
    </div>
  )
}

/** Что встаёт после каждой секции. Индексы — по порядку блоков в site.ts. */
function afterSection(index: number) {
  switch (index) {
    case 1: // Решение — листовка к открытию и POS-постер акции
      return <Pair left={V[4]} right={V[5]} />
    case 3: // Почему жёлтый — цвет самого продукта
      return <Pair left={V[1]} right={V[3]} />
    case 4: // Форма — развёртка кулька с размерами
      return <Bleed visual={V[2]} />
    case 5: // Итог — точка продаж целиком
      return <Figure visual={V[6]} />
    default:
      return null
  }
}

export default function CasePage() {
  return (
    /* Обёртка, а не <main>: у страницы появился подвал, а contentinfo внутри
       main лендмарком не считается. Заодно шапка перестала лежать внутри main. */
    <div className="c3-root">
      <a className="c3-skip" href="#c3-case-main">{site.a11y.skipToContent}</a>
      <Chrome base="/c3" />

      <main id="c3-case-main" tabIndex={-1}>
        <section className="c3-case-hero" aria-labelledby="c3-case-title">
          <Link className="c3-logo" href="/c3">
            <Image
              className="c3-logo-icon"
              src="/logo/volnami-icon-pink.svg"
              alt=""
              width={53}
              height={60}
              priority
            />
            <Image
              className="c3-logo-word"
              src="/logo/volnami-wordmark-pink.svg"
              alt={site.brand.name}
              width={99}
              height={32}
              priority
            />
          </Link>

          <h1 className="c3-case-title" id="c3-case-title">
            {kulek.title}
          </h1>

          <div className="c3-wrap">
            <p className="c3-case-lead">{leadText}</p>
          </div>
        </section>

        <Bleed visual={V[0]} arc />

        {sections.map((section, i) => (
          <Fragment key={section.heading}>
            {/* Тот же корешок, что и на главной: заголовок сбоку, текст
                узкой колонкой правее, с одной верхней линии. */}
            <section className="c3-sec" aria-labelledby={`c3-case-section-${i + 1}`}>
              <h2 className="c3-case-h2" id={`c3-case-section-${i + 1}`}>{section.heading}</h2>
              <div className="c3-sec-text">
                {section.paragraphs.map((text) => (
                  <p className="c3-body" key={text.slice(0, 24)}>
                    {text}
                  </p>
                ))}
              </div>
            </section>

            {afterSection(i)}
          </Fragment>
        ))}

        <Contacts />
      </main>

      <Footer base="/c3" />
    </div>
  )
}
