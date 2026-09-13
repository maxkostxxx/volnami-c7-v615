import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { site } from '@/content/site'
import './index-tokens.css'
import './index.css'

/**
 * Корневой индекс. Не концепт и не дизайн — служебная страница со ссылками
 * на всё, что собрано. Оформляется намеренно нейтрально, чтобы не задавать
 * тон ни одному из шести концептов.
 */

const concepts = [
  { id: 'c1', number: '01', title: 'Глубина', description: 'Тёмный кинематографичный вариант с водой как главным визуальным материалом.' },
  { id: 'c2', number: '02', title: 'Предмет', description: 'Светлая предметная композиция, построенная на воздухе, масштабе и точной типографике.' },
  { id: 'c3', number: '03', title: 'Типографика', description: 'Фирменные шрифты и графика волны вместо большого изображения в первом экране.' },
  { id: 'c4', number: '04', title: 'Портфель в пространстве', description: 'Светлая интерактивная выставка с настоящим 3D-объектом упаковки.' },
  { id: 'c5', number: '05', title: 'Доказательства', description: 'Чёрно-белый редакционный архив, в котором главный аргумент — реальные работы.' },
  { id: 'c6', number: '06', title: 'Сцена', description: 'Фотографическая драматургия и управляемый свет на реальном кадре проекта.' },
] as const

export const metadata: Metadata = {
  title: 'Шесть концептов | Volnami',
  description: 'Шесть полноразмерных концептов главной страницы Volnami с отдельными страницами кейса.',
}

export default function IndexPage() {
  return (
    <div className="concept-index">
      <a className="index-skip" href="#index-main">{site.a11y.skipToContent}</a>
      <header className="index-masthead">
        <Image src="/logo/volnami-wordmark-green.svg" alt={site.brand.name} width={841} height={271} priority />
        <p>Тестовое задание<br />6 интерактивных маршрутов</p>
      </header>

      <main id="index-main" tabIndex={-1}>
        <section className="index-intro" aria-labelledby="index-title">
          <div>
            <p className="index-kicker">Volnami / веб-концепции</p>
            <h1 id="index-title">Шесть концептов <span>главной страницы</span></h1>
          </div>
          <div className="index-intro-note">
            <p>Все версии собраны целиком: от первого экрана до контактов, с отдельной страницей кейса.</p>
            <p>Каждый концепт предлагает отдельный визуальный язык — порядок просмотра свободный.</p>
            <a href="#concepts">Перейти к концептам ↓</a>
          </div>
        </section>

        <section className="index-catalog" id="concepts" aria-labelledby="concepts-title">
          <div className="index-section-head">
            <h2 id="concepts-title">Маршруты 01–06</h2>
            <p>Каждая ссылка откроется в новой вкладке — этот список останется под рукой.</p>
          </div>

          <ol className="index-list">
            {concepts.map((concept) => {
              const route = `/${concept.id}`
              return (
                <li className={`index-concept index-concept--${concept.id}`} key={concept.id}>
                  <div className="index-number-block">
                    <span className="index-number" aria-hidden="true">{concept.number}</span>
                  </div>

                  <div className="index-preview">
                    <Link href={route} target="_blank" rel="noreferrer" aria-label={`Открыть концепт ${concept.number}: ${concept.title} в новой вкладке`}>
                      <Image src={`/review/${concept.id}.jpg`} alt="" width={640} height={400} />
                      <span>Открыть</span>
                    </Link>
                  </div>

                  <div className="index-concept-copy">
                    <div>
                      <h3>{concept.title}</h3>
                      <p>{concept.description}</p>
                    </div>
                    <nav className="index-links" aria-label={`Ссылки концепта ${concept.number}`}>
                      <Link href={route} target="_blank" rel="noreferrer">Главная</Link>
                      <Link href={`${route}/case`} target="_blank" rel="noreferrer">Кейс</Link>
                    </nav>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </main>

      <footer className="index-footer">
        <span>Volnami — шесть направлений</span>
        <span>Desktop / mobile / keyboard</span>
      </footer>
    </div>
  )
}
