import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Fragment } from 'react'
import { c7Site as site } from './content'
import { C7Chrome } from './chrome'
import { C7Landscape } from './landscape'
import { C7Testimonials } from './testimonials'
import { C7AboutReveal } from './about-reveal'
import { C7Brief } from './brief'
import { C7CaseImage } from './case-image'
import { C7WaveReveal } from './wave-reveal'
import { C7WaveLines } from './wave-lines'
import { C7MotionPreferences } from './motion-preferences'
import { C7PrivacyNotice, C7PrivacyButton } from './privacy-notice'
import { earlyWorkerBootstrap } from './scene/early-worker'
import './tokens.css'
import './c7.css'
import './wave-motion.css'

export const metadata: Metadata = {
  title: 'Volnami — стратегия, дизайн и digital',
  description: site.hero.subtitle,
}

function breakableLine(line: string) {
  const parts = line.split('\u00a0')
  return parts.map((part, index) => <Fragment key={`${part}-${index}`}>
    {part}{index < parts.length - 1 ? <>{'\u00a0'}<wbr /></> : null}
  </Fragment>)
}

function keepOpeningTogether(paragraph: string) {
  return paragraph.replace(/^Volnami —/, 'Volnami\u00a0—')
}

export default function C7Page() {
  return <div className="c7">
    {/* v627: warm the worker entry and the world module while the page loads,
        so the first 3D frame waits for one transfer, not two. */}
    <link rel="prefetch" href="/3d/c7/runtime-v646/worker-entry.js" as="script" />
    <link rel="prefetch" href="/3d/c7/runtime-v646/startup-inputs.js" as="script" />
    <link rel="prefetch" href="/3d/c7/runtime-v646/world.js" as="script" />
    <script dangerouslySetInnerHTML={{ __html: earlyWorkerBootstrap }} />
    <a className="c7-skip" href="#c7-main">{site.a11y.skipToContent}</a>
    <C7Landscape />
    <C7MotionPreferences />
    <C7Chrome />
    <C7PrivacyNotice />

    <main id="c7-main" tabIndex={-1}>
      <section className="c7-hero c7-scene-section" id="hero" aria-labelledby="c7-hero-title" tabIndex={-1}>
        <C7WaveReveal className="c7-hero-copy" intro>
          <h1 id="c7-hero-title">
            <span>{breakableLine(site.hero.sloganLines[0])}</span>
            <span>{breakableLine(site.hero.sloganLines[1])}</span>
          </h1>
          <p>{site.hero.subtitle}</p>
        </C7WaveReveal>
        <C7WaveLines tone="dark" />
        <a className="c7-scroll-cue" href="#about" aria-label="Перейти к разделу О нас"><span className="c7-motion-ambient" aria-hidden="true" /></a>
      </section>

      <section className="c7-about c7-paper-section" id="about" aria-labelledby="c7-about-title" tabIndex={-1}>
        <C7AboutReveal>
          <div className="c7-section-shell">
            <h2 id="c7-about-title">{site.about.title}</h2>
            <div className="c7-about-copy">
              {site.about.paragraphs.map((paragraph, index) => <p className={index === 0 ? 'c7-about-lead' : 'c7-about-note'} key={paragraph}>{keepOpeningTogether(paragraph)}</p>)}
            </div>
          </div>
        </C7AboutReveal>
      </section>

      <section className="c7-process c7-scene-section" id="process" aria-labelledby="c7-process-title" tabIndex={-1}>
        <C7WaveReveal className="c7-section-shell">
          <div className="c7-process-heading">
            <h2 id="c7-process-title">{site.process.title}</h2>
          </div>
          <ol tabIndex={0} aria-label={site.process.title}>
            {site.process.steps.map((step, index) => <li key={step.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              {step.description ? <p>{step.description}</p> : null}
            </li>)}
          </ol>
        </C7WaveReveal>
        <C7WaveLines />
      </section>

      <section className="c7-services c7-paper-section" id="services" aria-labelledby="c7-services-title" tabIndex={-1}>
        <C7WaveReveal className="c7-section-shell">
          <h2 id="c7-services-title">{site.services.title}</h2>
          <div className="c7-service-list">
            {site.services.list.map((service) => <article key={service.title}>
              <div className="c7-service-thesis">
                <h3>{service.title}</h3>
                <p>{service.lead}</p>
              </div>
              <div className="c7-service-details">
                <ul>{service.items.map((item) => <li key={item}>{item}</li>)}</ul>
                <p>{service.closing}</p>
              </div>
            </article>)}
          </div>
        </C7WaveReveal>
      </section>

      <section className="c7-cases c7-paper-section" id="cases" aria-labelledby="c7-cases-title" tabIndex={-1}>
        <C7WaveReveal className="c7-section-shell">
          <div className="c7-section-heading">
            <h2 id="c7-cases-title">{site.cases.title}</h2>
            <a href={site.cases.portfolioLink.href}>{site.cases.portfolioLink.label}</a>
          </div>
          <div className="c7-case-field">
            {site.cases.list.map((item, index) => {
              const visual = item.visuals[0]
              return <article className={`c7-case c7-case-${index + 1}${visual ? ' has-image' : ' is-text'}`} key={item.slug}>
                {visual ? <C7CaseImage src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} /> : null}
                <div>
                  <h3>{item.title}</h3>
                  {!item.pending ? <p>{item.teaser}</p> : null}
                </div>
                {item.slug === 'miratorg-extra-meat' ? <Link className="c7-case-open" href="/c7/case/miratorg-extra-meat" aria-label="Открыть кейс Мираторг — Extra Meat"><span aria-hidden="true">↗</span></Link> : null}
              </article>
            })}
          </div>
        </C7WaveReveal>
      </section>

      <section className="c7-testimonials c7-scene-section" id="testimonials" aria-labelledby="c7-testimonials-title" tabIndex={-1}>
        <C7WaveReveal className="c7-section-shell">
          <h2 id="c7-testimonials-title">{site.testimonials.title}</h2>
          <C7Testimonials />
        </C7WaveReveal>
        <C7WaveLines tone="dark" />
      </section>

      <section className="c7-contacts c7-scene-section" id="contacts" aria-labelledby="c7-contacts-title" tabIndex={-1}>
        <div className="c7-section-shell">
          <C7WaveReveal className="c7-contact-intro">
          <h2 id="c7-contacts-title">{site.contacts.title}</h2>
          <div className="c7-contact-copy">
            {site.contacts.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <a className="c7-contact-cta" href="#brief">{site.contacts.cta.label}</a>
          </div>
          <address>
            <a href={site.contacts.telegram.href}><span>{site.contacts.telegram.label}</span>{site.contacts.telegram.value}</a>
            <a href={site.contacts.email.href}><span>{site.contacts.email.label}</span>{site.contacts.email.value}</a>
            <a href={site.contacts.phone.href}><span>{site.contacts.phone.label}</span>{site.contacts.phone.value}</a>
          </address>
          </C7WaveReveal>
          <C7Brief />
        </div>
      </section>
    </main>

    <footer className="c7-footer">
      <Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} />
      <nav aria-label={site.header.menuLabel}>{site.nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
      <div className="c7-footer-legal" aria-label="Правовые документы">
        <Link href="/policy/">Политика персональных данных</Link>
        <Link href="/agreement/">Согласие на обработку данных</Link>
        <Link href="/cookie/">Cookies</Link>
        <C7PrivacyButton />
      </div>
    </footer>
    <script dangerouslySetInnerHTML={{ __html: `(function(){
      var host=document.querySelector('.c7-landscape');
      var about=document.getElementById('about');
      if(!host||!about)return;
      // CSSOM preserves the pre-hydration fallback without mutating React's
      // server-rendered host attributes (including a reload at a deep anchor).
      var fallbackStyle=document.createElement('style');
      document.head.appendChild(fallbackStyle);
      fallbackStyle.sheet.insertRule('.c7-landscape {}',0);
      var fallbackRule=fallbackStyle.sheet.cssRules[0].style;
      var initialRestoration=true;
      setTimeout(function(){initialRestoration=false;document.documentElement.classList.remove('c7-initial-scrolled')},1000);
      var fragment;
      try{fragment=document.getElementById(decodeURIComponent(location.hash.slice(1)))}catch(_error){}
      function alignInitialFragment(){
        if(fragment&&fragment.isConnected)fragment.scrollIntoView({behavior:'instant',block:'start'});
      }
      function update(){
        if(!host.isConnected){
          removeEventListener('scroll',update);
          removeEventListener('pageshow',update);
          removeEventListener('resize',update);
          fallbackStyle.remove();
          return;
        }
        if(initialRestoration&&scrollY>24)document.documentElement.classList.add('c7-initial-scrolled');
        var start=about.offsetTop+innerHeight*0.003;
        var end=about.offsetTop+innerHeight*0.018;
        var t=Math.max(0,Math.min(1,(scrollY-start)/(end-start)));
        fallbackRule.setProperty('--c7-fallback-opacity',String(1-t*t*(3-2*t)));
      }
      update();
      alignInitialFragment();
      addEventListener('scroll',update,{passive:true});
      addEventListener('pageshow',update);
      addEventListener('pageshow',alignInitialFragment,{once:true});
      addEventListener('resize',update);
      requestAnimationFrame(function(){alignInitialFragment();update()});
    })();` }} />
  </div>
}
