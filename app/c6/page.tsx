import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import { C6Chrome } from './chrome'
import { C6Spotlight } from './spotlight'
import { C6Testimonials } from './testimonials'
import './tokens.css'
import './c6.css'
import './hero-v2.css'

export const metadata: Metadata = {
  title: 'Концепт 06 — Сцена | Volnami',
}

export default function C6Page() {
  return <div className="c6">
    <a className="c6-skip" href="#c6-main">{site.a11y.skipToContent}</a>
    <C6Chrome />
    <main id="c6-main" tabIndex={-1}>
      <C6Spotlight />

      <section className="c6-about" id="about" aria-labelledby="c6-about-title" tabIndex={-1}>
        <h2 id="c6-about-title">{site.about.title}</h2>
        <div className="c6-about-copy">{site.about.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>

      <section className="c6-process" aria-labelledby="c6-process-title">
        <h2 id="c6-process-title">{site.process.title}</h2>
        <ol tabIndex={0} aria-label={site.process.title}>{site.process.steps.map((step, index) => <li key={step.title} className={index === 3 ? 'c6-process-scene c6-process-final' : 'c6-process-scene'}>
          <div><h3>{step.title}</h3>{step.description ? <p>{step.description}</p> : null}</div>
        </li>)}</ol>
      </section>

      <section className="c6-services" id="services" aria-labelledby="c6-services-title" tabIndex={-1}>
        <h2 id="c6-services-title">{site.services.title}</h2>
        <div className="c6-service-scenes">{site.services.list.map((service) => <article key={service.title} className="c6-service-scene">
          <h3>{service.title}</h3>
          <div>
            <p className="c6-service-lead">{service.lead}</p>
            <ul>{service.items.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="c6-service-close">{service.closing}</p>
          </div>
        </article>)}</div>
      </section>

      <section className="c6-cases" id="cases" aria-labelledby="c6-cases-title" tabIndex={-1}>
        <div className="c6-section-head">
          <h2 id="c6-cases-title">{site.cases.title}</h2>
          <a href={site.cases.portfolioLink.href}>{site.cases.portfolioLink.label}</a>
        </div>
        <div className="c6-case-panorama" role="region" tabIndex={0} aria-label={site.cases.title}>
          {site.cases.list.map((item, index) => {
            const visual = item.visuals[0]
            const title = index === 0
              ? <Link href="/c6/case">{item.title}</Link>
              : item.externalLink
                ? <a href={item.externalLink.href}>{item.title}</a>
                : item.title
            return <article key={item.slug} className={`c6-case-panel c6-case-panel-${index + 1}${visual ? ' has-image' : ' is-text'}`}>
              {visual ? <Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 900px) 84vw, 58vw" /> : null}
              <div style={{ backgroundColor: 'var(--c6-ink)' }}><h3>{title}</h3>{!item.pending ? <p>{item.teaser}</p> : null}</div>
            </article>
          })}
        </div>
      </section>

      <section className="c6-testimonials" id="testimonials" aria-labelledby="c6-testimonials-title" tabIndex={-1}>
        <h2 id="c6-testimonials-title">{site.testimonials.title}</h2>
        <C6Testimonials />
      </section>

      <section className="c6-contacts" id="contacts" aria-labelledby="c6-contacts-title" tabIndex={-1}>
        <h2 id="c6-contacts-title">{site.contacts.title}</h2>
        <div className="c6-contact-copy">
          {site.contacts.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <a className="c6-contact-cta" href={site.contacts.email.href}>{site.contacts.cta.label}</a>
        </div>
        <address>
          <a href={site.contacts.telegram.href}>{site.contacts.telegram.value}</a>
          <a href={site.contacts.email.href}>{site.contacts.email.value}</a>
          <a href={site.contacts.phone.href}>{site.contacts.phone.value}</a>
        </address>
      </section>
    </main>

    <footer className="c6-footer">
      <Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} />
      <nav aria-label={site.header.menuLabel}>{site.nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
      <span>{site.privacyPlaceholder}</span>
    </footer>
  </div>
}
