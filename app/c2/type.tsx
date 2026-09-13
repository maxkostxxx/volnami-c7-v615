import type { ReactNode } from 'react'

/**
 * Типографическая система концепта: служебные слова (предлоги и союзы)
 * в дисплейном наборе идут настоящим курсивом Playfair.
 *
 * Это правило, а не подсветка одного слова: оно применяется ко всем
 * дисплейным строкам одинаково — «Плывём *в* потоке идей»,
 * «*О* нас», «Брендинг *и* дизайн», «Готовы *к* новым волнам роста?».
 */
const SERVICE_WORDS = new Set([
  'в',
  'к',
  'и',
  'с',
  'о',
  'у',
  'а',
  'на',
  'по',
  'за',
  'из',
  'от',
  'до',
  'для',
  'но',
])

/** Разбивает строку на слова и оставляет пробелы на месте. */
export function Display({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\s+)/)
  return parts.map((part, i) => {
    const bare = part.replace(/[^\p{L}]/gu, '').toLowerCase()
    if (bare && SERVICE_WORDS.has(bare)) {
      return (
        <i key={i} className="c2-serviceword">
          {part}
        </i>
      )
    }
    return part
  })
}
