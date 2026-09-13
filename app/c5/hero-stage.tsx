'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { site } from '@/content/site'

const featured = site.cases.list.filter((item) => item.visuals.length > 0).slice(0, 3)

function breakableLine(line: string) {
  const parts = line.split('\u00a0')
  return parts.map((part, index) => <Fragment key={`${part}-${index}`}>
    {part}{index < parts.length - 1 ? <>{'\u00a0'}<wbr /></> : null}
  </Fragment>)
}

export function C5HeroStage() {
  const [active, setActive] = useState(featured[0].slug)
  const selected = featured.find((item) => item.slug === active) ?? featured[0]
  const visual = selected.visuals[0]

  return <section className="c5-proof" id="hero" aria-labelledby="c5-hero-title" tabIndex={-1}>
    <div className="c5-proof-copy">
      <h1 id="c5-hero-title">
        <span>{breakableLine(site.hero.sloganLines[0])}</span>
        <span>{breakableLine(site.hero.sloganLines[1])}</span>
      </h1>
      <p>{site.hero.subtitle}</p>
      <ul role="list" aria-label={site.cases.title}>{featured.map((item) => <li key={item.slug}>
        <button
          type="button"
          aria-pressed={item.slug === selected.slug}
          onClick={() => setActive(item.slug)}
          onFocus={() => setActive(item.slug)}
          onMouseEnter={() => setActive(item.slug)}
        >{item.title}</button>
      </li>)}</ul>
    </div>
    <figure className="c5-proof-visual">
      <Link href={`/c5/case/${selected.slug}`} aria-label={selected.title}>
        <Image key={visual.src} src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} priority sizes="(max-width: 900px) 100vw, 62vw" />
      </Link>
    </figure>
  </section>
}
