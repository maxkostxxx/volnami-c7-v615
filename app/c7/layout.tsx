import { c7FontVariables } from './fonts'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  icons: { icon: '/logo/volnami-icon-green.svg' },
}

export default function C7Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={c7FontVariables}>{children}</div>
}
