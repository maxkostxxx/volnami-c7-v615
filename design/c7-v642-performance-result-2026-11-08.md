# C7 v642 — второй экспериментальный проход производительности

08.11.2026 МСК. **Локальная проверенная версия, без публикации, push и commit.** Публичная v640 не менялась; её доступность здесь повторно не измерялась. Субагенты и видимые окна не запускались. Чужой tracked diff и HEAD сохранены. Предыдущие исправления v641 сохранены.

## Результат и границы

На сопоставимом активном пролёте2560 завершение GPU-команд выросло **34,44→37,20/с (+8,0%)**, на переходе1440 — **42,51→47,10/с (+10,8%)**. Это не физически отображаемый FPS. Интервалы отправки и их тяжёлый хвост также улучшились; полный разброс ниже. На390 эмуляция уже упирается примерно в60 входных обновлений/с: прирост FPS не доказан. **×2,60 FPS на широком пролёте и готовность <4с на4Мбит/с не достигнуты.**

Приняты три небольшие группы: компиляторная специализация неиспользуемого native receiveShadow у ground/farGrass; подготовка неизменной turf-текстуры во время незавершённой загрузки terrain; устранение скачка при позднем появлении horizon-освещения с синхронным обновлением отражения. Постоянное снижение DPR/детализации, удаление эффектов и изменение камеры не применялись.

