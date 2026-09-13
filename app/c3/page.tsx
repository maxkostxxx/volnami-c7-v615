import { Fragment } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import { Chrome } from './chrome'
import { Contacts } from './contacts'
import { Footer } from './footer'
import { Testimonials } from './testimonials'
import { HeroArcs, StepArrow } from './arcs'
import './c3.css'

export const metadata: Metadata = {
  title: 'Концепт 03 — Типографика | Volnami',
}

/**
 * Концепт 3 — типографический. Первый экран без единого растрового кадра:
 * героем работает набор и фирменная дуга. Полноразмерные кадры по-прежнему
 * живут только на странице кейса; на главной от них осталась миниатюра
 * в строке индекса — маркер строки высотой в верхнюю ступень ритма, не больше.
 */

const [sloganTop, sloganBottom] = site.hero.sloganLines
const steps = site.process.steps
const cases = site.cases.list.filter((item) => !item.pending)

function SloganLine({ text }: { text: string }) {
  const marker = ' в '
  const markerAt = text.indexOf(marker)

  return (
    <span className="c3-slogan-line">
      {markerAt < 0 ? text : (
        <>
          {text.slice(0, markerAt + 1)}
          <span className="c3-slogan-svc">в</span>
          {text.slice(markerAt + 2)}
        </>
      )}
    </span>
  )
}

export default function Page() {
  return (
    /* Обёртка, а не <main>: у страницы появился подвал, а contentinfo внутри
       main лендмарком не считается. Заодно шапка перестала лежать внутри
       main — banner там был такой же ошибкой структуры документа. */
    <div className="c3-root">
      <a className="c3-skip" href="#c3-main">{site.a11y.skipToContent}</a>
      <Chrome />

      <main id="c3-main" tabIndex={-1}>
        <section className="c3-hero" id="hero" aria-labelledby="c3-slogan" tabIndex={-1}>
          {/* На главной логотип — не ссылка: вести со страницы на неё же нечем. */}
          <div className="c3-logo">
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
          </div>

          <HeroArcs />

          <h1 className="c3-slogan" id="c3-slogan">
            <SloganLine text={sloganTop} />
            <SloganLine text={sloganBottom} />
          </h1>

          <div className="c3-wrap">
            <p className="c3-hero-sub">{site.hero.subtitle}</p>
          </div>
        </section>

        <section className="c3-sec" id="about" aria-labelledby="c3-about" tabIndex={-1}>
          <h2 className="c3-h2" id="c3-about">
            {site.about.title}
          </h2>
          <div className="c3-sec-text">
            {site.about.paragraphs.map((text) => (
              <p className="c3-body" key={text.slice(0, 24)}>
                {text}
              </p>
            ))}
          </div>
        </section>

        {/* Полоса «Как мы работаем»: пункта в меню не имеет. */}
        <section className="c3-process" aria-labelledby="c3-process-title">
          {/* Дуга полосы — граница эллипса, а не картинка: см. c3.css. */}
          <div className="c3-process-arc" aria-hidden="true" />
          <div className="c3-process-inner c3-band">
            <h2 className="c3-h2 c3-process-title" id="c3-process-title">
              {site.process.title}
            </h2>

            <div className="c3-steps">
              {steps.slice(0, 3).map((step, i) => (
                <Fragment key={step.title}>
                  {i > 0 ? (
                    <StepArrow className={`c3-arrow ${i === 1 ? 'c3-arrow-a' : 'c3-arrow-b'}`} />
                  ) : null}
                  <div className={`c3-step c3-step-${i + 1}`}>
                    <p className="c3-step-num">{`0${i + 1}`}</p>
                    <h3 className="c3-step-title">{step.title}</h3>
                    <p className="c3-step-desc">{step.description}</p>
                  </div>
                </Fragment>
              ))}

              <StepArrow className="c3-arrow c3-arrow-c" />

              {/* Гребень дуги. Описания нет намеренно. */}
              <div className="c3-step-crest">
                <p className="c3-step-num">04</p>
                <h3 className="c3-step-title">{steps[3].title}</h3>
              </div>
            </div>
          </div>
        </section>

        <section className="c3-sec" id="services" aria-labelledby="c3-services" tabIndex={-1}>
          <h2 className="c3-h2" id="c3-services">
            {site.services.title}
          </h2>

          <div className="c3-services c3-sec-wide">
            {site.services.list.map((service) => (
              <article className="c3-service" key={service.title}>
                <h3 className="c3-service-title">{service.title}</h3>
                <div>
                  <p className="c3-service-lead">{service.lead}</p>
                  <ul className="c3-service-items">
                    {service.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="c3-service-closing">{service.closing}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Текстовый индекс: имя во всю колонку, выдержка у берега, линейка
            между строками — единственные линейки концепта. Сеткой строки
            он и остаётся; миниатюра встаёт под именем и в шесть раз мельче
            кадра на странице кейса. */}
        <section className="c3-sec" id="cases" aria-labelledby="c3-cases" tabIndex={-1}>
          <h2 className="c3-h2" id="c3-cases">
            {site.cases.title}
          </h2>

          <ul className="c3-index c3-sec-wide">
            {cases.map((item) => {
              // Лицо кейса — первый кадр: порядок визуалов в site.ts выставлен
              // так, что первым стоит именно айдентика, а не репортаж.
              const [thumb] = item.visuals
              return (
                <li className="c3-index-row" key={item.slug}>
                  {/* Имя и миниатюра — один блок: иначе высоту первого ряда
                      задаёт выдержка справа, и у односложных имён
                      («ЭкоРанчо») миниатюра отрывается от строки на сотню
                      пикселей и повисает сама по себе. */}
                  <div className="c3-index-name">
                    <h3 className="c3-index-title">
                      {item.slug === 'kulek' ? (
                        <Link className="c3-index-link" href="/c3/case">
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </h3>

                    {/* У четырёх кейсов из семи визуалов нет и не будет. Строка
                        идёт без миниатюры, и места под неё не отводится:
                        пустой врезки под картинку в строке не остаётся. */}
                    {thumb ? (
                      <Image
                        className="c3-index-thumb"
                        src={thumb.src}
                        alt={thumb.alt}
                        width={thumb.width}
                        height={thumb.height}
                        sizes="200px"
                      />
                    ) : null}
                  </div>

                  <p className="c3-index-teaser">{item.teaser}</p>
                </li>
              )
            })}
          </ul>

          <p className="c3-portfolio c3-sec-wide">
            <a href={site.cases.portfolioLink.href}>
              {site.cases.portfolioLink.label}
            </a>
          </p>
        </section>

        <section
          className="c3-quotes-section"
          id="testimonials"
          aria-labelledby="c3-testimonials"
          tabIndex={-1}
        >
          <h2 className="c3-h2" id="c3-testimonials">
            {site.testimonials.title}
          </h2>
          <Testimonials />
        </section>

        <Contacts id="contacts" />
      </main>

      <Footer />
    </div>
  )
}
