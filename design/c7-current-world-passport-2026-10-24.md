# C7 — текущий паспорт мира · 24.10.2026 · AL38

AL37 визуально отвергнут заказчиком. Этот паспорт описывает текущую повторную реализацию, а не подтверждает художественную приёмку. Исторический AL36 и защищённый public/3d/c7/SOURCES.md не переписаны. Текущий build/evidence: screenshots/c7/2026-10-24-reference-rebuild-exec081/.

## Пространство и состояние

Условная единица — метр. Вода y=0.72; общий берег land/water из512 точек по A/image3, x[−111.8108,152.5838],z[−141.3973,3.2652]. Land x[−900,1200],z[−1450,500],112/78рядов normal/low; вода50/34рядов. Три гребня z=−340/−237/−162; дальние гряды снижены относительно AL37, передние складки усилены и дополнены на z130/180/225. Ложе ограничено глубиной9.

Один Scene, один lifecycle в landscape.tsx. Exact semantic anchors: hero0/about.16/process.30/services.47/cases.66/testimonials.83/contacts.93/конец1. Damping λ7.2, ambient time отдельно; reduced motion замораживает ambient и применяет exact. Hidden и непрозрачные services/cases приостанавливают renderer; reveal сначала синхронизирует фазу. Удалён общий CSS scrim пейзажа.

## Камера

C1 Hermite, near.3/far3000. Portrait blend при aspect.88→.58; wide FOV сохраняет горизонтальную композицию через 16/9 cover. About смотрит выше, освобождая небо под тексты; Process мягко смотрит вниз. Фактические ключи:

```ts
const desktopKeys: CameraKey[] = [
  { position: [0, 37, 85], target: [0, 32, -48], fov: 45 },
  { position: [3, 38, 93], target: [3, 50, -48], fov: 45 },
  { position: [9, 40, 108], target: [9, 3, -48], fov: 45 },
  { position: [16, 34, 155], target: [14, 33, -48], fov: 45 },
  { position: [20, 24, 190], target: [16, 29, -48], fov: 45 },
  { position: [22, 17, 225], target: [17, 26, -48], fov: 45 },
  { position: [24, 13, 250], target: [18, 25, -48], fov: 45 },
]

const mobileKeys: CameraKey[] = [
  { position: [0, 43, 100], target: [0, 36, -48], fov: 64 },
  { position: [2, 44, 110], target: [2, 75, -48], fov: 64 },
  { position: [7, 46, 125], target: [7, 7, -48], fov: 64 },
  { position: [14, 37, 165], target: [12, 35, -48], fov: 64 },
  { position: [18, 26, 200], target: [14, 31, -48], fov: 64 },
  { position: [20, 18, 230], target: [15, 28, -48], fov: 64 },
  { position: [22, 13, 250], target: [16, 27, -48], fov: 64 },
]

const keyProgress = [0, 0.16, 0.3, 0.47, 0.66, 0.83, 1]

```

flight-v5.json:1001точка×2маршрута; min clearance7.63, z монотонно растёт, разность производных позиции на стыках<.003. Это численная проверка геометрии, не плавности реального устройства.

## Материалы и атмосфера

WebGLRenderer Three0.186.0, sRGB output, ACESFilmic exposure1.12. Полуточный HDR reflection target сохраняет linear radiance до финального tone mapping. Color photo sRGB, control NoColorSpace.

Source camera45°16/9,[0,37,85]→[0,32,−48]. Фиксированная world-space регистрация цвета, depth reference1280×720 с допуском1.5–12, девять масок исключения нарисованных деревьев. Проекция позади исходной камеры запрещена. Микрофактура передней земли использует перекрывающиеся world-space выборки маленького участка травы из того же защищённого ассета; это материал, не новый фон. Сохранённое в исходнике освещение остаётся приближением, полного de-lighting нет.

Трава220230/110386инстансов normal/low, высота12–30см с плавным уменьшением у воды. 20групп деревьев: общие стволы/ветви,120/210спреев по8листьев; albedo задан только instanceColor, кроны уплотнены, у конических деревьев листва начинается ниже. Корни, тени и отражение связаны с тем же terrain.

Шесть частот волны задают и смещение воды, и аналитическую нормаль. Точный неполяризованный Fresnel n=1.333, поглощение по приближённой глубине. Planar reflection текущей сцены; GGX roughness.16 моделирует меньшую капиллярную рябь для солнечного следа. Источник блика — тот же sunlight color/intensity; отдельного нарисованного солнечного пятна нет. Отражение обновляется по phase>.003 или времени.1/.2с normal/low, при resize/assets; размер≤1024×640.

Один sun radius45 на z−2000, MeshBasic HDR color×8 с tone mapping; DirectionalLight использует ту же позицию. Тёплая aureole находится в shader неба и отражается той же камерой. Заданные ключи:

```ts
const stops = [
  [0, -1160, 28], [0.08, -1030, 260], [0.16, -820, 500],
  [0.30, -340, 820], [0.47, 240, 1030], [0.66, 700, 660],
  [0.79, 860, 350], [0.835, 930, 240],
  [0.93, 1020, 135], [1, 1100, -60],
]
```

Day=smoothstep70→760 по высоте, dusk=smoothstep.5→.7(progress)×(1−day). Key intensity lerp3.6→3.5×(1−dusk×.46); Hemisphere lerp1.18→1.3×(1−dusk×.15), нормализованная chromaticity неба и ground#4d6037. Небо dawn#e3d5c3/#ffc285/#e9b8a1; day#dce6e1/#fff0d5/#e8ddc4; dusk#b5a7b9/#f9ac89/#d88f81. Clouds7/10, независимый drift.38units/sec, прозрачность.18+day×.06+dusk×.03. Полный солнечный цикл теперь заканчивается у контактов, а не перед ними.

## Ресурсы и бюджет

Геометрия в worker с отменой и5с timeout; загрузка фото/control5с; initTexture по отдельным задачам, compileAsync main/reflection/reference, единый5с deadline. dispose завершает worker/таймеры/ресурсы/targets/shadows/renderer. DPR1/1.25, buffer≤1.5Mpx, adaptive.72–1;90slow/360fast. PCF shadows1024/2048. renderer.info учитывает все passes.

## Границы доказательств

Предыдущие native M3 Pro/zoom/visibility замеры AL35/36 — история, не новый FPS AL38. Новые проверки сохраняются отдельно. iPhone/Safari, Android/Chrome, VoiceOver/TalkBack и художественная приёмка заказчиком не проверены/не получены. Никакого 10/10 этот паспорт не присваивает.
