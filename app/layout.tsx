import type { Metadata } from 'next'
import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Volnami — креативное агентство полного цикла',
  description:
    'Стратегия, дизайн, digital и продакшн — в одной команде, с заботой о вашем продукте.',
}

/**
 * Корневой макет намеренно пустой: он только подключает шрифты и глобальные
 * токены. Никакой общей шапки, подвала или обёртки — иначе три концепта
 * получат одинаковый каркас.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
