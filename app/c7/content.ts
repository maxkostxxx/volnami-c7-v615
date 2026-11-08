import { site, type Case } from '@/content/site'

const bySlug = new Map(site.cases.list.map((item) => [item.slug, item]))

const extraMeatVisuals: Case['visuals'] = [
  { src: '/cases/c7/extra-meat/example3.webp', alt: 'Упаковка Extra Meat с говядиной для собак мелких пород', width: 672, height: 900 },
  { src: '/cases/c7/extra-meat/example1.webp', alt: 'Упаковка Extra Meat с лососем для стерилизованных кошек', width: 672, height: 900 },
  { src: '/cases/c7/extra-meat/example2.webp', alt: 'Упаковка Extra Meat с курицей для котят', width: 672, height: 900 },
  { src: '/cases/c7/extra-meat/example4.webp', alt: 'Упаковка Extra Meat с говядиной для взрослых кошек', width: 672, height: 900 },
  { src: '/cases/c7/extra-meat/example5.webp', alt: 'Упаковка Extra Meat с курицей для взрослых собак', width: 672, height: 900 },
]

function existing(slug: string, title: string): Case {
  const item = bySlug.get(slug)
  if (!item) throw new Error(`Missing C7 source case: ${slug}`)
  return { ...item, title }
}

function namedOnly(slug: string, title: string): Case {
  return {
    slug,
    title,
    teaser: '',
    blocks: [],
    visuals: [],
    pending: true,
  }
}

export const c7Site = {
  ...site,
  header: {
    ...site.header,
    cta: { ...site.header.cta, href: '#brief' },
  },
  cases: {
    ...site.cases,
    list: [
      { ...existing('miratorg-extra-meat', 'Мираторг — Extra Meat'), visuals: extraMeatVisuals },
      namedOnly('miratorg-meat-cards', 'Мираторг — карточки MEAT'),
      { ...existing('hobby-world', 'Hobby World (Hobby Games, настольные игры)'), visuals: [{ src: '/cases/c7/hobby-games/poster.jpg', alt: 'Жёлтый рекламный плакат Hobby Games с драконом и настольными играми', width: 910, height: 1276 }] },
      namedOnly('mi', 'МИ'),
      { ...existing('ora-ora', 'Ора Ора'), visuals: [{ src: '/cases/c7/ora-ora/stickers.jpg', alt: 'Лист фирменных стикеров Ora Ora с персонажами и логотипом магазина', width: 432, height: 607 }] },
      existing('ekorancho', 'ЭкоРанчо'),
      existing('kulek', 'Картофельный кулёк'),
      namedOnly('telegram-bot', 'Telegram-бот'),
    ] satisfies Case[],
  },
}
