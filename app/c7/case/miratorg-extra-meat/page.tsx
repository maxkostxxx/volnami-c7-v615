import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { c7Site } from '../../content'
import type { Case, CaseBlock } from '@/content/site'
import '../../tokens.css'
import '../../c7.css'
import './case.css'
import { C7WaveReveal } from '../../wave-reveal'

function getExtraMeat(): Case {
  const found = c7Site.cases.list.find((entry) => entry.slug === 'miratorg-extra-meat')
  if (!found || found.visuals.length === 0) throw new Error('C7 Extra Meat case materials are missing')
  return found
}

const item = getExtraMeat()

export const metadata: Metadata = {
  title: 'Мираторг — Extra Meat | Volnami',
  description: item.teaser,
}

function StoryBlock({ block }: { block: CaseBlock }) {
  if (block.kind === 'lead') return null
  if (block.kind === 'group') return <section className="c7-project-story-block">
    <h2>{block.title}</h2>
    <div className="c7-project-story-text">{block.blocks.map((nested, index) => <StoryBlock block={nested} key={index} />)}</div>
  </section>

  return <section className="c7-project-story-block">
    <h2>{block.heading}</h2>
    <div className="c7-project-story-text">
      {block.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {block.items ? <ul>{block.items.map((line) => <li key={line}>{line}</li>)}</ul> : null}
      {block.subsections?.map((section) => <div className="c7-project-subsection" key={section.heading}>
        <h3>{section.heading}</h3>
        <p>{section.text}</p>
      </div>)}
    </div>
  </section>
}

export default function ExtraMeatCasePage() {
  const [cover, ...gallery] = item.visuals

  return <div className="c7 c7-project-page">
    <a className="c7-skip" href="#c7-project-main">{c7Site.a11y.skipToContent}</a>
    <header className="c7-project-header">
      <Link className="c7-project-logo" href="/c7/" aria-label="Volnami — на главную">
        <Image src="/logo/volnami-wordmark-white.svg" alt="" width={841} height={271} priority />
      </Link>
      <Link className="c7-project-back" href="/c7/#cases"><span aria-hidden="true">←</span> Все кейсы</Link>
    </header>

    <main id="c7-project-main" tabIndex={-1}>
      <section className="c7-project-hero" aria-labelledby="c7-project-title">
        <C7WaveReveal className="c7-project-hero-copy" intro>
          <p className="c7-project-eyebrow">Кейс 01 / Мираторг</p>
          <h1 id="c7-project-title">Extra Meat</h1>
          <p className="c7-project-lead">{item.teaser}</p>
          <a className="c7-project-scroll" href="#c7-project-story">Смотреть проект <span aria-hidden="true">↓</span></a>
        </C7WaveReveal>
        <div className="c7-project-cover">
          <Image src={cover.src} alt={cover.alt} width={cover.width} height={cover.height} priority sizes="(max-width: 800px) 100vw, 46vw" />
        </div>
      </section>

      <article className="c7-project-story" id="c7-project-story" aria-label="Описание проекта">
        {item.blocks.filter(block => block.kind !== 'lead').map((block, index) => <C7WaveReveal key={index}><StoryBlock block={block} /></C7WaveReveal>)}
      </article>

      <section className="c7-project-gallery" aria-labelledby="c7-project-gallery-title">
        <div className="c7-project-gallery-heading">
          <h2 id="c7-project-gallery-title">Линейка Extra Meat</h2>
          <p>Варианты упаковки</p>
        </div>
        <C7WaveReveal className="c7-project-gallery-reveal"><div className="c7-project-gallery-grid">
          {gallery.map((visual) => <figure key={visual.src}>
            <Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 700px) 50vw, 24vw" />
          </figure>)}
        </div></C7WaveReveal>
      </section>

      <footer className="c7-project-footer">
        <Link href="/c7/#cases"><span aria-hidden="true">←</span> Вернуться к кейсам</Link>
        <a href={c7Site.contacts.email.href}>{c7Site.contacts.email.value}</a>
      </footer>
    </main>
  </div>
}
