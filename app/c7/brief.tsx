'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { C7WaveReveal } from './wave-reveal'

type RequiredField = 'name' | 'contact' | 'project' | 'consent'

export function C7Brief() {
  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => { setEnhanced(true) }, [])
  const [notice, setNotice] = useState('')
  const [errors, setErrors] = useState<Partial<Record<RequiredField, string>>>({})
  const [draft, setDraft] = useState<{ href: string; text: string } | null>(null)

  const prepareEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDraft(null)
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const contact = String(data.get('contact') ?? '').trim()
    const project = String(data.get('project') ?? '').trim()
    const company = String(data.get('company') ?? '').trim()
    const activity = String(data.get('activity') ?? '').trim()
    const timing = String(data.get('timing') ?? '').trim()
    const consent = data.get('consent') === 'yes'
    const nextErrors: Partial<Record<RequiredField, string>> = {}
    if (!name) nextErrors.name = 'Напиши, как к тебе обращаться.'
    if (!contact) nextErrors.contact = 'Оставь контакт для ответа.'
    if (!project) nextErrors.project = 'Расскажи хотя бы коротко о проекте.'
    if (!consent) nextErrors.consent = 'Подтверди согласие на обработку персональных данных.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setNotice(nextErrors.consent && Object.keys(nextErrors).length === 1
        ? 'Чтобы подготовить письмо, подтверди согласие на обработку персональных данных.'
        : 'Проверь выделенные поля — письмо пока не подготовлено.')
      const first = (['name', 'contact', 'project', 'consent'] as const).find((field) => nextErrors[field])
      if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus()
      return
    }
    const subject = `Бриф с сайта Volnami — ${name}`
    const body = [
      `Как обращаться: ${name}`,
      `Контакт для ответа: ${contact}`,
      company ? `Компания: ${company}` : '',
      activity ? `Деятельность компании: ${activity}` : '',
      timing ? `Сроки: ${timing}` : '',
      '',
      'О проекте:',
      project,
    ].filter((line) => line !== '').join('\n')
    const href = `mailto:v.volnami@yandex.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setDraft({href, text: `Кому: v.volnami@yandex.ru\nТема: ${subject}\n\n${body}`})
    setNotice('Письмо подготовлено. Открой почту или скопируй текст ниже. Заявка ещё не отправлена.')
  }

  return <C7WaveReveal className="c7-brief-form" id="brief" tabIndex={-1}>
    <div className="c7-brief-intro">
      <h3>Короткий бриф</h3>
      <p>Расскажи, что нужно сделать. Мы подготовим письмо — отправка останется за тобой.</p>
    </div>
    <noscript><p className="c7-brief-noscript">Чтобы обсудить проект без JavaScript, напиши на <a href="mailto:v.volnami@yandex.ru">v.volnami@yandex.ru</a>. Эта форма не отправляет данные без JavaScript.</p></noscript>
    <form method="post" inert={!enhanced} onSubmit={prepareEmail} noValidate onInput={() => { if (draft) { setDraft(null); setNotice('Текст изменён. Подготовь письмо ещё раз.') } }}>
      <label>
        Как к тебе обращаться
        <input name="name" type="text" autoComplete="name" required maxLength={100} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'c7-brief-name-error' : undefined} onInput={() => setErrors((current) => ({ ...current, name: undefined }))} />
        {errors.name ? <span className="c7-brief-error" id="c7-brief-name-error">{errors.name}</span> : null}
      </label>
      <label>
        Почта или телефон
        <input name="contact" type="text" autoComplete="off" spellCheck={false} required maxLength={160} aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? 'c7-brief-contact-error' : undefined} onInput={() => setErrors((current) => ({ ...current, contact: undefined }))} />
        {errors.contact ? <span className="c7-brief-error" id="c7-brief-contact-error">{errors.contact}</span> : null}
      </label>
      <label>
        Компания, если есть
        <input name="company" type="text" autoComplete="organization" maxLength={160} placeholder="Если обращаешься от компании" />
      </label>
      <label>
        Чем занимается компания
        <input name="activity" type="text" autoComplete="off" maxLength={200} placeholder="Чем занимаетесь" />
      </label>
      <label className="c7-brief-wide">
        О проекте
        <textarea name="project" required rows={4} maxLength={3000} aria-invalid={Boolean(errors.project)} aria-describedby={errors.project ? 'c7-brief-project-error' : undefined} onInput={() => setErrors((current) => ({ ...current, project: undefined }))} />
        {errors.project ? <span className="c7-brief-error" id="c7-brief-project-error">{errors.project}</span> : null}
      </label>
      <label className="c7-brief-wide">
        Сроки, если уже известны
        <input name="timing" type="text" autoComplete="off" maxLength={160} />
      </label>
      <p className="c7-brief-attachments">Референсы и файлы можно приложить в почтовом приложении после подготовки письма.</p>
      <div className="c7-brief-consent c7-brief-wide">
        <label>
          <input name="consent" type="checkbox" value="yes" required aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'c7-brief-consent-error' : undefined} onChange={() => {
            setErrors((current) => ({ ...current, consent: undefined }))
            if (errors.consent) setNotice('')
          }} />
          <span>Я даю <a href="/agreement/" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a> и ознакомлен(а) с <a href="/policy/" target="_blank" rel="noopener noreferrer">Политикой в отношении обработки персональных данных</a>.</span>
        </label>
        {errors.consent ? <span className="c7-brief-error" id="c7-brief-consent-error">{errors.consent}</span> : null}
      </div>
      <div className="c7-brief-send">
        <button type="submit" disabled={!enhanced}>Подготовить письмо</button>
        <span>Данные не сохраняются на сайте.</span>
      </div>
      <p className="c7-brief-notice" role="status" aria-live="polite">{notice}</p>
      {draft ? <div className="c7-brief-draft">
        <div className="c7-brief-send">
          <a className="c7-contact-cta" href={draft.href}>Открыть почту</a>
          <button type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft.text)
              setNotice('Текст письма скопирован. Отправь его на v.volnami@yandex.ru.')
            } catch {
              setNotice('Не удалось скопировать автоматически. Выдели текст письма в поле ниже и скопируй его.')
            }
          }}>Скопировать текст</button>
        </div>
        <label>Текст письма для отправки на v.volnami@yandex.ru
          <textarea readOnly rows={9} value={draft.text} onFocus={event => event.currentTarget.select()} />
        </label>
      </div> : null}
    </form>
  </C7WaveReveal>
}
