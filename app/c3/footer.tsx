import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'

/**
 * Подвал. Стоит и на главной, и на странице кейса — иначе страница
 * обрывается сразу за контактами.
 *
 * Собран в языке концепта и без единой новой строки: фон `deep` (по палитре
 * подвал живёт на втором плане вместе с полосой отзывов), асимметричная
 * сетка — знак и навигация у левого поля, служебная строка прижата вправо
 * к берегу 240. Навигация набрана тем же Kreadon 700 и тем же кеглем, что
 * и раскрытое меню: это один и тот же список, и он должен читаться как он же.
 *
 * Ни телефона, ни почты, ни Telegram здесь нет намеренно: они стоят
 * строкой выше, в контактах. Дублировать их — значит показать одни и те же
 * три ссылки дважды подряд.
 */
export function Footer({ base = '' }: { base?: string }) {
  const mark = (
    <>
      <Image
        className="c3-logo-icon"
        src="/logo/volnami-icon-pink.svg"
        alt=""
        width={53}
        height={60}
      />
      <Image
        className="c3-logo-word"
        src="/logo/volnami-wordmark-pink.svg"
        alt={site.brand.name}
        width={99}
        height={32}
      />
    </>
  )

  return (
    <footer className="c3-footer">
      <div className="c3-wrap">
        <div className="c3-footer-top">
          {/* На главной знак — не ссылка: вести со страницы на неё же нечем. */}
          {base ? (
            <Link className="c3-logo" href={base}>
              {mark}
            </Link>
          ) : (
            <div className="c3-logo">{mark}</div>
          )}

          <p className="c3-footer-note">{site.privacyPlaceholder}</p>
        </div>

        <nav aria-label={`${site.header.menuLabel} — ${site.contacts.title}`}>
          <ul className="c3-footer-nav">
            {site.nav.map((item) => (
              <li key={item.href}>
                <a className="c3-footer-link" href={`${base}${item.href}`}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
