import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'

/**
 * Подвал концепта 2.
 *
 * Страница до этого обрывалась на контактах, а страница кейса — на одной
 * подчёркнутой ссылке. Подвал закрывает обе.
 *
 * Собран по той же оси симметрии, что первый экран и все секции: лок-ап,
 * полный перечень разделов и служебная строка, всё по центру. Подвал —
 * последняя полоса стопки, и от контактов его отделяет смена фона,
 * а не линия: линеек на странице не осталось. Перечень разделов не дубль
 * меню, а единственное место, где названия разделов видны без раскрытия
 * панели: в этом концепте навигация живёт только под гамбургером.
 *
 * `base` пустой на самой /c2 и равен '/c2' на странице кейса — те же якоря
 * работают с обеих страниц.
 */
export function SiteFooter({ base = '' }: { base?: string }) {
  return (
    <footer className="c2-band c2-band--card c2-band--tight c2-footer">
      <div className="c2-wrap c2-footer-inner">
        <Link className="c2-footer-mark" href={`${base}#hero`}>
          <Image
            src="/logo/volnami-wordmark-green.svg"
            alt={site.brand.name}
            width={158}
            height={51}
          />
        </Link>

        <nav className="c2-footer-nav" aria-label={site.brand.name}>
          <ul className="c2-footer-list">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link
                  className="c2-footer-link"
                  href={`${base}${item.href}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="c2-footer-tg">
          <a
            className="c2-link"
            href={site.header.telegram.href}
          >
            {site.header.telegram.label} {site.header.telegram.handle}
          </a>
        </p>

        {/* Реквизиты оператора персональных данных ещё не переданы заказчиком.
            Заглушка стоит на своём месте открыто, а не прячется: строка
            из content/site.ts, подменяется одним значением. */}
        <p className="c2-footer-legal">{site.privacyPlaceholder}</p>
      </div>
    </footer>
  )
}
