import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { readLegalSource } from '../legal/source'

export const metadata: Metadata = {
  title: 'Политика обработки персональных данных | Volnami',
  description: 'Политика Volnami в отношении обработки персональных данных.',
  icons: { icon: '/logo/volnami-icon-green.svg' },
}

const sectionTitles = [
  '1. ОБЩИЕ ПОЛОЖЕНИЯ',
  '2. ПРАВА И ОБЯЗАННОСТИ СТОРОН',
  '3. ЦЕЛИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ',
  '4. ОБЪЕМ И КАТЕГОРИИ ОБРАБАТЫВАЕМЫХ ПЕРСОНАЛЬНЫХ ДАННЫХ, СРОКИ И ОСНОВАНИЯ ОБРАБОТКИ',
  '5. ПОРЯДОК И УСЛОВИЯ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ',
  '6. БЛОКИРОВАНИЕ, УТОЧНЕНИЕ И УНИЧТОЖЕНИЕ ПЕРСОНАЛЬНЫХ ДАННЫХ',
  '7. ОТВЕТСТВЕННОСТЬ СТОРОН',
  '8. РАЗРЕШЕНИЕ СПОРОВ',
  '9. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ',
]

export default function PolicyPage() {
  return <LegalDocument source={readLegalSource('policy.txt')} currentHref="/policy/" sectionTitles={sectionTitles} />
}
