import Image from 'next/image'
import Link from 'next/link'
import { site, type CaseBlock } from '@/content/site'
import { C6Chrome } from '../chrome'
import '../tokens.css'
import '../c6.css'

const item = site.cases.list[0]

function Block({ block }: { block: CaseBlock }) {
  if (block.kind === 'lead') return <p className="c6-case-lead">{block.text}</p>
  if (block.kind === 'group') return <section>
    <h2>{block.title}</h2>
    {block.blocks.map((child, index) => <Block block={child} key={index} />)}
  </section>
  return <section>
    <h2>{block.heading}</h2>
    {block.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    {block.items ? <ul>{block.items.map((entry) => <li key={entry}>{entry}</li>)}</ul> : null}
    {block.subsections?.map((subsection) => <div key={subsection.heading}><h3>{subsection.heading}</h3><p>{subsection.text}</p></div>)}
  </section>
}

export default function C6Case() {
  return <div className="c6 c6-case-page">
    <a className="c6-skip" href="#c6-case-main">{site.a11y.skipToContent}</a>
    <C6Chrome base="/c6" />
    <main id="c6-case-main" tabIndex={-1}>
      <header className="c6-case-hero">
        <div>
          <Link href="/c6#cases">{site.cases.title}</Link>
          <h1>{item.title}</h1>
          <p>{item.teaser}</p>
        </div>
        <Image src={item.visuals[0].src} alt={item.visuals[0].alt} width={item.visuals[0].width} height={item.visuals[0].height} priority sizes="(max-width: 900px) 100vw, 58vw" />
      </header>
      <div className="c6-case-story">{item.blocks.map((block, index) => <Block block={block} key={index} />)}</div>
      <div className="c6-case-gallery" role="region" tabIndex={0} aria-label={item.title}>
        {item.visuals.slice(1).map((visual) => <figure key={visual.src}><Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 900px) 100vw, 68vw" /></figure>)}
      </div>
    </main>
    <footer className="c6-footer">
      <Link href="/c6"><Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} /></Link>
      <a href={site.contacts.email.href}>{site.contacts.email.value}</a>
      <span>{site.privacyPlaceholder}</span>
    </footer>
  </div>
}
