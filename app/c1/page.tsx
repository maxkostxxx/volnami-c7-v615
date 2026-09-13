import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import Chrome from './Chrome'
import Footer from './Footer'
import Testimonials from './Testimonials'
import './c1.css'

export const metadata: Metadata = {
  title: 'Концепт 01 — Глубина | Volnami',
}

/**
 * Концепт 1 — тёмный кинематографичный. Главная страница.
 * Весь текст берётся из content/site.ts, ни одной собственной строки.
 */

/** Курсив ставится только на служебном слове слогана, сам текст не меняется. */
function Slogan({ line }: { line: string }) {
  const parts = line.match(/^(.*?\s)(в)(\s.*)$/)
  if (!parts) return <>{line}</>
  return (
    <>
      {parts[1]}
      <i>{parts[2]}</i>
      {parts[3]}
    </>
  )
}

const steps = site.process.steps
const cases = site.cases.list.filter((c) => !c.pending)

export default function Page() {
  return (
    <div className="c1-root">
      <a className="c1-skip" href="#c1-main">{site.a11y.skipToContent}</a>
      <Chrome />

      <main className="c1-main" id="c1-main" tabIndex={-1}>
        {/* ------------------------------------------------ первый экран */}
        <section id="hero" className="c1-hero" aria-labelledby="c1-slogan" tabIndex={-1}>
          {/*
            Плейсхолдер кадра — каустика: свет входит в воду сверху справа
            и веером расходящихся полос уходит в толщу, гаснув с глубиной.
            Дуг фирменного знака здесь нет: дуга закреплена за другим
            концептом, а содержание этого первого экрана по спецификации —
            именно свет сквозь массу воды.
          */}
          {/*
            Кадр первого экрана. Каустический плейсхолдер на SVG снят —
            подставлена настоящая фотография, как и планировалось
            в design/image-prompts.md. .c1-depth остаётся носителем
            scroll-driven погружения, поэтому анимация не тронута.
            alt пустой намеренно: кадр декоративный, смысл несёт текст поверх,
            и озвучивать его скринридеру нечего.
          */}
          <div className="c1-depth" aria-hidden="true">
            <Image
              src="/hero/c1-hero.webp"
              alt=""
              width={2400}
              height={1350}
              priority
              sizes="100vw"
              className="c1-depth-img"
            />
          </div>

          <div className="c1-wrap c1-hero-content">
            <Image
              className="c1-hero-logo"
              src="/logo/volnami-full-pink.svg"
              alt={site.brand.name}
              width={280}
              height={198}
              priority
            />
            <h1 className="c1-slogan" id="c1-slogan">
              <Slogan line={site.hero.sloganLines[0]} />
              <br />
              {site.hero.sloganLines[1]}
            </h1>
            <p className="c1-hero-sub">{site.hero.subtitle}</p>
          </div>
        </section>

        {/* ------------------------------------------------------- о нас */}
        {/*
          Ниже первого экрана каждая секция устроена одинаково: титр в левом
          поле (колонки 1–2), содержание колонкой справа (колонки 3–8),
          обе части — на одной горизонтали. Разделительных линеек нет ни одной;
          секции отбиваются сменой плоскости глубины (c1-plane--near / --mid,
          через одну) и полноширинными кадрами лент кейсов.
        */}
        <section
          id="about"
          className="c1-section c1-plane--near"
          aria-labelledby="c1-about-title"
          tabIndex={-1}
        >
          <div className="c1-wrap c1-grid">
            <h2 className="c1-h2" id="c1-about-title">{site.about.title}</h2>
            <div className="c1-about-body">
              {site.about.paragraphs.map((p) => (
                <p key={p.slice(0, 20)} className="c1-body">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------- как мы работаем */}
        <section className="c1-section c1-plane--mid" aria-labelledby="c1-process-title">
          <div className="c1-wrap c1-grid">
            <h2 id="c1-process-title" className="c1-h2">
              {site.process.title}
            </h2>
            {/*
              Шаги собраны на subgrid: номера, заголовки и описания стоят
              в общих строках. Поэтому пустота под четвёртым шагом приходится
              ровно на строку, где у первых трёх текст, — это пауза,
              а не обрыв, и высоту она резервирует не сама.
            */}
            <ol className="c1-process">
              {steps.map((step, i) => {
                const final = i === steps.length - 1
                return (
                  <li
                    key={step.title}
                    className={[
                      'c1-step',
                      final ? 'c1-step--final' : '',
                      i === steps.length - 2 ? 'c1-step--before-final' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="c1-step-num">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className={final ? 'c1-step-title' : 'c1-h3 c1-step-title'}>
                      {step.title}
                    </h3>
                    {step.description ? (
                      <p className="c1-step-text">{step.description}</p>
                    ) : (
                      <div className="c1-step-pause" aria-hidden="true" />
                    )}
                    {final ? null : <span className="c1-step-arrow" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------- услуги */}
        <section
          id="services"
          className="c1-section c1-plane--near"
          aria-labelledby="c1-services-title"
          tabIndex={-1}
        >
          <div className="c1-wrap c1-grid">
            <h2 className="c1-h2" id="c1-services-title">{site.services.title}</h2>
            {/*
              Услуга читается сверху вниз одной колонкой: имя, лид, перечень,
              закрывающая реплика. Имени слева и текста справа нет, линеек
              между услугами и между пунктами перечня нет — услуги разводит
              воздух, а иерархию держат гарнитура и яркость.
            */}
            <div className="c1-services">
              {site.services.list.map((service) => (
                <article key={service.index} className="c1-service">
                  <h3 className="c1-h3 c1-service-title">{service.title}</h3>
                  <p className="c1-body c1-service-lead">{service.lead}</p>
                  <ul className="c1-service-items">
                    {service.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="c1-aside c1-service-closing">{service.closing}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ кейсы */}
        <section
          id="cases"
          className="c1-section c1-section--tight-bottom c1-plane--mid"
          aria-labelledby="c1-cases-title"
          tabIndex={-1}
        >
          <div className="c1-wrap c1-grid">
            <h2 className="c1-h2" id="c1-cases-title">{site.cases.title}</h2>
            {/*
              Ссылка — содержание титровой полосы: она стоит справа от титра
              и на его горизонтали, а не под ним и не в правом верхнем углу.
              target="_blank" снят — переход в новую вкладку нечем объявить,
              строки для этого в источнике текста нет.
            */}
            <a
              className="c1-cases-link c1-link"
              href={site.cases.portfolioLink.href}
              rel="noreferrer"
            >
              {site.cases.portfolioLink.label}
            </a>
          </div>

          {/*
            Ленты идут встык на всю ширину окна: страница листается
            как киноплёнка. Рост ленты назначает не сетка, а то, что
            в ленте есть. Есть кадр — 60vh, полный рост под визуал;
            кадра нет — рост ровно под текст, без резерва под картинку.
            Разница масштаба и есть сообщение: она честно показывает,
            где работа показана, а где её только называют.
          */}
          <div className="c1-bands">
            {cases.map((item) => {
              const visual = item.visuals[0]
              /*
                Подпись у обеих лент одна и сидит одинаково: нижний левый
                угол, боковое поле страницы, название антиквой 56. Разница
                одна — на ленте без кадра под названием идёт тизер кейса:
                показывать ей нечего, и рост ленты задаёт именно он.
              */
              const caption = (
                <div className="c1-band-caption">
                  <h3 className="c1-band-title">
                    <span>{item.title}</span>
                  </h3>
                  {visual ? null : (
                    <p className="c1-band-teaser">{item.teaser}</p>
                  )}
                </div>
              )

              /* Лента без кадра заливается surface и работает на одной
                 типографике; подчёркивания названия, которым помечена
                 рабочая ссылка, она не получает. */
              if (!visual) {
                return (
                  <article key={item.slug} className="c1-band c1-band--type">
                    {caption}
                  </article>
                )
              }

              const media = (
                <>
                  <Image
                    className="c1-band-media"
                    src={visual.src}
                    alt={visual.alt}
                    width={visual.width}
                    height={visual.height}
                  />
                  <span className="c1-band-scrim" aria-hidden="true" />
                  {caption}
                </>
              )

              return item.slug === 'kulek' ? (
                <Link key={item.slug} href="/c1/case" className="c1-band c1-band--visual c1-band--link">
                  {media}
                </Link>
              ) : (
                <article key={item.slug} className="c1-band c1-band--visual">
                  {media}
                </article>
              )
            })}
          </div>
        </section>

        {/* ----------------------------------------------------- отзывы */}
        <section
          id="testimonials"
          className="c1-section c1-plane--mid"
          aria-labelledby="c1-testimonials-title"
          tabIndex={-1}
        >
          <div className="c1-wrap c1-grid">
            <h2 className="c1-h2" id="c1-testimonials-title">{site.testimonials.title}</h2>
            {/* полоса стоит справа от титра и уходит встык к правому краю окна */}
            <Testimonials />
          </div>
        </section>

        {/* --------------------------------------------------- контакты */}
        <section
          id="contacts"
          className="c1-section c1-plane--near"
          aria-labelledby="c1-contacts-title"
          tabIndex={-1}
        >
          <div className="c1-wrap c1-grid">
            <h2 className="c1-h2" id="c1-contacts-title">{site.contacts.title}</h2>

            <div className="c1-contacts-body">
              {site.contacts.paragraphs.map((p) => (
                <p key={p.slice(0, 20)} className="c1-body">
                  {p}
                </p>
              ))}
              {/* Для хостингового превью CTA открывает уже указанный в ТЗ
                  email. Бэкенд и форма по-прежнему не добавляются. */}
              <p className="c1-contacts-cta">
                <a href={site.contacts.email.href} className="c1-btn c1-btn--lg">
                  {site.contacts.cta.label}
                </a>
              </p>
            </div>

            <ul className="c1-contacts-list">
              {[site.contacts.telegram, site.contacts.email, site.contacts.phone].map(
                (c) => (
                  <li key={c.href}>
                    <span className="c1-contacts-label">{c.label}</span>
                    <a className="c1-contacts-value c1-link" href={c.href}>
                      {c.value}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
