import type { Viewport } from 'next'

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#000000',
}

export default function C6Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
