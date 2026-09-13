import { notFound } from 'next/navigation'
import { site } from '@/content/site'
import { C5CaseDocument } from '../../case-document'
import '../../tokens.css'
import '../../c5.css'

const visualCases = site.cases.list.filter((item) => item.visuals.length > 0)

export const dynamicParams = false

export function generateStaticParams() {
  return visualCases.map((item) => ({ slug: item.slug }))
}

export default async function C5CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = visualCases.find((entry) => entry.slug === slug)
  if (!item) notFound()
  return <C5CaseDocument item={item} />
}
