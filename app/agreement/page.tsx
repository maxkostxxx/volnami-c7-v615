import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { readLegalSource } from '../legal/source'

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных | Volnami',
  description: 'Согласие на обработку персональных данных при заполнении формы обратной связи Volnami.',
  icons: { icon: '/logo/volnami-icon-green.svg' },
}

export default function AgreementPage() {
  return <LegalDocument source={readLegalSource('form.txt')} currentHref="/agreement/" sectionTitles={[]} />
}