Просмотр: [локальный v642](http://127.0.0.1:3198/c7/). Пакет: [artifacts/c7-preview-2026-11-08-v642-local](/Users/maxkost/volnami/artifacts/c7-preview-2026-11-08-v642-local). [110 SHA-256](/Users/maxkost/volnami/artifacts/c7-preview-2026-11-08-v642-local-manifest.json), [обратимый source patch](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/accepted-source.patch). Patch проверен `git apply --reverse --check`, откат не выполнялся.

## Стенд, методика и корректность прежних показателей

Apple M3 Pro,11 logical CPU,18ГиБ RAM, macOS26.7.1/arm64, Chrome156.0.8078.80 с ANGLE Metal. Headless, production export, AC100%, системных thermal/performance warnings нет. Температура кристалла недоступна. После закрытия наших Chrome драйвер всё ещё показывал≈64% GPU utilization: внешняя нагрузка реально присутствовала, её источник не установлен, чужие приложения не трогались. Поэтому разные часы/серии напрямую не сравниваются.

CSS viewports390×844,1440×900,2560×900, deviceScaleFactor1. Настройка сцены выбирает renderer DPR1/1,5/1,5, фактические buffers390×844,2160×1350,3840×1350. GPU-стенд изолирует настоящий worker/renderer на same-origin странице; размеры камеры/buffer задаются явно. У этой служебной страницы нет mobile viewport meta, поэтому её layout viewport может быть980: это проверка нагрузки renderer при390px, а не доказательство мобильного compositor/UI. Отдельные UI/load/scroll проверки идут на настоящем `/c7/` с корректным viewport meta.

Основные сравнения: свежий browser process на прогон, загружены поля/текстуры, compileAsync завершён, затем2с движения прогрева и10с измерения;3 повтора с порядком AB/BA/AB. На trajectory progress .05→.87→.05, на переходе .44→.54→.44; солнце следует штатному solarForTravel, clock от10с. Поздняя фиксированная q=.78 не называется самым тяжёлым ракурсом. Одиночные ablation:1,5с motion warmup и6с измерения,3 раунда с обратным порядком и промежуточными контролями. Сеть/CPU без ограничений в render-тестах, ресурсы готовы до старта. Первые shader/texture stalls не включены в warmed throughput и отдельно входят в startup timeline.

Разделение величин:

- rAF — частота входных запросов позы; не число нарисованных кадров.
- Отправки — вызовы штатного render с ограничением очереди2; интервалы отправки p50/p95 и доли превышений характеризуют **cadence admission**, не physical display frame-time.
- Завершения GPU/с — число nonblocking fence, признанных выполненными за окно. `clientWaitSync(...,0,0)`, опрос4мс, без gl.finish/блокирующего ожидания каждого кадра. На границе до2 незавершённых кадров не включены: возможная разница до0,2/с за10с. Несколько fence могут обнаружиться одним опросом, поэтому интервалы обнаружения не используются как display FPS.
- CPU — performance.now вокруг JS render/update. Это не GPU time; driver submission входит в CPU-участок. На wide CPU p50≈8,8→8,5мс при≈29→27,5мс между отправками. Обновления scene.onBeforeRender≈0,5мс являются вложенной частью render, их не надо прибавлять повторно.
- Асинхронный EXT_disjoint_timer_query_webgl2 доступен. Редкие запросы1/30 кадров, чтение только после QUERY_RESULT_AVAILABLE;27 результатов, disjoint при чтении0, elapsed range36,4–93,1мс, медиана70,36мс. Это длительность диапазона GPU-команд с возможным ожиданием/перекрытием, не частота завершений и не exclusive GPU service time. CPU+GPU механически не складываются. [Спецификация расширения](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
- Physical presentation / click-to-photon / реальные пропуски дисплея здесь не измерены. Debug worker telemetry, completion и rAF их не подменяют. Observed scene age — разница последней запрошенной и выполненной clock-позы, на wide p95≈66,7мс до/после, не задержка до глаза.

Калибровка3× на2560: native clean submissions медиана32,07/с, прежний счётчик31,96 (−0,34%), расширенные CPU scopes31,74 (≈−1%), sparse queries31,82. Замерщик не объясняет десятки процентов потерь, но малые эффекты порядка1% отвергались. CPU profiler в throughput-сравнении не включался. Отсутствие long tasks не использовалось как доказательство отсутствия CPU bottleneck. [calibration.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/calibration.json).

Первая длинная серия в одном browser после многих контекстов дала дрейф baseline31→23→16/с. Последние несопоставимые группы отклонены, не приписаны коду/однозначно нагреву. Сохранены как `ablation-initial-unstable.json`. Новые принятые данные — fresh browser + contemporaneous pairs. Старые цифры v591/v641/других сессий с ними не смешиваются.

## Контролируемые эксперименты и диагноз

Для строк ниже viewport2560×900, drawing buffer3840×1350. Медиана трёх прогонов; baseline —12 контрольных вставок. Изображение временно искажалось только в диагностике; ни одно отключение не попало в продукт.

| Изменённый фактор (только диагностика) | Завершений GPU/с, медиана [min–max] | p50 / p95 отправки, мс | >25,2 мс, % |
|---|---|---|---|
| Исходная сцена, 12 промежуточных контролей | 29.75 [29.06–30.38] | 33.5 / 39.8 | 96.6 |
| Нет всей растительности | 49.32 [48.98–49.86] | 20.8 / 24.8 | 4.7 |
| Простой fragment ground | 46.01 [45.49–46.75] | 21.6 / 27.8 | 16.5 |
| Нет теневого пути целиком | 59.84 [59.84–59.85] | 16.7 / 17.6 | 0.0 |
| Нет теней небесных источников | 42.40 [41.94–43.55] | 23.3 / 29.4 | 35.9 |
| Заморожены native shadow maps | 32.23 [31.77–33.23] | 30.8 / 38.7 | 91.2 |
| Нет обновления отражения | 37.07 [36.72–37.19] | 27.1 / 33.6 | 64.3 |
| Нет растительности + теневого пути | 59.84 [59.84–59.84] | 16.7 / 17.5 | 0.3 |
| Нет растительности + отражения | 52.76 [52.70–52.77] | 18.0 / 23.2 | 0.3 |
| Drawing buffer DPR1 вместо1,5 | 34.55 [33.89–34.61] | 28.7 / 37.3 | 76.1 |
| Контекст без MSAA | 34.19 [33.86–34.37] | 28.6 / 34.4 | 87.4 |

Данные: [ablation-fresh.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/ablation-fresh.json).

**Подтверждено:** широкая сцена ограничивается дорогим renderer/GPU/driver-путём растительности, custom lighting/visibility и повторными проходами. Нет всей растительности даёт≈49/с, плоский ground≈46/с, без отражения≈37/с против≈30/с контролей этой серии. Упрощение разрешения или выключение AA помогают слабее, чем удаление lighting/material work: причина не сводится к размеру canvas. CPU-only диагностический пропуск renderer.render оставляет≈2–2,3мс CPU при60 входных/с против≈9,2мс штатного CPU-участка. Это исключает обновление камеры/DOM как единственную основную причину, но не исключает driver/CPU submission.

**Взаимодействия факторов:** no-shadows снимает не только native shadow passes: глобальный define включает авторское sky-horizon/tree visibility. Поэтому его≈60/с нельзя назвать ценой одного PCF. flat-ground позволяет компилятору удалить связанный vertex/varying путь, это не чистое измерение fragment ALU. Frozen native maps не отключает custom atlas/visibility и не устраняет receiver shader, поэтому выигрыш невелик. frozen-lighting на одном sun меняет саму нагрузку, это не чистая цена обновления. Растительность одновременно входит в основной кадр, atlas/shadows и reflection: эффекты no-vegetation/no-reflection/no-shadows не независимы, складывать проценты нельзя. Сочетания показаны отдельно.

Инвентаризация: трава уже instanced, пространственно разделена, имеет LOD/culling; native shadows она не отбрасывает. Листья alphaTest и DoubleSide, opacity-наложение здесь не единственная причина. Солнце/native map4096 desktop/2048 mobile, остальные shadow камеры/касательная карта зафиксированы в config каждого прогона. Нет EffectComposer/fullscreen postprocessing-цепочки и активной physical transmission; есть PMREM/environment, custom water, shadow atlas и дополнительные проходы. Счётчики снимаются за **полный кадр** с info.autoReset=false и одним reset, включая shadows/reflection/atlas/environment. В ablation наблюдалось до≈2347 draw calls/8,46млн submitted triangles за кадр, это не число уникальных видимых треугольников. В итоговом пролёте p50≈1500 calls/7,62млн, максимум≈2112 calls; различия sample counts возможны из-за разных принятых поз, геометрия не уменьшалась.

Дополнительные одиночные гипотезы (исходная exploratory-серия, **не3-run выводы**): выключение только травы/деревьев/native caster; freeze vegetation time; простые vegetation materials; sun/rear shadows; frozen lighting; half-resolution/30Hz reflection; очереди3/4/no-flush. При freeze uniform time ALU остаётся в shader, это не доказательство бесплатной анимации. Эти пробы не стали итоговыми изменениями.

Точные shader-кандидаты проверены3 парными повторами: horizon sample cache −1…−2,4%; receiver selector нестабилен/до−5%; canopy zero guard около0%; pow→sqrt около0…−2%; PCF trig precompute нестабилен/до−3,6%. Они отклонены. Bundled worker устранил один serial import, но startup быстрее не стал. Сжатие adaptive terrain пробовалось только офлайн: первый компактный codec увеличил841КБ→911КБ, второй дал716КБ, однако требует нового декодера/семплера и не проверен на реальном старте — не внедрён. [candidates-shader1.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/candidates-shader1.json), [candidates-shader2.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/candidates-shader2.json).

## Принятые изменения

1. **`lab/c7-scene/static-shadow-receiver.js`, подключён из world.js только Chromium.** Ground и farGrass уже имели receiveShadow=false. Но uniform-флаг оставлял в материале неиспользуемый native receiver-путь. Теперь только этот флаг компилируется как false, авторское sky-horizon/tree visibility сохраняется. Это позволяет компилятору удалить мёртвые ветки/varyings. Material cache key разделяет варианты. Любое живое изменение receiveShadow возвращает исходный uniform-путь; подтверждено переключением true с реальным изменением картинки. Firefox/WebKit сохраняют прежний shader путь. Нет уменьшения качества теней.
2. **`world.js`, `startup-inputs.js`: перекрытие turf CPU с I/O terrain.** `isReady` проверяет реальное завершение входа. Только пока terrain ещё загружается, строится та же turf texture; при ready/cache и в callers без inputs сохраняется исходный порядок. Pending material/textures имеют cleanup при abort; после scene.add владение передаётся сцене. Выигрыш cold4Мбит/с≈69мс; локальный старт в пределах разброса. Прежний unconditional-вариант слегка ухудшал desktop, отклонён в пользу условного.
3. **`world.js`: позднее horizon lighting без скачка.** Было horizonFade=0, затем `(performance.now()-0)/800`: при поздней загрузке освещение включалось одним кадром. Теперь timestamp начала фактический; forced5,5s-late тест даёт0→49 промежуточных кадров,≈813мс вместо0мс. Fade обновляется до обоих проходов и помечает reflection dirty. Все промежуточные кадры с видимой водой обновили отражение; свет на земле/в отражении согласован. Clock0/reduced-motion сохраняют мгновенное фиксированное состояние. Этот fix устраняет pop, не назван приростом steady FPS.

App/preload/worker/fallback и три build/package script указывают runtime-v642. Prewarm affinity обновленаv621→v642: чужой старый worker теперь освобождается, новый загружается из нужного runtime. Проверка с искусственным старым bootstrap на3 ширинах: disposed1/taken0, ровно1 worker runtime-v642.

## Итоговые парные показатели

В каждой ячейке **медиана [min–max] по3 повторам**. Порог25,2мс — бюджет40/с с0,2мс допуском на timer jitter; данные также сохраняют >16,9 и >33,5мс. Это интервалы отправки, не измеренные пропуски физического дисплея.

| Сценарий | Завершений GPU/с, до → после | Интервал отправки p50, мс | p95, мс | Доля >25,2 мс, % |
|---|---|---|---|---|
| 2560, пролёт | 34.44 [34.15–34.46] → 37.20 [36.92–37.21] | 28.8 [28.7–29.1] → 27.5 [27.2–27.5] | 35.4 [35.2–36.1] → 33.6 [33.6–34.0] | 82.4 [80.9–82.8] → 69.8 [68.2–70.6] |
| 1440, переход | 42.51 [42.50–42.51] → 47.10 [47.10–47.11] | 22.8 [22.7–22.9] → 21.1 [21.1–21.2] | 31.7 [31.1–32.5] → 30.4 [30.0–31.7] | 27.4 [25.8–29.3] → 17.3 [17.1–18.2] |
| 390, пролёт | 59.90 [59.89–59.90] → 59.89 [59.89–59.90] | 16.4 [16.3–16.5] → 16.5 [16.5–16.5] | 21.1 [20.7–21.3] → 21.0 [21.0–21.3] | 0.3 [0.2–0.7] → 0.5 [0.3–0.7] |
| 2560, неподвижная поздняя камера q=.78 | 59.45 [58.97–59.57] → 59.86 [59.86–59.86] | 16.6 [16.5–16.6] → 16.6 [16.5–16.6] | 22.2 [22.1–24.2] → 20.1 [20.1–20.8] | 2.2 [0.8–3.7] → 0.0 [0.0–0.0] |

На wide доля >16,9мс остаётся≈99%, значит устойчивый бюджет60/с не достигнут. CPU вокруг render p50 wide8,8→8,5мс, transition7,0→6,7мс; граница CPU/driver/GPU полностью не разделена. Нет оснований обещать×2 или60 FPS. Сравнение выполнено на реальном принятом source candidate до последнего init-only fade fix; в прогретых состояниях fade уже1 и этот участок не исполняется. Финальный shader/helper отдельно повторно проверен из runtime-v642. [final-pairs.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/final-pairs.json).

Дополнительная проверка **финального package/runtime-v642**, после init-fade fix: coarse sweep11 неподвижных поз0…1 с шагом.1,0,7с прогрева+1,5с выборки на позу. Самая тяжёлая среди них q=.6 (≈52/с), затем отдельные3 свежие пары AB/BA/AB по2с прогрева+8с измерения. Это грубый поиск по11 точкам, не доказательство глобального worst case. На q=.6 подтверждено≈9,3% ускорение, CPU p50≈4,3мс в обеих версиях. Этот fixed-view легче активного пролёта, где меняются lighting/camera/reflection.

| Версия | Завершений GPU/с | Отправка p50, мс | p95, мс | >25,2 мс, % |
|---|---|---|---|---|
| baseline | 52.28 [52.13–52.37] | 18.2 [18.1–18.3] | 27.7 [27.7–27.8] | 11.2 [11.0–11.7] |
| candidate | 57.12 [57.12–57.26] | 17.0 [16.7–17.0] | 25.2 [24.7–25.7] | 5.4 [3.9–5.4] |

[fixed-pose-pairs.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/fixed-pose-pairs.json).


## Критический путь загрузки

Обычный HTTP production export, Brotli для JS/HTML/CSS, native compressed transports для binary. CPU1 без throttling, mobile профиль4Мбит/с down/1Мбит/с up/latency100мс; Chrome cache очищен только перед cold, warm reload в том же context. Fresh browser, AB/BA/AB;3 cold+3 warm на вариант/профиль. При load performance нет request interception или route.fulfill. In-page MutationObserver отмечает ready, rAF проверяет actual computed opacity≥.98; прежний Playwright polling timestamp не используется как точное появление.

| Профиль и кеш | Готовность сцены, с: до → после | Canvas opacity≥.98, с: до → после |
|---|---|---|
| 1440, loopback, cold | 2.489 [2.466–2.555] → 2.495 [2.486–2.525] | 2.643 [2.632–2.710] → 2.671 [2.643–2.690] |
| 1440, loopback, warm | 2.413 [2.369–2.413] → 2.412 [2.395–2.418] | 2.569 [2.521–2.580] → 2.568 [2.553–2.583] |
| 390, 4 Мбит/с, RTT-параметр100 мс, cold | 5.282 [5.282–5.350] → 5.213 [5.196–5.295] | 5.440 [5.440–5.514] → 5.374 [5.348–5.458] |
| 390, 4 Мбит/с, RTT-параметр100 мс, warm | 1.870 [1.861–2.003] → 1.861 [1.857–1.866] | 2.038 [2.016–2.160] → 2.019 [2.017–2.022] |

Mobile cold улучшение готовности по парам≈86/55/68мс, медиана≈69мс(1,3%). Desktop cold+5,5мс и warm−1мс — ускорение не доказано; диапазоны перекрываются. Mobile warm−9мс — ниже уверенного эффекта. Готовность3D всё ещё существенно позже LCP текста. LCP mobilecold≈0,43с, desktop≈0,07с; CLS0 во всех24 загрузках. Это lab LCP/CLS, не field INP/TBT и не готовность3D. [loading-current.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/loading-current.json).

Таймлайн baseline390/4Мбит/с cold, relative navigation, инструментированными ordinary-HTTP файлами (одна подробная диагностическая запись, не медиана):

| Этап | Момент, мс |
|---|---:|
| HTML / первый текст | 0 /≈430 |
| worker entry / world request |602 /608 |
| world evaluated, scene start |2736 |
| terrain adapted |4257 |
| turf CPU start→end |4265→4334 |
| trees CPU |4346→4551 |
| grass + GPU-static setup CPU |4551→4874 |
| far-grass complete / texture barrier ready |4901 /4996 |
| first lighting |4996→5031 |
| compileAsync |5031→5122 |
| initTexture enqueue внутри него |5118→5121 |
| first draw CPU/submission |5122→5246 |
| first GPU fence observed complete |5263 |

CPU enqueue initTexture не назван временем физической GPU upload. Worker/world evaluation зависит и от передачи world, и от I/O/compilation; ready-class/first submission не равны завершённому GPU-кадру. В warm того же профиля world starts≈696мс, CPU scene build остаётся, первый GPU observed≈1914мс. Передача и последовательная подготовка сцены остаются существенными. [timeline.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/timeline.json).

Первая фактическая передача mobile≈2,759МБ, desktop≈3,445МБ, warm0B body в данном cache-server. Это считалось сервером, включая worker resources, а не неполным main ResourceTiming. Размер финального пакета22,568МБ включает запасные codecs/варианты/кейс, не initial transfer. Сокращение body≈224байта статистически несущественно; нового большого сжатия ресурсов не заявляется. Самые крупные mobile: terrain841092B, sky522533B, leaves300086B, left-sky270015B, world241744B Brotli, startup118750B. Tree textures/sky уже подготавливаются параллельно, horizon queue следует terrain; preload/world binary запущены до React hydration.4 используемых font preload не удалялись. Неиспользуемых целых Three/R3F дубликатов не обнаружено; R3F отсутствует.

Сборка worker+startup-inputs в один модуль:3 пары, coldmobile5281→5291мс, desktop2569→2651мс — **отклонено**. Устранение цепочки само по себе не результат. Исходный timeline через route.fulfill отключал обычный cache/network path, сохранён как `timeline-injected-diagnostic.json` и исключён из доказательств скорости сети. [loading-trials.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/loading-trials.json) — промежуточные кандидаты; только ready имеет точный observer timestamp, поле visible там означает момент внешней проверки и не используется для вывода о появлении.

## Визуал, поведение, ресурсы и сборка

- Final Chromium:11 фиксированных поз полного solar/camera диапазона×3ширины. Сравнение реального optimized shader с восстановленным штатным uniform-путём: **15/33 exact**, остальные максимум1/255 на канал, максимум10 затронутых pixels на wide. Прототип на исходном v641 дал те же пределы. Это не33/33 exact. WebKit main-thread native renderer v641/v642:22/22 exact. ReadPixels выполнялся только в visual QA, вне FPS измерений.
- Фиксированные полноразмерные screenshot: about/reviews/notice на390/1440/2560. Осмотрены wide и mobile: композиция/вода/растительность сохранены, отзывы центрированы. Бинарные модели/кэши/текстуры не менялись. Полное художественное совпадение с image3 этим performance-проходом не исправлялось.
- UI3 widths: анимации повторно вниз/вверх, плавное завершение, отклик<300мс в проверенных входах; carousel prev/next/wrap/keyboard/focus, no horizontal overflow. Smoke2 widths: notice, mailto+consent, документы, единственный Extra Meat case, никакой передачи заполненной формы на сервер.
- Edges5: autoplay/pause/swipe, reduced-motion, pause-all, noJS и no-IntersectionObserver. Fault6: noWebGL/saveData fallback и2 context loss→restore с одинаковыми пикселями. Ни новых console/GL errors, ни404.
- Actual production полный медленный8с и быстрый2с down/up на3ширинах: finite camera/progress, возврат0, ровно1 актуальный worker, ошибок0. Это behavioral QA с debug, не новый display FPS тест.
- Поворот/resize390↔844 и1440↔390: camera finite, scroll phase.3 сохранена.5 client case/back на каждой из390/1440:0 workers вне сцены/1 внутри, после early departure0. Active worker JS heap≈50,5/52,0МиБ, backingStorage постоянен87240814/158160607B. Main heap4,3→4,95МиБ за5циклов: глобальное отсутствие утечек по5циклам не заявляется. GPU counts не трактуются как байты VRAM, полная driver VRAM не измерена. Исправления WASM/R8 v641 сохранены.
- Реальное скрытие вкладки **NOT_RUN**: headless bringToFront оставил document.visibilityState='visible'. Этот сценарий не объявлен прошедшим. Штатный обработчик остановки видимости сохранён, но native background suspension здесь не доказана.
- Production build PASS,89 source hashes/44 bundled sources/110 package hashes проверены;22567731B. Старый runtime-v641 побайтово сохранён, preexisting tracked diff и HEAD неизменны. Никаких QA hooks/профайлера в пользовательском пакете. Фактически подключён runtime-v642. [verification.json](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/verification.json).

Доказательства: `final-pixels.json`, `webkit-pixels.json`, `local-ui.json`, `local-smoke.json`, `edges.json`, `fault.json`, `final-chrome-lifecycle.json`, `production-motion.json`, `after-horizon-fade.json` в [папке этого прохода](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08).

## Что осталось и следующий приоритет

1. Сохранить exact sky/tree visibility, но уменьшить цену её выборок/варьирующих данных и повторной отрисовки растительности в lighting/reflection. Главный доказанный резерв здесь. Ранее отвергнутые sample-cache/PCF переписывания не повторять без новой причины. Настройка native shadow update сама по себе не даст×2.
2. Снизить стоимость подготовки terrain/grass и передачи841КБ terrain без нового большого decode stall. Офлайн codec ещё не готов к внедрению; проверить индексную упаковку/неиспользуемые вершины с pixel/culling parity и полным slow-start тестом. Текстуры уже компактны; blanket Draco/KTX2 не подходит к процедурной сцене без GLB и R8 данных.
3. Измерить physical iOS/Android/слабый GPU и настоящий Safari, реальную presentation cadence и взаимодействия. **NOT_RUN**, среда недоступна; эмуляция не доказательство мобильного GPU. WebKit не назван Safari.
4. Strict Firefox repeatability остаётся OPEN из v641: baseline-only тоже расходился. Новый Chromium-only shader не включён в Firefox; свежий strict Firefox цикл здесь не выполнялся. Полное image3/G04 и внешняя приёмка не закрыты.
5. Native hidden-tab suspension, field INP, полная GPU memory и длительный thermal soak остаются непроверенными. Работа пользователя создавала фоновую GPU-нагрузку; итоговые значения относятся к этой машине и этим paired conditions.

**G04/G07 REWORK, G08 OPEN, N11/N14 PARTIAL.10/10 не заявляется.** Публикация исключена текущим поручением. Неделю размещения/claim не запрашивал.

## Использованные навыки и инструменты

Повторно прочитаны установленные `threejs-performance`, `threejs-asset-pipeline`, `threejs-debug-profiler` + `references/debug-playbook.md`, `web-perf`. Новых skills/пакетов/основных зависимостей в этом проходе не устанавливал. Использованы существующие Playwright Chrome/WebKit, CDP network/cache/heap, shader instrumentation только в диагностических ответах, asynchronous WebGL queries/fences, renderer.info full-frame counters, production Next/webpack runtime packaging, SHA-256, pmset/sysctl и IOAccelerator read-only. React19.1.1, Next15.5.29, Three0.186.0, GSAP3.15.1; native worker/OffscreenCanvas, R3F нет. React уже используется для UI; замена renderer на R3F сама по себе не ускорит этот shader/GPU путь.

Повторить после подготовки обоих production packages: `node evidence/c7-v642-experiments-2026-11-08/run-final-qa.mjs`, затем sequential final-pixels/webkit-pixels/production-motion. Server3191 — исходный v641,3198 — итоговый v642. Диагностические ablation/candidates не предназначены для публикации. Финальная loading/behavior проверка использует настоящие файлы v642; исторические preparation scripts зависят от сохранённой исходной точки и не должны повторно применяться к изменённому world.js.

## Уточнение достоверности диагностик · 08.11.2026, следующий проход v643

Повтор со сбором console/GLSL-ошибок до navigation обнаружил, что глобальное `shadowMap.enabled=false` может оставлять `c7PlaneShadow` без определений Vogel/noise. В таком режиме часть геометрии не рисуется, хотя renderer.info продолжает считать вызовы. Прежние **noShadows59.84/s не использовать как подтверждённый потолок**. В исправленной диагностике (исключён невалидный helper) результат53.43/s при контрольных≈36.2. Числа разных серий не сравниваются напрямую. Продуктовые before/after v642 имеют отдельные pixel/GL gates; это уточнение их не отменяет.

Один readout64% после закрытия Chrome также недостаточен для утверждения о постоянной внешней GPU-нагрузке. Три новых idle-снимка показывают0%; внешняя нагрузка не используется как доказательство аппаратной невозможности цели. Подробности и сохранённые невалидные опыты: `evidence/c7-v643-deep-performance-2026-11-08/experiment-log.md`.
