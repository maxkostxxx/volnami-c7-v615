import Image from 'next/image'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import { TopBar } from './top-bar'
import { SiteFooter } from './footer'
import { CasesList } from './cases'
import { TestimonialStrip } from './testimonials'
import { HeroObject, StepArrow } from './marks'
import { Display } from './type'
import './c2.css'

export const metadata: Metadata = {
  title: 'Концепт 02 — Предмет | Volnami',
}

/**
 * Концепт 2 — светлый предметный.
 * Холодная почти белая база, один предметный кадр, тонкая антиква,
 * ровно один цветной удар — полоса процесса, залитая фирменным зелёным.
 *
 * Ниже первого экрана страница собрана полосами. Каждая секция — полоса
 * во всю ширину окна со своим фоном, `paper` и `card` через одну; граница
 * между секциями — смена тона, а не линейка. Полоса процесса залита `ink`
 * и в чередование не входит. Заголовок каждой полосы стоит по центру
 * над своим текстом — ось выравнивания у концепта одна на всю страницу.
 */
export default function Page() {
  return (
    <>
      <a className="c2-skip" href="#c2-main">{site.a11y.skipToContent}</a>
      <TopBar />

      <main className="c2-root" id="c2-main" tabIndex={-1}>
        {/* ------------------------------------------------ первый экран */}
        <section className="c2-hero" id="hero" aria-labelledby="c2-slogan" tabIndex={-1}>
          <div className="c2-wrap c2-grid">
            <div className="c2-hero-logo">
              <Image
                src="/logo/volnami-full-green.svg"
                alt={site.brand.name}
                width={226}
                height={160}
                priority
              />
            </div>

            <h1 className="c2-slogan" id="c2-slogan">
              {site.hero.sloganLines.map((line, i) => (
                <span className="c2-slogan-line" key={i}>
                  <Display text={line} />
                </span>
              ))}
            </h1>

            <p className="c2-hero-sub">{site.hero.subtitle}</p>

            <div className="c2-hero-object">
              <HeroObject />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- о нас */}
        <section
          className="c2-band c2-band--card"
          id="about"
          aria-labelledby="c2-about-title"
          tabIndex={-1}
        >
          <div className="c2-wrap">
            <h2 className="c2-h2" id="c2-about-title">
              <Display text={site.about.title} />
            </h2>
            <div className="c2-measure c2-measure--center c2-editorial-copy">
              {site.about.paragraphs.map((p, i) => (
                <p
                  className={i === 0 ? 'c2-p c2-p--lead' : 'c2-p c2-p--note'}
                  key={p.slice(0, 24)}
                >
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------- как мы работаем */}
        <section
          className="c2-band c2-band--ink c2-process"
          aria-labelledby="c2-process-title"
        >
          <div className="c2-wrap">
            <h2 className="c2-h2" id="c2-process-title">
              <Display text={site.process.title} />
            </h2>

            <ol className="c2-steps">
              {site.process.steps.map((step, i) => {
                const last = i === site.process.steps.length - 1
                return (
                  <li
                    className={`c2-step${last ? ' c2-step--plate' : ''}`}
                    key={step.title}
                  >
                    <span className="c2-step-no">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="c2-step-title">
                      <Display text={step.title} />
                    </h3>
                    {step.description ? (
                      <p className="c2-step-text">{step.description}</p>
                    ) : null}
                    {!last ? <StepArrow order={(i + 1) as 1 | 2 | 3} /> : null}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------ услуги */}
        {/* Четыре услуги — четыре полосы подряд, тон через одну. Раньше это
            был один столбик в полторы тысячи пикселей: четыре имени, четыре
            перечня и ничего, что бы их разделяло, кроме отбива. Теперь
            граница каждой услуги видна во всю ширину окна. */}
        <section
          className="c2-services"
          id="services"
          aria-labelledby="c2-services-title"
          tabIndex={-1}
        >
          {site.services.list.map((s, i, all) => {
            const first = i === 0
            const last = i === all.length - 1
            const band = [
              'c2-band',
              i % 2 === 0 ? 'c2-band--paper' : 'c2-band--card',
              'c2-band--tight',
              first ? 'c2-band--open' : '',
              last ? 'c2-band--close' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div className={band} key={s.title}>
                <div className="c2-wrap">
                  {first ? (
                    <h2 className="c2-h2 c2-h2--group" id="c2-services-title">
                      <Display text={site.services.title} />
                    </h2>
                  ) : null}

                  <article className="c2-service">
                    <h3 className="c2-service-title">
                      <Display text={s.title} />
                    </h3>
                    <div className="c2-service-body">
                      <p className="c2-service-lead">{s.lead}</p>
                      <ul className="c2-service-items">
                        {s.items.map((it) => (
                          <li className="c2-service-item" key={it}>
                            {it}
                          </li>
                        ))}
                      </ul>
                      <p className="c2-service-closing">{s.closing}</p>
                    </div>
                  </article>
                </div>
              </div>
            )
          })}
        </section>

        {/* ------------------------------------------------------- кейсы */}
        <section
          className="c2-band c2-band--paper"
          id="cases"
          aria-labelledby="c2-cases-title"
          tabIndex={-1}
        >
          <div className="c2-wrap">
            <h2 className="c2-h2" id="c2-cases-title">
              <Display text={site.cases.title} />
            </h2>
            <CasesList />
            <p className="c2-portfolio">
              <a
                className="c2-link"
                href={site.cases.portfolioLink.href}
              >
                {site.cases.portfolioLink.label}
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ отзывы */}
        <section
          className="c2-band c2-band--card"
          id="testimonials"
          aria-labelledby="c2-testimonials-title"
          tabIndex={-1}
        >
          <div className="c2-wrap">
            <h2 className="c2-h2" id="c2-testimonials-title">
              <Display text={site.testimonials.title} />
            </h2>
          </div>
          <TestimonialStrip />
        </section>

        {/* ---------------------------------------------------- контакты */}
        <section
          className="c2-band c2-band--paper c2-contacts"
          id="contacts"
          aria-labelledby="c2-contacts-title"
          tabIndex={-1}
        >
          <div className="c2-wrap">
            <h2 className="c2-h2" id="c2-contacts-title">
              <Display text={site.contacts.title} />
            </h2>
            <div className="c2-measure c2-measure--center c2-editorial-copy">
              {site.contacts.paragraphs.map((p, i) => (
                <p
                  className={i === 0 ? 'c2-p c2-p--lead' : 'c2-p c2-p--note'}
                  key={p.slice(0, 24)}
                >
                  {p}
                </p>
              ))}
            </div>

            {/* Для хостингового превью CTA открывает уже указанный в ТЗ
                email. Бэкенд и форма по-прежнему не добавляются. */}
            <p className="c2-contacts-cta">
              <a href={site.contacts.email.href} className="c2-pill c2-pill--lg">
                {site.contacts.cta.label}
              </a>
            </p>

            <dl className="c2-contacts-list">
              <div className="c2-contact">
                <dt className="c2-contact-label">
                  {site.contacts.telegram.label}
                </dt>
                <dd className="c2-contact-value">
                  <a
                    className="c2-link"
                    href={site.contacts.telegram.href}
                  >
                    {site.contacts.telegram.value}
                  </a>
                </dd>
              </div>
              <div className="c2-contact">
                <dt className="c2-contact-label">{site.contacts.email.label}</dt>
                <dd className="c2-contact-value">
                  <a className="c2-link" href={site.contacts.email.href}>
                    {site.contacts.email.value}
                  </a>
                </dd>
              </div>
              <div className="c2-contact">
                <dt className="c2-contact-label">{site.contacts.phone.label}</dt>
                <dd className="c2-contact-value">
                  <a className="c2-link" href={site.contacts.phone.href}>
                    {site.contacts.phone.value}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
