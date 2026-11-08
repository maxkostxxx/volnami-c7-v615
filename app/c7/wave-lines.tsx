export function C7WaveLines({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  return <svg className={`c7-wave-lines c7-wave-lines--${tone} ${className}`} viewBox="0 0 1440 240" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <g className="c7-motion-ambient">
      <path pathLength="1" d="M-80 136C100 24 236 232 430 126S738 34 906 130s308 90 614-44" />
      <path pathLength="1" d="M-80 174C122 70 246 246 456 164s284-96 472-4 328 82 592-38" />
      <path pathLength="1" d="M-80 94C116-8 276 182 462 92s296-70 464 10 312 58 594-52" />
    </g>
  </svg>
}
