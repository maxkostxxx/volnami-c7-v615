import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'

const visualCases = site.cases.list.filter((item) => item.visuals.length > 0)
const textCases = site.cases.list.filter((item) => item.visuals.length === 0)

export function C5Cases() {
  return <div className="c5-case-archive">
    <div className="c5-case-folios">
      {visualCases.map((item, index) => {
        const visual = item.visuals[0]
        return <article className={`c5-case-record c5-case-record-${index + 1}`} key={item.slug}>
          <Link className="c5-case-record-image" href={`/c5/case/${item.slug}`} aria-label={item.title}>
            <Image src={visual.src} alt={visual.alt} width={visual.width} height={visual.height} sizes="(max-width: 900px) 100vw, 72vw" />
          </Link>
          <div className="c5-case-record-copy">
            <h3><Link href={`/c5/case/${item.slug}`}>{item.title}</Link></h3>
            <p>{item.teaser}</p>
          </div>
        </article>
      })}
    </div>

    <div className="c5-case-directory">
      {textCases.map((item) => <article key={item.slug}>
        <h3>{item.externalLink
          ? <a href={item.externalLink.href}>{item.title}</a>
          : item.title}</h3>
        {item.teaser ? <p>{item.teaser}</p> : null}
      </article>)}
      <a className="c5-portfolio" href={site.cases.portfolioLink.href}>{site.cases.portfolioLink.label}</a>
    </div>
  </div>
}
