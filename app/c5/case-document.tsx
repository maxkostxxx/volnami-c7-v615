import Image from 'next/image'
import Link from 'next/link'
import { site, type CaseBlock } from '@/content/site'
import { C5Chrome } from './chrome'

type CaseItem = (typeof site.cases.list)[number]

function Block({ block }: { block: CaseBlock }) {
  if (block.kind === 'lead') return <p className="c5-case-lead">{block.text}</p>

  if (block.kind === 'group') return <section className="c5-case-group">
    <h2>{block.title}</h2>
    <div className="c5-case-group-body">{block.blocks.map((item, index) => <Block block={item} key={index} />)}</div>
  </section>

  return <section className="c5-case-block">
    <h2>{block.heading}</h2>
    <div className="c5-case-block-body">
      {block.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {block.items ? <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {block.subsections?.map((section) => <div className="c5-case-subsection" key={section.heading}>
        <h3>{section.heading}</h3>
        <p>{section.text}</p>
      </div>)}
    </div>
  </section>
}

export function C5CaseDocument({ item }: { item: CaseItem }) {
  const cover = item.visuals[0]
  if (!cover) return null

  return <div className="c5 c5-case-page">
    <a className="c5-skip" href="#c5-case-main">{site.a11y.skipToContent}</a>
    <C5Chrome base="/c5" />
    <main className="c5-main" id="c5-case-main" tabIndex={-1}>
      <header className={`c5-case-hero c5-case-hero-${item.slug}`}>
        <Link href="/c5#cases">{site.cases.title}</Link>
        <h1>{item.title}</h1>
        {item.teaser ? <p>{item.teaser}</p> : null}
      </header>

      <div className="c5-case-cover">
        <Image src={cover.src} alt={cover.alt} width={cover.width} height={cover.height} priority sizes="(max-width: 900px) 100vw, 94vw" />
      </div>

      <article className="c5-case-story">{item.blocks.map((block, index) => <Block block={block} key={index} />)}</article>

      {item.visuals.length > 1 ? <div className="c5-case-gallery">{item.visuals.slice(1).map((visual) => <figure key={visual.src}>
        <Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 600px) 100vw, 72vw" />
      </figure>)}</div> : null}
    </main>

    <footer className="c5-footer">
      <Link href="/c5" aria-label={site.brand.name}><Image src="/logo/volnami-wordmark-white.svg" alt="" width={842} height={271} /></Link>
      <a href={site.contacts.email.href}>{site.contacts.email.value}</a>
      <span>{site.privacyPlaceholder}</span>
    </footer>
  </div>
}
