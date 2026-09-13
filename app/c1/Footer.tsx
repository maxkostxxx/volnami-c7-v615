import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'

/**
 * Подвал концепта 1. Живёт внутри app/c1/ — общей библиотеки у концептов нет.
 *
 * Содержимое сведено к тому, чего на странице ещё не было: знак и навигация.
 * Контакты и портфолио в подвал не дублируются — они стоят выше собственными
 * секциями, а третий повтор телеграм-хэндла уже снимался на ревизии сборки.
 *
 * `base` — префикс якорей: '' на главной концепта, '/c1' на странице кейса.
 */
export default function Footer({ base = '' }: { base?: string }) {
  return (
    <footer className="c1-footer">
      <div className="c1-wrap c1-footer-inner">
        <Link className="c1-footer-mark" href={base || '#hero'}>
          <Image
            src="/logo/volnami-full-pink.svg"
            alt={site.brand.name}
            width={280}
            height={198}
          />
        </Link>

        <nav>
          <ul className="c1-footer-nav">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link href={`${base}${item.href}`}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
