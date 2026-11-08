# Промпты на генерацию изображений

Генерация визуалов через ИИ заказчиком разрешена и является ожидаемой
частью работы.

> **СТАТУС НА 08.09.2026: оба кадра сгенерированы заказчиком и подставлены.**
> `public/hero/c1-hero.webp` (2400×1350) и `public/hero/c2-object.webp`
> (1600×2000) стоят на своих местах, CSS-плейсхолдеры сняты.
> Промпты ниже сохранены на случай перегенерации.

**Генерируется всего два изображения.** Всё остальное на трёх концептах —
либо реальные визуалы кейсов из архивов, либо графика на CSS и SVG.

Причина, по которой список такой короткий: архивы кейсов приехали
с реальными макетами, поэтому страница кейса «Картофельный кулёк»
во всех трёх концептах строится на настоящих визуалах, а не на заглушках.
Концепт 3 не использует изображений на главной вообще — это его замысел
и одновременно страховка проекта.

Пока файлы не подложены, на их местах стоят **осмысленные CSS-композиции
тех же пропорций**, а не серые прямоугольники с надписью. Подстановка —
один файл в указанный путь, без правки вёрстки.

---

## 1. Первый экран концепта 1

- **Файл:** `public/hero/c1-hero.webp`
- **Размер:** 2400 × 1350 (16:9)
- **Куда:** `app/c1/page.tsx`, полноэкранный кадр первого экрана,
  `object-fit: cover`, привязка `object-position: center 40%`
- **Плейсхолдер до подстановки:** семь каустических полос света, веером
  от точки входа за правым верхним краем, размытие 26px, поверх —
  затемнение по глубине, так что нижняя треть остаётся тёмной водой.
  *(Раньше здесь стояли три концентрические дуги фирменного знака.
  Убраны при починке: дуга — приём концепта 3, а стояла на всех трёх
  первых экранах.)*

**Промпт (английский):**

```
Underwater photograph looking upward through deep ocean water toward the
surface, shafts of warm amber sunlight piercing the dark blue-teal mass,
suspended particles catching the light, no horizon, no sky, no shoreline,
no people, no marine animals, no boats. The water itself is the subject:
volume, density, the weight of the mass above the camera. Deep navy
(#071A2B) dominating the frame, amber caustics (#E3B04B) confined to the
upper third. Cinematic, shot on large format, shallow depth of field,
natural light only, high dynamic range, fine grain. Lower-left quadrant
must stay dark and uncluttered for overlaid text.
```

**Негативный промпт:**

```
text, letters, watermark, logo, people, swimmer, diver, fish, boat, sky,
horizon, beach, sand, foam, cartoon, illustration, 3d render, cgi,
oversaturated, teal-and-orange grade, stock photo look, lens flare
```

**Требования к отбору кадра:** нижняя левая четверть должна оставаться
тёмной и без деталей — там ложится слоган кеглем 128 и подзаголовок.
Кадр, где свет уходит в левый нижний угол, не годится: текст станет
нечитаемым и контраст 4.5:1 не выполнится.

---

## 2. Первый экран концепта 2

- **Файл:** `public/hero/c2-object.webp`
- **Размер:** 1600 × 2000 (4:5)
- **Куда:** `app/c2/page.tsx`, колонки 7–11 первого экрана,
  `object-fit: cover`
- **Плейсхолдер до подстановки:** на белом поле `#FFFFFF` замкнутый силуэт
  сосуда, у которого обе боковины — волна; залит разбавленными чернилами
  `#314237`, со второй плашкой на теневой стороне, линией плоскости
  и плоской тенью. *(Раньше здесь стояли вложенные дуги фирменного знака.
  Убраны при починке по той же причине, что и у концепта 1.)*

**Промпт (английский):**

```
Studio product photograph of a single sculptural vessel in matte ceramic:
a closed volume whose two sides are formed as opposing wave curves meeting
at a narrow neck, pale sage-green glaze. Standing on a seamless cool off-white
background
(#EEF1EE). Soft directional light from the upper left, long soft shadow
falling to the lower right, subtle gradient falloff on the background.
Nothing else in frame. Editorial still-life, medium format, sharp focus
throughout, neutral color, no styling props.
```

**Негативный промпт:**

```
text, letters, watermark, logo, hands, people, water, splash, liquid,
plants, flowers, fabric, table, props, reflections of a studio, warm
cream background, beige, terracotta, cartoon, illustration, 3d render,
cgi, heavy vignette
```

**Требования к отбору кадра:** фон обязан оставаться холодным
(зеленовато-серый белый). Кадр с тёплым кремовым или бежевым фоном
отбраковывается: сочетание тёплого кремового фона с контрастной антиквой
входит в список запрещённых приёмов.

---

## Что НЕ генерируется

| Что | Почему |
|---|---|
| Визуалы страницы кейса «Картофельный кулёк» | Есть реальные: семь чистых мокапов, вырезанных из слайдов — `kulek-1`, `kulek-inhand`, `kulek-dieline`, `kulek-food`, `kulek-flyer`, `kulek-pos`, `kulek-terrace`. Исходные `kulek-2..5.webp` на сайт не идут: это слайды презентации с чужими заголовками, а на `kulek-5` копирайт сторонней студии |
| Визуалы кейсов Трансформация реальности и ЭкоРанчо | Реальные: `public/cases/transformaciya-realnosti/`, `public/cases/ekorancho/` |
| Визуалы кейса «Десятое королевство» | Реальные, готовы: `public/cases/desyatoe-korolevstvo/` — но **кейс `pending`, текста нет**, поэтому нигде не подключены |
| Первый экран концепта 3 | Замысел концепта — работать без изображений |
| Кейсы на главной концепта 3 | То же: текстовый индекс без картинок |
| Иконки, паттерны, фоновые текстуры | Не нужны: графика собирается из фирменной дуги на SVG |
| Портреты команды, фото офиса | Таких текстов и данных в ТЗ нет, выдумывать нельзя |

---

## Кейсы без визуалов вообще

У Мираторга, Hobby World / Мосигры и Ora Ora в архивах ничего нет,
и генерировать под них изображения **нельзя**: это чужие реальные бренды
с существующей продукцией, сгенерированная «упаковка Мираторга» была бы
выдумкой, выдаваемой за выполненную работу.

Решение: в c1 их ленты заливаются вторым фоном и работают на типографике,
в c2 правая колонка показывает описание вместо превью, в c3 они и так
идут текстом наравне со всеми.

Если заказчик хочет их показать — нужны настоящие макеты от него.
Вынесено в финальный отчёт.
