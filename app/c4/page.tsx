import Image from 'next/image'
import Link from 'next/link'
import { Fragment } from 'react'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import { C4Chrome } from './chrome'
import { C4Stage } from './stage'
import { C4Testimonials } from './testimonials'
import './tokens.css'
import './c4.css'
import './hero-v2.css'

export const metadata: Metadata = {
  title: 'Концепт 04 — Портфель в пространстве | Volnami',
}

function breakableLine(line: string) {
  const parts = line.split('\u00a0')
  return parts.map((part, index) => <Fragment key={`${part}-${index}`}>
    {part}{index < parts.length - 1 ? <>{'\u00a0'}<wbr /></> : null}
  </Fragment>)
}

export default function C4Page() {
  return <div className="c4">
    <a className="c4-skip" href="#c4-main">{site.a11y.skipToContent}</a>
    <C4Chrome />
    <main id="c4-main" tabIndex={-1}>
      <section className="c4-space" id="hero" aria-labelledby="c4-hero-title" tabIndex={-1}>
        <div className="c4-space-copy">
          <h1 id="c4-hero-title"><span>{breakableLine(site.hero.sloganLines[0])}</span><em>{breakableLine(site.hero.sloganLines[1])}</em></h1>
          <p>{site.hero.subtitle}</p>
        </div>
        <C4Stage />
      </section>

      <section className="c4-about c4-grid" id="about" aria-labelledby="c4-about-title" tabIndex={-1}>
        <h2 id="c4-about-title">{site.about.title}</h2><div>{site.about.paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
      </section>

      <section className="c4-process" aria-labelledby="c4-process-title">
        <h2 id="c4-process-title">{site.process.title}</h2>
        <ol tabIndex={0} aria-label={site.process.title}>{site.process.steps.map((step, index) => <li key={step.title} className={index === 3 ? 'c4-process-final' : ''}>
          <h3>{step.title}</h3>{step.description ? <p>{step.description}</p> : null}
        </li>)}</ol>
      </section>

      <section className="c4-services" id="services" aria-labelledby="c4-services-title" tabIndex={-1}>
        <h2 id="c4-services-title">{site.services.title}</h2>
        <div className="c4-service-list">{site.services.list.map((service) => <article key={service.title}>
          <h3>{service.title}</h3><div className="c4-service-notes"><p className="c4-service-lead">{service.lead}</p>
          <ul>{service.items.map((item) => <li key={item}>{item}</li>)}</ul><p className="c4-service-close">{service.closing}</p></div>
        </article>)}</div>
      </section>

      <section className="c4-cases" id="cases" aria-labelledby="c4-cases-title" tabIndex={-1}>
        <div className="c4-section-head"><h2 id="c4-cases-title">{site.cases.title}</h2><a href={site.cases.portfolioLink.href}>{site.cases.portfolioLink.label}</a></div>
        <div className="c4-exhibits">{site.cases.list.filter((item) => item.visuals[0]).map((item, index) => {
          const visual = item.visuals[0]
          const detail = item.visuals[1]
          const title = index === 0 ? <Link href="/c4/case">{item.title}</Link> : item.externalLink ? <a href={item.externalLink.href}>{item.title}</a> : item.title
          return <article key={item.slug} className={`c4-exhibit c4-exhibit-${index + 1}`}>
            <figure className="c4-exhibit-primary"><Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} /></figure>
            {detail ? <figure className="c4-exhibit-detail"><Image src={detail.src} alt={detail.alt} width={detail.width} height={detail.height} /></figure> : null}
            <div className="c4-exhibit-label"><h3>{title}</h3><p>{item.teaser}</p></div>
          </article>
        })}</div>
        <div className="c4-case-archive">{site.cases.list.filter((item) => !item.visuals[0]).map((item) => {
          const title = item.externalLink ? <a href={item.externalLink.href}>{item.title}</a> : item.title
          return <article key={item.slug}><h3>{title}</h3>{!item.pending ? <p>{item.teaser}</p> : null}</article>
        })}</div>
      </section>

      <section className="c4-testimonials" id="testimonials" aria-labelledby="c4-testimonials-title" tabIndex={-1}>
        <h2 id="c4-testimonials-title">{site.testimonials.title}</h2><C4Testimonials />
      </section>

      <section className="c4-contacts" id="contacts" aria-labelledby="c4-contacts-title" tabIndex={-1}>
        <h2 id="c4-contacts-title">{site.contacts.title}</h2>
        <div className="c4-contact-copy">{site.contacts.paragraphs.map((p) => <p key={p}>{p}</p>)}<a className="c4-contact-cta" href={site.contacts.email.href}>{site.contacts.cta.label}</a></div>
        <address><a href={site.contacts.telegram.href}>{site.contacts.telegram.value}</a><a href={site.contacts.email.href}>{site.contacts.email.value}</a><a href={site.contacts.phone.href}>{site.contacts.phone.value}</a></address>
      </section>
    </main>
    <footer className="c4-footer"><Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} /><nav aria-label={site.header.menuLabel}>{site.nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav><span>{site.privacyPlaceholder}</span></footer>
  </div>
}
