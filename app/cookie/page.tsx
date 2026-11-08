import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { readLegalSource } from '../legal/source'

export const metadata: Metadata = {
  title: 'Согласие на обработку cookie | Volnami',
  description: 'Согласие на обработку персональных данных, собираемых посредством cookie и метрических сервисов.',
  icons: { icon: '/logo/volnami-icon-green.svg' },
}

const sectionTitles = [
  '1. Что такое Куки (Cookies) и как мы их используем',
  '2. Какие данные обрабатываются',
  '3. Цели обработки',
  '4. Сервисы, которые обрабатывают данные по поручению Оператора',
  '5. Способ обработки и действия с данными',
  '6. Срок действия и отзыв согласия',
]

export default function CookiePage() {
  return <LegalDocument source={readLegalSource('cookie.txt')} currentHref="/cookie/" sectionTitles={sectionTitles} />
}
