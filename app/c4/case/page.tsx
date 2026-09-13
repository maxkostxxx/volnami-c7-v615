import Image from 'next/image'
import Link from 'next/link'
import { site, type CaseBlock } from '@/content/site'
import { C4Chrome } from '../chrome'
import '../tokens.css'
import '../c4.css'

const item = site.cases.list[0]

function Block({ block }: { block: CaseBlock }) {
  if (block.kind === 'lead') return <p className="c4-case-lead">{block.text}</p>
  if (block.kind === 'group') return <section><h2>{block.title}</h2>{block.blocks.map((nested, i) => <Block block={nested} key={i} />)}</section>
  return <section><h2>{block.heading}</h2>{block.paragraphs?.map((p) => <p key={p}>{p}</p>)}{block.items ? <ul>{block.items.map((x) => <li key={x}>{x}</li>)}</ul> : null}{block.subsections?.map((x) => <div key={x.heading}><h3>{x.heading}</h3><p>{x.text}</p></div>)}</section>
}

export default function C4CasePage() {
  return <div className="c4 c4-case-page"><a className="c4-skip" href="#c4-case-main">{site.a11y.skipToContent}</a><C4Chrome base="/c4" /><main id="c4-case-main" tabIndex={-1}>
    <header className="c4-case-hero"><div className="c4-case-intro"><Link href="/c4#cases">{site.cases.title}</Link><h1>{item.title}</h1><p>{item.teaser}</p></div><figure className="c4-case-opening"><Image src={item.visuals[0].src} alt={item.visuals[0].alt} width={item.visuals[0].width} height={item.visuals[0].height} priority /></figure></header>
    <div className="c4-case-story">{item.blocks.map((block, i) => <Block block={block} key={i} />)}</div>
    <div className="c4-case-gallery">{item.visuals.slice(1).map((visual, i) => <figure key={visual.src} className={`c4-gallery-${i + 1}`}><Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} /></figure>)}</div>
  </main><footer className="c4-footer"><Link href="/c4"><Image src="/logo/volnami-wordmark-white.svg" alt={site.brand.name} width={841} height={271} /></Link><a href={site.contacts.email.href}>{site.contacts.email.value}</a><span>{site.privacyPlaceholder}</span></footer></div>
}
