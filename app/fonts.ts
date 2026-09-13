import localFont from 'next/font/local'

/**
 * Все гарнитуры подключаются локально через next/font/local.
 * Google Fonts как CDN не подключается нигде — файлы лежат в app/fonts/,
 * подмножество Latin + Cyrillic, woff2, переменные где возможно.
 *
 * В исходной тройке каждый концепт использует РОВНО свою пару:
 *   c1 — cormorant + golos
 *   c2 — playfair  + commissioner
 *   c3 — kreadon   + cannonade  (фирменные)
 *
 * Вторая тройка повторно комбинирует эти же шесть локальных лицензированных
 * семейств, но не повторяет пару внутри c4–c6. Новые внешние файлы шрифтов
 * не добавляются перед клиентским показом.
 */

/* ------------------------------------------------------------------ бренд */

/**
 * Фирменная текстовая. Единственная фирменная гарнитура со светлым
 * начертанием, поэтому только она может нести основной текст.
 */
export const cannonade = localFont({
  src: [
    { path: './fonts/Cannonade.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Cannonade-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-cannonade-var',
  display: 'swap',
  preload: false,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

/** Фирменная дисплейная. Только Bold и ExtraBold, текст ею не набирается. */
export const kreadon = localFont({
  src: [
    { path: './fonts/Kreadon-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Kreadon-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-kreadon-var',
  display: 'swap',
  preload: false,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

/* --------------------------------------------------------------- концепт 1 */

/**
 * Старостильная антиква с настоящим курсивом (наклон −10°).
 * Нужна потому, что в фирменном ките нет ни антиквы, ни курсива,
 * а приём motionsites держится на них. Обоснование — в отчёте.
 */
export const cormorant = localFont({
  src: [
    { path: './fonts/CormorantGaramond.woff2', weight: '300 700', style: 'normal' },
    { path: './fonts/CormorantGaramond-Italic.woff2', weight: '300 700', style: 'italic' },
  ],
  variable: '--font-cormorant-var',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
})

/** Нейтральный русский гротеск для навигации и тела текста в c1. */
export const golos = localFont({
  src: [{ path: './fonts/GolosText.woff2', weight: '400 900', style: 'normal' }],
  variable: '--font-golos-var',
  display: 'swap',
  preload: false,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

/* --------------------------------------------------------------- концепт 2 */

/** Дидон с настоящим курсивом (наклон −14°). */
export const playfair = localFont({
  src: [
    { path: './fonts/PlayfairDisplay.woff2', weight: '400 900', style: 'normal' },
    { path: './fonts/PlayfairDisplay-Italic.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--font-playfair-var',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
})

/** Гуманистический гротеск низкого контраста для тела текста в c2. */
export const commissioner = localFont({
  src: [{ path: './fonts/Commissioner.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-commissioner-var',
  display: 'swap',
  preload: false,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

/** Классы всех гарнитур — вешаются на <html> в корневом макете. */
export const fontVariables = [
  cannonade.variable,
  kreadon.variable,
  cormorant.variable,
  golos.variable,
  playfair.variable,
  commissioner.variable,
].join(' ')
