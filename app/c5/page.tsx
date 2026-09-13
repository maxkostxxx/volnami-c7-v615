import Image from 'next/image'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import { C5Chrome } from './chrome'
import { C5Cases } from './cases'
import { C5HeroStage } from './hero-stage'
import { C5Testimonials } from './testimonials'
import './tokens.css'
import './c5.css'
import './hero-v2.css'

export const metadata: Metadata = {
  title: 'Концепт 05 — Доказательства | Volnami',
}

export default function C5Page() {
  return <div className="c5">
    <a className="c5-skip" href="#c5-main">{site.a11y.skipToContent}</a>
    <C5Chrome />
    <main className="c5-main" id="c5-main" tabIndex={-1}>
      <C5HeroStage />

      <section className="c5-about" id="about" aria-labelledby="c5-about-title" tabIndex={-1}>
        <h2 id="c5-about-title">{site.about.title}</h2>
        <div className="c5-about-copy">{site.about.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>

      <section className="c5-process" aria-labelledby="c5-process-title">
        <h2 id="c5-process-title">{site.process.title}</h2>
        <ol tabIndex={0} aria-label={site.process.title}>{site.process.steps.map((step, index) => <li key={step.title} className={index === site.process.steps.length - 1 ? 'c5-process-final' : undefined}>
          <h3>{step.title}</h3>
          {step.description ? <p>{step.description}</p> : null}
        </li>)}</ol>
      </section>

      <section className="c5-services" id="services" aria-labelledby="c5-services-title" tabIndex={-1}>
        <h2 id="c5-services-title">{site.services.title}</h2>
        <div className="c5-services-register">{site.services.list.map((service) => <article key={service.title}>
          <h3>{service.title}</h3>
          <p className="c5-service-lead">{service.lead}</p>
          <ul>{service.items.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="c5-service-close">{service.closing}</p>
        </article>)}</div>
      </section>

      <section className="c5-cases" id="cases" aria-labelledby="c5-cases-title" tabIndex={-1}>
        <h2 id="c5-cases-title">{site.cases.title}</h2>
        <C5Cases />
      </section>

      <section className="c5-testimonials" id="testimonials" aria-labelledby="c5-testimonials-title" tabIndex={-1}>
        <h2 id="c5-testimonials-title">{site.testimonials.title}</h2>
        <C5Testimonials />
      </section>

      <section className="c5-contacts" id="contacts" aria-labelledby="c5-contacts-title" tabIndex={-1}>
        <div className="c5-contact-copy">
          <h2 id="c5-contacts-title">{site.contacts.title}</h2>
          {site.contacts.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <a className="c5-contact-cta" href={site.contacts.email.href}>{site.contacts.cta.label}</a>
        </div>
        <address>
          <a href={site.contacts.telegram.href}>{site.contacts.telegram.value}</a>
          <a href={site.contacts.email.href}>{site.contacts.email.value}</a>
          <a href={site.contacts.phone.href}>{site.contacts.phone.value}</a>
        </address>
      </section>
    </main>

    <footer className="c5-footer">
      <Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={842} height={271} />
      <nav aria-label={site.header.menuLabel}>{site.nav.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav>
      <span>{site.privacyPlaceholder}</span>
    </footer>
  </div>
}
