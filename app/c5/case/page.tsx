import { site } from '@/content/site'
import { C5CaseDocument } from '../case-document'
import '../tokens.css'
import '../c5.css'

const item = site.cases.list.find((entry) => entry.slug === 'kulek')!

export default function C5Case() {
  return <C5CaseDocument item={item} />
}
