import { site } from '@/content/site'

const { contacts } = site

/**
 * Финальный блок. Стоит и на главной, и на странице кейса — страница кейса
 * должна читаться как часть того же сайта, а не как отдельный документ.
 *
 * Для проверяемого хостингового превью CTA открывает email, который уже дан
 * в ТЗ. Бэкенд и форма при этом по-прежнему остаются за рамками задачи.
 */
export function Contacts({ id }: { id?: string }) {
  return (
    <section
      className="c3-sec c3-contacts"
      id={id}
      aria-labelledby="c3-contacts-title"
      tabIndex={id ? -1 : undefined}
    >
      <h2 className="c3-h2" id="c3-contacts-title">
        {contacts.title}
      </h2>

      <div className="c3-sec-text">
        {contacts.paragraphs.map((text) => (
          <p className="c3-body" key={text.slice(0, 24)}>
            {text}
          </p>
        ))}

        <p className="c3-contacts-cta">
          <a className="c3-btn c3-btn-lg" href={contacts.email.href}>
            {contacts.cta.label}
          </a>
        </p>
      </div>

      <dl className="c3-contacts-list">
        <div>
          <dt className="c3-contacts-label">{contacts.telegram.label}</dt>
          <dd className="c3-contacts-value">
            <a href={contacts.telegram.href}>
              {contacts.telegram.value}
            </a>
          </dd>
        </div>
        <div>
          <dt className="c3-contacts-label">{contacts.email.label}</dt>
          <dd className="c3-contacts-value">
            <a href={contacts.email.href}>{contacts.email.value}</a>
          </dd>
        </div>
        <div>
          <dt className="c3-contacts-label">{contacts.phone.label}</dt>
          <dd className="c3-contacts-value">
            <a href={contacts.phone.href}>{contacts.phone.value}</a>
          </dd>
        </div>
      </dl>
    </section>
  )
}
