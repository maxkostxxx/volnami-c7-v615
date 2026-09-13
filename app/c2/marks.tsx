import Image from 'next/image'
/** Реальный проектный артефакт подаётся как единичный музейный экспонат. */
export function HeroObject() {
  return (
    <div className="c2-object">
      <Image
        src="/cases/kulek/kulek-inhand.webp"
        alt="Фирменная упаковка «Картофельного Кулька» в руке"
        width={1005}
        height={1314}
        priority
        sizes="(max-width: 760px) 100vw, 40vw"
        className="c2-object-photo"
      />
    </div>
  )
}

export function StepArrow({ order }: { order: 1 | 2 | 3 }) {
  return (
    <svg
      className={`c2-arrow c2-arrow--${order}`}
      viewBox="0 0 40 12"
      width="40"
      height="12"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 6 H37"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M32 1.5 L37.5 6 L32 10.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
