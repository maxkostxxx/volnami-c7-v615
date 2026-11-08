# C7 v641 — аудит производительности и проверенные локальные изменения

Начат07.11, завершён08.11.2026 МСК. **Это локальный кандидат, не публикация.** Публичной остаётся [v640](https://maxkostxxx.github.io/c7/?release=v640). В текущем поручении запрещены публикация и Git push/commit; они не выполнялись. Субагенты не использовались, проверки запускались headless последовательно, настройки компьютера/другие проекты не менялись.

**Результат:** исправлено повторное удержание16 МиБ WASM после позднего horizon decode; убраны неиспользуемые каналы двух текстур (расчётное хранение GPU −6 МиБ mobile/−36 МиБ desktop). Детализация, DPR, камера, свет, солнечный цикл, вода и UI v640 сохранены. Большого ускорения FPS или старта нет. Общие40–60 FPS на desktop, strict Firefox и физические проверки остаются открытыми.

Локальный просмотр: [v641 на3191](http://127.0.0.1:3191/c7/). Проверенный пакет: [папка](/Users/maxkost/volnami/artifacts/c7-preview-2026-11-07-v641-local), [110 SHA-256](/Users/maxkost/volnami/artifacts/c7-preview-2026-11-07-v641-local-manifest.json). Принятые исходные изменения: [проверенный обратимый patch](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/accepted-source.patch). Полные измерения: [summary.json](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/summary.json). Сборка12 с,89 source hashes/43 bundled sources/110 package files проверены;22 565 517 байт включают альтернативные бинарные транспорты и изображения кейса, а не первую загрузку страницы.

## 1. Стек, сохранность и условия

React19.1.1, Next15.5.29 static export, Three0.186.0 WebGL2; native renderer в отдельном worker/OffscreenCanvas, основной поток обслуживает DOM/scroll. R3F нет. C7 использует нативные Web Animations для появления контента; GSAP3.15.1 присутствует в проекте, переписывания сцены/обновления основных зависимостей не было. GLB/glTF, физика и покадровый pointer raycasting в этом runtime отсутствуют. Геометрия процедурная, есть заранее подготовленные бинарные поля и instanced grass.

Сохранены существующие незакоммиченные изменения: [backup](/Users/maxkost/volnami/backups/c7-v641-start-2026-11-07), tracked diff и HEAD4cfcc9a не изменены. Старый runtime-v637 совпадает с пакетом v640. Изменения исходников: только3 scene-модуля,4 ссылки на runtime вapp/c7 и служебные сборка/упаковка/QA. Все прежние бинарные исходники сохранены. [Проверка сохранности/пакета](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/verification.json).

Apple M3 Pro,11 логических CPU,18 ГиБ RAM; Darwin25.6 arm64. Chrome156.0.8078.80, ANGLE/Metal Apple M3 Pro. Питание AC; пустая страница p50/p95 rAF16.7мс. Ранее зафиксированный30Hz на батарее не смешивался с этим набором. Чужая работа на Mac могла влиять на разброс; GPU-прогоны выполнялись последовательно. [Environment](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/environment.json).

Viewports390×844/1440×900/2560×900, CSS deviceScaleFactor1. Реальный drawing buffer390×844/2160×1350/3840×1350: renderer DPR1 mobile и1.5 desktop, MSAA4, прежние render targets/сглаживание/геометрия.390 — touch/viewport эмуляция на Mac, не телефонный GPU. Network профиль: download4 000 000bit/s, upload1 000 000bit/s, latency100ms через CDP; page CPU×4, действие throttling на dedicated worker отдельно не калибровалось. Это не модель слабого телефона.

Production export обслуживался собственным loopback HTTP сервером: текст Brotli/gzip, HTML revalidate, hashed chunks immutable, бинарные .zst/.br/.gz без повторного сжатия, реальный HTTP cache. На live GitHub текст отдается gzip/600s; локальные цифры не являются временем CDN/интернета. HEAD live использован только для чтения заголовков: [headers](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/public-headers-readonly.json). Loading не использует request interception, который отключил бы HTTP cache. Для GPU/ownership QA перехваты одинаковы до/после и не попали в продукт.

## 2. Причины и принятые исправления

| Причина / доказательство | Исправление / статус |
| --- | --- |
| Progressive horizon может завершиться после раннего release декодера. Fixture:3Dready≈1.8с, horizon≈5.6с; baseline cache вновь удерживает16 777 216B. Три парных прогона: после принудительного GC живо16 МиБ в старой версии и0 в новой. WeakRef отслеживает реальный WebAssembly.Memory и buffer.byteLength. | [world.js:241](/Users/maxkost/volnami/lab/c7-scene/world.js:241): release также при fulfilled/rejected skyHorizon.readyPromise. In-flight consumers сохраняют собственную ссылку. Финальный bundled runtime проверен отдельно; поздняя checksum-ошибка тоже оставляет0B. Это освобождение владения для GC, не гарантия немедленного снижения RSS. |
| Cloud coverage и generated bump читаются shader только по R, но хранились RGBA8. Известные размеры/mip levels дают3 лишних канала; исходный цветовой материал использует остальные каналы и оставлен прежним. | [sky.js:138](/Users/maxkost/volnami/lab/c7-scene/sky.js:138), [materials.js:37](/Users/maxkost/volnami/lab/c7-scene/materials.js:37): RedFormat/R8, прежние pixels/mips/filtering/resolution/NoColorSpace. Расчёт хранения −6 291 456B mobile,−37 748 736B desktop.33 Chromium+22 WebKit pixel pairs точны. |
| Wide active flight остаётся GPU/driver dominated: основной поток не имеет long tasks во время пролёта; worker CPU profile преимущественно idle, CPU-submit p50≈8.7мс против≈27–30мс на completed frame. До2347 calls и8.46млн submitted triangles на полный кадр, включая повторные shadow/reflection/environment passes. Trace содержит Metal presentation/backpressure. | Не выдано за исправленное. Ранее отвергнутые batching/static matrices/снижение DPR не повторялись. Остановка карт света/отражения, упрощение shader или детализации изменили бы изображение. Эти компромиссы не применены. |
| Warm загрузка0B, но ready≈2.5с desktop/1.8с mobile; значит остаётся построение/декодирование/компиляция, а не только сеть. На4Мбит/с cold≈5.3с. Diagnostic startup profile распределён по подготовке данных/геометрии, проверкам bindings/программ, getProgramInfoLog/GC; одного дешёвого безопасного исправления, дающего крупный выигрыш, не подтверждено. | Текущие ранний worker, загрузка в параллель, binary cache, compileAsync и mobile-производные сохранены. Изменения без подтверждения пользы не добавлялись; ускорение старта не заявляется. |

WASM-объём выше измерен по памяти конкретных экземпляров, а не выведен из renderer.info. Runtime.getHeapUsage.backingStorageSize в этой версии V8 не отражает освобождение данного WASM и почти одинаков; он не использовался как доказательство16 МиБ. Peak WASM23 396 352B не снижен. [Три пары](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/before-decoder-late-weak1.json), [после](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/after-decoder-late-weak1.json), [финальный runtime](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/final-decoder-late.json), [rejected readiness](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/failure-decoder-late.json).

GPU bytes — **оценка известных texture formats/mips**, не физический VRAM/RSS/пик драйвера. До/после:390 141 489 908→135 198 452B, desktop494 843 084→457 094 348B. Не включены driver padding, некоторые внутренние PMREM buffers и полный default framebuffer/MSAA. Измеренные byteLengths CPU geometry buffers:73 083 304B mobile,140 016 864B desktop, без изменения. Renderer counters44 textures/317 mobile или621/478 desktop geometries — количество уже инициализированных GPU-ресурсов в выбранной позе, не байты и не все объекты мира. [Инвентарь](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/after-pixels-inventory.json).

Надёжная упаковка: [c7-package-world.mjs](/Users/maxkost/volnami/scripts/c7-package-world.mjs) по умолчанию выпускает runtime-v641 и пишет фактическую версию из target. App preload/early worker/main-thread fallback/worker и оба build/package скрипта ссылаются на641. Временные QA handlers/WeakRefs/профайлеры остались только в evidence. Старые исходники иruntime-v637 сохранены.

## 3. До / после — несколько прогонов

Каждая ячейка — медиана [min–max] трёх прогонов. Полные waterfall/headers/request timings/long tasks/events сохранены в individual *-loading-*.json.

Ready — сообщение renderer и DOM is-ready после первого submit; visible — opacity canvas≥.98. Это не timestamp физического показа GPU на дисплее.

| Загрузка | Ready до,с | Ready после,с | Visible до→после,с |
| --- | ---: | ---: | ---: |
| 1440×900, локально; cold | 2.63 [2.61–2.71] | 2.70 [2.60–2.74] | 2.79 [2.77–2.88] → 2.86 [2.77–2.89] |
| 1440×900, локально; warm | 2.56 [2.52–2.56] | 2.53 [2.48–2.57] | 2.71 [2.70–2.74] → 2.70 [2.65–2.75] |
| 390×844, эмуляция; cold | 1.88 [1.88–1.90] | 1.91 [1.90–1.94] | 2.04 [2.04–2.08] → 2.07 [2.06–2.09] |
| 390×844, эмуляция; warm | 1.83 [1.81–1.83] | 1.84 [1.82–1.84] | 1.98 [1.96–1.99] → 1.99 [1.98–2.00] |
| 390×844, CDP 4 Мбит/с,100 мс, CPU×4; cold | 5.33 [5.32–5.43] | 5.32 [5.32–5.39] | 5.48 [5.47–5.59] → 5.47 [5.47–5.55] |
| 390×844, CDP 4 Мбит/с,100 мс, CPU×4; warm | 2.09 [2.04–2.09] | 2.06 [2.05–2.07] | 2.25 [2.22–2.25] → 2.22 [2.21–2.23] |

LCP в локальном desktop cold92[80–100]→76[60–80]мс, mobile80[60–88]→92[64–100]мс; в ограниченном профиле480[476–604]→460[456–608]мс. Кандидат LCP — текст, **не готовая3D-сцена**. CLS0 во всех36 загрузках. На чистом desktop/mobile main long tasks после0; ограниченный профиль сохраняет максимум103мс. Menu event durations после16–48мс в локальном профиле; это лабораторные interaction events, не пользовательский INP. Blocking-over50ms отдельно сохранён и не назван INP.

| GPU-completed frames/s, существующие fences | До | После |
| --- | ---: | ---: |
| 390; вниз+вверх 24 с | 59.94 [59.91–59.96] | 59.96 [59.92–59.97] |
| 390; вниз+вверх 6 с | 59.75 [59.44–59.84] | 59.57 [59.43–59.76] |
| 1440; вниз+вверх 24 с | 36.43 [35.97–36.43] | 35.32 [35.26–35.42] |
| 1440; вниз+вверх 6 с | 34.74 [34.45–34.92] | 33.66 [33.47–34.79] |
| 2560; вниз+вверх 24 с | 34.86 [34.27–34.98] | 34.36 [34.06–34.61] |
| 2560; вниз+вверх 6 с | 33.02 [32.96–33.12] | 32.76 [32.67–33.06] |

Это наблюдаемая производительность завершения команд WebGL, **не rAF и не FPS физического дисплея**. Отдельно записаны CPU submit и main rAF. Сэмплирование worker CPU включалось симметрично только1440/repeat0; trace/startup profile — отдельные диагностические прогоны, не чистые loading measurements.

Последовательный before/after дал немного меньшие desktop цифры; на основании этой серии ускорение/отсутствие регрессии не объявлялось. Дополнительная одинаковая12с траектория с чередованием B/C/C/B1440: baseline34.30/34.05, candidate34.28/34.55, среднее34.18→34.41 (+0.7%). Значимого изменения скорости не подтверждено; это не×2. [ABBA](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/abba.json).

### Плавность и редкие тяжёлые кадры

Интервалы между **наблюдёнными** GPU completion: polling4мс и объединение завершений создают интервалы0/33/66мс. Они полезны для сопоставления хвостов, но не являются точными display frame times или exclusive GPU ms.

| Ширина/проход | p95,мс до→после | p99,мс до→после | Худший интервал,мс до→после |
| --- | ---: | ---: | ---: |
| 390; 24 с | 33.4 [33.4–33.5] → 33.4 [33.4–33.5] | 33.8 [33.5–34.8] → 34.7 [34.7–34.8] | 35.5 → 35.6 |
| 390; 6 с | 32.8 [23.6–32.9] → 32.9 [32.4–33.2] | 33.7 [33.4–34.1] → 33.6 [33.4–33.8] | 35.1 → 35.1 |
| 1440; 24 с | 67.4 [66.0–68.0] → 68.3 [66.3–69.1] | 75.5 [73.2–75.5] → 76.7 [75.7–78.5] | 84.5 → 84.9 |
| 1440; 6 с | 61.9 [45.1–64.0] → 60.4 [41.7–67.8] | 70.3 [69.5–72.7] → 69.1 [67.9–78.6] | 80.3 → 78.7 |
| 2560; 24 с | 68.5 [67.1–68.5] → 68.1 [67.2–71.4] | 77.2 [75.7–77.5] → 77.6 [76.7–79.0] | 84.3 → 88.1 |
| 2560; 6 с | 65.5 [65.1–68.5] → 69.8 [63.9–70.6] | 72.3 [70.3–81.6] → 73.5 [73.4–77.3] | 85.1 → 86.9 |

Main rAF в основном16.7мс, long tasks во всех36 flight сценариях0; это не доказательство60FPS самого3D. Renderer callbacks/JS вокруг render не использованы как точное времяGPU. Сырые fence/submit arrays — *-frames.json.gz; профили worker — *.cpuprofile.gz, [trace](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/candidate-browser-trace.json.gz).

## 4. Загрузка, ресурсы и память

Первая передача response bodies: desktop3 444 528→3 445 578B; mobile2 758 283→2 759 333B. В пределах≈1КБ overhead новых chunks/runtime; **сетевого ускорения этим изменением нет**. Warm —0B server body во всех18 повторных загрузках. Первая загрузка укладывается в сетевые ориентиры ТЗ по bytes на этом export, но4Мбит/с всё ещё≈5.3с доready. HTML/font/CSS/worker preloads/startup fetch chains сохранены в waterfall.

Cold после:4 используемых woff2 —86 756B,11 page scripts —126 464B, worker/world и вспомогательные scripts в категорииother —248 696B; основной world —242 002B Brotli, на live исходныйv640 world gzip≈264 967B.37 записей browser request log и34server requests не следует трактовать как дубли всей библиотеки, повторные URL preload/module обслужены cache. Server повторов0. Playwright sizes для некоторых cache hits возвращает отрицательный responseBodySize; сырые записи сохранены, агрегат clamp0, серверные счётчики независимы.

Основные cold ресурсы: terrain geometry.zst841 092B, compact sky522 533B и270 015B; mobile leaf mip PNG300 086B, desktop cloud WebP443 394B/leaves238 115B. Нет дополнительных сторонних hosts. Переход PNG→WebP уже отклонён вv624 из-за прозрачных краёв; он не повторялся. Meshopt/Draco/KTX2 не добавлялись без подходящего входа и проверки качества/декодирования. Все оригиналы сохранены;3D не заменена постером.

20 внутренних Next Link case/back циклов на1440, до и после: на кейсе0workers, на C7 ровно1; early departure0. timeOrigin сохранялся — это client navigation, не маскирующая очистку full reload. В обеих версиях DOM:7documents/233nodes/376listeners стабильно. Main away heap послеGC растёт при прогреве≈4.27→5.26МиБ за20циклов, последние два значения практически одинаковы. После worker used heap54 006 544–54 058 416B, backing158 158 584B постоянно. Mobile5циклов: backing87 238 791B, worker used≈52.55МБ. Это ограниченная серия, не обещание отсутствия любой утечки за часы. [Before20](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/before-chrome-long-lifecycle.json), [after20](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/after-chrome-long-lifecycle.json).

## 5. Внешний вид и поведение

- Chromium33/33 фиксированных RGBA SHA-256 точны:11фаз×390/1440/2560. WebKit22/22 точны:11фаз×390/1440. GL errors0. Dawn/day/dusk скриншоты before/after сохранены; композиция, кроны, берег, свет и вся непрерывная3D прежние. Это parity сv640, не новое подтверждение полного совпаденияimage3.
- Firefox155.0:19/22 strict SHA точны,0runtime/GL errors. Повторная проверкаbaseline/baseline тоже даёт отличия; дополнительная baseline-only серия воспроизвела тот же закатный участок27 518pixels/max channel delta52/255, который встретился вcandidate/candidate. Нельзя скрывать эту величину под формулировкой «только1LSB». Новой причины изR8 не установлено; строгая повторяемость Firefox **OPEN**, неPASS. [Strict](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/firefox-pixels.json), [controls](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/firefox-control.json), [baseline-only](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/firefox-baseline-repeat.json).
- Реальныеproduction slow/fast/reverse проходят весь маршрут0→1→0 на3ширинах,3повтора до и после; ошибки0. Resize/ориентация туда/обратно сохраняют точную semantic phase0.3 и конечную камеру, Chrome/WebKit390/1440.5навигаций+ранний уход Chrome до/после иWebKit после:0висящих workers, ошибок0.
- UI3ширины:4повторных входа heading down/up,0overflow, вход без большойclip-маски; все4позиции карусели/циклические стрелки/Home/End/Arrow, форма при фокусе сразу доступна. Smoke2ширины:уведомление/согласие/mailto без сетевой отправки формы, legal/case hashes, кейсExtra Meat.5edge modes:автосмена/пауза/свайп, reduced/manual paused, noJS, noIntersectionObserver; targeted axe карусели0violations. [Regression status](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/regression-status.json).
- Fault6сценариев390/1440: noWebGL/SaveData оставляют рабочий fallback и0workers; реальная WEBGL_lose_context/restore вworker возвращает сцену, GL0, фиксированный кадр точно совпадает до/после. [Fault](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/fault.json).
- Synthetic visibility handler:frames/time не меняются при hidden getter+visibilitychange ивозобновляются. Реальная headless вкладка оставаласьvisibility=visible даже после переключения/минимизации; native hide **NOT_RUN**, не подменён синтетикой. [Visibility](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/trace-visibility.json).
- Существующий horizon loader suite:10/10 актуальных проверок PASS. Первый запуск обнаружил устаревшее ожидание ошибки размера: current transport отклоняет повреждение раньше поchecksum. QA обновлён, исходныйFAIL сохранён вhorizon-loader; transport validation не ослаблен. [Current suite](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/horizon-loader-current/results.json).
- Next production build ипроверка исходников/110SHA/отсутствия QA handlers в пользовательском пакете PASS. HTML/worker/main-thread path используютruntime-v641. Пакет не публиковался.

## 6. Что остаётся / недоступные измерения

1. Wide active flight≈33–35 completed frames/s, p95 наблюдённых завершений≈60–70мс:40–60FPS не закрыты. Дальнейший существенный выигрыш требует изменения стоимости vertex/fragment растительного и земляного света, повторных теневых/отражённых проходов с pixel parity. Отвергнутые отключения эффектов и снижение качества не приняты.
2. Cold3D≈5.3с на заданной сети; cache не устраняет стоимость инициализации≈1.8–2.5с. Точная ускоренная shader/geometry подготовка ещё не реализована; нет оснований обещать загрузку до4с везде.
3. Firefox strict repeatability OPEN; обнаруженное поведение воспроизводится ивbaseline. Полное художественное совпадениеimage3 этим проходом не исправлялось.
4. Физические iOS/Android/слабыйGPU NOT_RUN: устройства/adb/Xcode mobile environment недоступны, USB-скан их не обнаружил. Установленные браузеры наMac этого не заменяют. Native Safari/VoiceOver/TalkBack NOT_RUN: доступной управляемой физической среды нет, видимые окна и разрешения компьютера текущим поручением не менялись. WebKit — engine QA, не Safari acceptance.
5. Настоящее скрытие вкладки, долговременные энергопотребление/нагрев/полный process RSS/driver VRAM/точное exclusiveGPUtime/fieldINP и реальные пользовательские Core Web Vitals не измерены. КомандыGL, CPUprofile и renderer counters не выданыза эти величины.
6. Неделя хостинга/аккаунт/внешняяприёмка не проверялись и повторно не запрашивались. Публичнаяv640 прежняя; G04/G07REWORK, G08OPEN.10/10 и×2 не заявлены.

## 7. Установленные скиллы и инструменты

Через штатный skill-installer установлены только [threejs-asset-pipeline](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-asset-pipeline), [web-perf](https://github.com/cloudflare/skills/tree/main/skills/web-perf), [threejs-debug-profiler](https://github.com/majidmanzarpour/threejs-game-skills/tree/main/skills/threejs-debug-profiler). SKILL.md и нужный debug playbook прочитаны; это справочники, не дополнительные разрешения. Существующий [threejs-performance](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-performance) прочитан, SHA совпадает с upstream, не перезаписан. R3F отсутствует, r3f-best-practices не устанавливался.

Локально добавлены только браузеры Playwright WebKit26.6/build2359 иFirefox155.0/build1543. Использованы уже имеющиеся Playwright1.63/Chrome156/Node24/Python/CDP Network,Performance,Profiler,HeapProfiler,Tracing; native WASM WeakRef ownership. Chrome DevTools MCP недоступен, вместо него Playwright/CDP; конфигурация MCP не менялась. Основные зависимости неизменны. [Установка/версии/SHA](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/skills.json).

Для повторения: `node /Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/loading.mjs` / `flight.mjs` сQA_LABEL/QA_BASE_URL; использовать сначала baseline3190, затем candidate3191, без других GPU-прогонов. `verify.mjs` проверяет исходники, пакет, старый runtime и preexisting diff. Старые 30Hz-цифры UI-отчёта v640 напрямую несопоставимы с этим 60Hz-набором. Локальный сервер: `node /Users/maxkost/volnami/scripts/c7-perf-server.mjs /Users/maxkost/volnami/artifacts/c7-preview-2026-11-07-v641-local 3191`.

Финализация: все собственные headless-браузеры завершены; вспомогательные серверы3099/3100/3190 остановлены. Для локального просмотра оставлен только3191, HTTP200/HTML SHA и runtime-v641 проверены. [Итоговый receipt](/Users/maxkost/volnami/evidence/c7-v641-performance-2026-11-07/completion.json).
