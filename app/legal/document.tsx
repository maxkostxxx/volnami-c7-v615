import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './legal.css'

const documents = [
  { href: '/policy/', label: 'Политика ПДн' },
  { href: '/agreement/', label: 'Согласие для формы' },
  { href: '/cookie/', label: 'Согласие cookie' },
] as const

type LegalDocumentProps = {
  source: string
  currentHref: typeof documents[number]['href']
  sectionTitles: readonly string[]
}

function linkedText(text: string): ReactNode {
  const parts = text.split(/(https:\/\/volnami\.com\/(?:policy|agreement|cookie)\/|https:\/\/volnami\.com|v\.volnami@yandex\.ru)/g)
  return parts.map((part, index) => {
    if (part === 'v.volnami@yandex.ru') return <a href={`mailto:${part}`} key={index}>{part}</a>
    if (/^https:\/\/volnami\.com\/(?:policy|agreement|cookie)\/$/.test(part)) {
      return <Link href={part.replace('https://volnami.com', '')} key={index}>{part}</Link>
    }
    if (part === 'https://volnami.com') return <a href={part} key={index}>{part}</a>
    return part
  })
}

export function LegalDocument({ source, currentHref, sectionTitles }: LegalDocumentProps) {
  const lines = source.split(/\r?\n/)
  return <div className="legal-page">
    <a className="legal-skip" href="#legal-main">Перейти к тексту документа</a>
    <header className="legal-header">
      <Link className="legal-brand" href="/c7/" aria-label="Volnami — вернуться на сайт">
        <Image src="/logo/volnami-wordmark-green.svg" alt="Volnami" width={841} height={271} priority />
      </Link>
      <nav className="legal-nav" aria-label="Правовые документы">
        {documents.map((document) => <Link
          href={document.href}
          key={document.href}
          aria-current={document.href === currentHref ? 'page' : undefined}
        >{document.label}</Link>)}
      </nav>
    </header>
    <main className="legal-main" id="legal-main" tabIndex={-1}>
      {currentHref === '/cookie/' ? <aside className="legal-current-status">
        Сейчас сайт не использует аналитические и рекламные cookies. В локальном хранилище браузера сохраняются выбор движения (c7-motion-paused) и закрытие информационного уведомления (c7-privacy-notice-v1, до 180 дней). Они не используются для аналитики, рекламы или передачи данных формы. Уведомление можно снова открыть кнопкой «Конфиденциальность» в подвале. Согласие ниже применяется при подключении соответствующих сервисов после отдельного согласия посетителя.
      </aside> : null}
      <article className="legal-document">
        {lines.map((line, index) => {
          const content = linkedText(line)
          if (index === 0) return <h1 data-legal-line key={index}>{content}</h1>
          if (sectionTitles.includes(line)) return <h2 data-legal-line key={index}>{content}</h2>
          const isListItem = /^(?:–|\d+\))/.test(line)
          return <p className={isListItem ? 'legal-list-item' : undefined} data-legal-line key={index}>{content}</p>
        })}
      </article>
    </main>
    <footer className="legal-footer">
      <Link href="/c7/">Вернуться на сайт</Link>
      <a href="mailto:v.volnami@yandex.ru">v.volnami@yandex.ru</a>
    </footer>
  </div>
}
