import type { ReactNode } from 'react'
import { C7WaveReveal } from './wave-reveal'

export function C7AboutReveal({ children }: { children: ReactNode }) {
  return <C7WaveReveal className="c7-about-sheet">{children}</C7WaveReveal>
}
