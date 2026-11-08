import localFont from 'next/font/local'

const c7Kreadon = localFont({
  src: [
    { path: '../fonts/Kreadon-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/Kreadon-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-c7-kreadon',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

const c7Cannonade = localFont({
  src: [
    { path: '../fonts/Cannonade.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/Cannonade-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-c7-cannonade',
  display: 'swap',
  preload: true,
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

export const c7FontVariables = `${c7Kreadon.variable} ${c7Cannonade.variable}`
