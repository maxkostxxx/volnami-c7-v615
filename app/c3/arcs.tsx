/**
 * Фирменная графика концепта 3. Рисуется вектором, ничего не генерируется.
 *
 * Дуга — элемент знака Volnami (концентрические окружности за «V»).
 * Здесь она не украшение, а конструкция: держит первый экран, несёт полосу
 * «Как мы работаем» и двигается под полосой отзывов.
 */

/**
 * Первый экран. Три КРУПНЫЕ дуги фирменного знака, шире экрана, уходящие
 * за оба края. Гребень у всех трёх стоит на одной вертикали (x = 520 из 1600),
 * смещённой влево: набор идёт по левому краю, графика идёт за ним.
 *
 * Радиусы разведены больше чем вдвое — 13000 / 9500 / 6000 при ширине кадра
 * 1600. До ревизии они отличались на 1.3% (4687 / 4627 / 4567), то есть шли
 * строго параллельно узкой полосой и начинали читаться как фрагмент сетки —
 * ровно тот первый экран gaudi, от которого концепт обязан отстроиться.
 * Теперь просвет открывается от 58 / 72 на гребне до 75 / 108 у правого края,
 * а стрела прогиба на одном пролёте различается втрое: 45 / 61 / 97.
 * Три волны разного размера, а не три линии сетки.
 *
 * Заодно поднят вес: 1.75 / 3 / 5 px и непрозрачность 0.4 / 0.62 / 0.88.
 * При прежних 0.3 / 0.48 / 0.75 на волосяной обводке контраст к фону падал
 * до 1.37 — дуги читались только на снимке с поднятой яркостью.
 *
 * Дуги не строго концентрические: у общего центра радиусы такой разницы
 * развели бы вершины на полторы тысячи единиц, и в кадр попала бы одна дуга.
 * Общая ось и разные радиусы держат тот же мотив вложенных колец знака.
 * Отступление от буквы `design/c3.md` зафиксировано в `reports/c3.md`.
 *
 * viewBox по высоте равен пропорции из CSS (1600 / 240), поэтому масштаб
 * по обеим осям одинаковый и окружности остаются окружностями на всех ширинах.
 */
export function HeroArcs() {
  return (
    <svg
      className="c3-arcs"
      viewBox="0 0 1600 240"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="#f8c6ce">
        <circle
          cx="520"
          cy="13008"
          r="13000"
          strokeWidth="1.75"
          strokeOpacity="0.4"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx="520"
          cy="9566"
          r="9500"
          strokeWidth="3"
          strokeOpacity="0.62"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx="520"
          cy="6138"
          r="6000"
          strokeWidth="5"
          strokeOpacity="0.88"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  )
}

/** Стрелка между шагами: сегмент фирменной арки с наконечником, не прямая. */
export function StepArrow({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 22"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 18 Q28 4 50 10" />
        <path d="M41.3 12.3 L50 10 L43.7 3.6" />
      </g>
    </svg>
  )
}

/** Дуга под полосой отзывов. Ширина 200% контейнера — ей есть куда ехать. */
export function QuotesArc() {
  return (
    <svg
      className="c3-quotes-arc"
      viewBox="0 0 3200 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Ревизия: вторая дуга-эхо убрана. Одна арка на движение, не две. */}
      <circle
        cx="1600"
        cy="18331"
        r="18321"
        fill="none"
        stroke="#f8c6ce"
        strokeWidth="2"
        strokeOpacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Иконка Telegram. */
export function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.9 4.3 18.7 20c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8L19.1 6c.4-.3-.1-.5-.6-.2L6.7 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5l18.4-7.1c.8-.3 1.5.2 1.3 1.2Z"
      />
    </svg>
  )
}

/** Гамбургер: три дуги. Раскрытое состояние — две скрещённые дуги. */
export function BurgerMark({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 28 18" width="28" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {open ? (
          <>
            <path d="M3 3.5 Q14 9 25 14.5" />
            <path d="M3 14.5 Q14 9 25 3.5" />
          </>
        ) : (
          <>
            <path d="M1 4 Q14 0 27 4" />
            <path d="M1 9.5 Q14 5.5 27 9.5" />
            <path d="M1 15 Q14 11 27 15" />
          </>
        )}
      </g>
    </svg>
  )
}
