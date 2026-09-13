'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/content/site'
import { Display } from './type'

/** Кейс со своей страницей внутри концепта. Пока он один. */
const ROUTED: Record<string, string> = { kulek: '/c2/case' }

/** «Десятое королевство» без текста — строка не собирается. */
const ITEMS = site.cases.list.filter((c) => !c.pending)

/**
 * Кейсы на главной: слева столбец названий, справа поле превью.
 *
 * Поле не пустует ни секунды. При загрузке в нём стоит первый кейс списка,
 * дальше наведение и фокус его меняют, а уход курсора — нет: остаётся
 * последнее показанное. Пустая витрина была задумана как часть композиции,
 * но на статичном экране — в презентации, в скриншоте, у того, кто ещё
 * не тронул мышь, — она читалась не как пауза, а как непоказанная работа.
 * Агентство продаёт дизайн: работа должна быть видна сразу.
 *
 * Витрина устроена одинаково у всех кейсов: сверху — работа, снизу — подпись
 * через волосяную линию. Работа — это кадр, если он есть, и само название,
 * набранное дидоном во весь размах поля, если кадра нет. У трёх кейсов из
 * шести визуалов нет и не будет (чужие существующие бренды), и там название
 * работает как экспонат, а не как заглушка на месте картинки.
 *
 * Подпись нужна и в покое: пока мышь не тронута, поле показывает первый кейс,
 * и без имени было бы непонятно, чей это кадр.
 *
 * Тизер лежит в разметке рядом со своим названием и подключается через
 * `aria-describedby`: в имени ссылки остаётся только название кейса,
 * а описание озвучивается отдельно, как описание. В самой витрине тот же
 * тизер обрезан по строке — визуально, `line-clamp`; в разметке и у
 * скринридера строка остаётся целой.
 *
 * Строки без своей страницы тоже берут фокус — иначе превью открывалось бы
 * с клавиатуры ровно у одного кейса из шести.
 */
export function CasesList() {
  const [active, setActive] = useState(ITEMS[0].slug)
  const show = (slug: string) => () => setActive(slug)

  return (
    <div className="c2-cases">
      <ul className="c2-cases-list">
        {ITEMS.map((c) => {
          const href = ROUTED[c.slug]
          const teaserId = `c2-teaser-${c.slug}`
          const title = <Display text={c.title} />
          return (
            <li
              key={c.slug}
              className="c2-case-row"
              onMouseEnter={show(c.slug)}
            >
              <h3 className="c2-case-h">
                {href ? (
                  <Link
                    className="c2-case-name c2-case-name--link"
                    href={href}
                    aria-describedby={teaserId}
                    onFocus={show(c.slug)}
                  >
                    {title}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="c2-case-name c2-case-name--static"
                    aria-describedby={teaserId}
                    aria-pressed={active === c.slug}
                    onFocus={show(c.slug)}
                    onClick={show(c.slug)}
                  >
                    {title}
                  </button>
                )}
              </h3>
              <span className="c2-sr" id={teaserId}>
                {c.teaser}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="c2-cases-panel" aria-hidden="true">
        {ITEMS.map((c) => {
          const shot = c.visuals[0]
          return (
            <figure
              key={c.slug}
              className={`c2-vitrine c2-vitrine--${shot ? 'shot' : 'name'}`}
              data-on={active === c.slug ? 'true' : 'false'}
            >
              {shot ? (
                <span className="c2-vitrine-frame">
                  <Image
                    className="c2-vitrine-img"
                    src={shot.src}
                    alt=""
                    width={shot.width}
                    height={shot.height}
                    sizes="448px"
                  />
                </span>
              ) : (
                <span className="c2-vitrine-name">
                  <Display text={c.title} />
                </span>
              )}

              <figcaption className="c2-vitrine-foot">
                {shot ? (
                  <span className="c2-vitrine-title">
                    <Display text={c.title} />
                  </span>
                ) : null}
                <span className="c2-vitrine-teaser">{c.teaser}</span>
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
