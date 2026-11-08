# C7 v609 — отдельный мобильный профиль

Мобильная версия получает свой набор данных **до** начала загрузки сцены. Desktop сохраняет изображение v608. Это живой тот же мир с полным рельефом, озером,13деревьями, движением камеры и солнечным циклом; мобильная детализация намеренно ниже.

Опубликован [v609](https://ready-laurel-810.harvis.page/c7/), receipt до **01.11.2026 03:33:14 МСК**. Сервер подтвердил82файла; HTTP200 и82/82SHA проверены. Публичный Chromium390/1440/2560:пролёт/возврат PASS. Без перехвата запросов проверены реальные профили:mobile2700280encodedB,desktop5073018B; лишний профиль не загружался. В этих двух одиночных запусках на фактической сети FCP648/520ms, ready3810.4/4785ms. LCP был текстовым P/SPAN, поэтому он не характеризует готовность canvas; это абсолютные наблюдения, не парное сравнение версий.

## Результат и границы вывода

| Новая проверка | Baseline | Candidate | Вывод |
|---|---:|---:|---|
| Cold HTTP Brotli, runtime encoded bytes,390×844 |v608:5040790B|v609:2669015B|−47.05%, почти вдвое меньше данных|
| Та же сеть, готовность лабораторного 3D, среднее двух стартов |6498.10ms|4692.55ms|−27.79%; не мгновенный полный3D|
|48завершённых кадров, M6 ABBA |v607 low:669.52ms|M6:463.88ms|−30.71% времени пакета; не FPS физического телефона|
| Полный сайт, active submitted render/s |v608:60.09/60.17|v609:60.33/60.17|на этом Mac оба упираются примерно в60Hz; видимое ускорение здесь не доказано|
| Desktop raw pixels/shaders,608→609 |23пары|23точны|полный профиль визуально сохранён|

Браузер Chromium153.0.8010.12, ANGLE Metal Apple M3 Pro, device DPR1. Mobile drawing buffer390×844. Сеть100ms/10Mbit/s, настоящий loopback HTTP, Brotli quality6 для текста, новые контексты и отключённый HTTP cache, порядокB/C/C/B. Driver shader cache не очищался. Только крошечный одинаковый HTML harness подставлялся; измеряемые JS/данные передавались сервером. Уровень сжатия CDN может отличаться.

Packet test:24кадра прогрева,3пакета×48кадров на запуск, фиксированная последовательность прямого/обратного travel, solarForTravel, waveTime10, readPixels-барьер на границах. M6 был изолированным кандидатом; финальный v609 на всех8позах390 дал **те же raw pixel hashes**. Full-site test отдельно:5sпрогрева,500msпауза,15sпролёт, worker/3fence cap и фильтр active/suspended;0новых shader compilations во всех4запусках. state.frames не считается завершением GPU или показом кадра.

Для desktop сохранено подтверждённое v608 ускорение запуска:8265.15→6726.30ms в отдельном paired Brotli сравнении сv607. Это не новое измерение v609 и не ускорение desktop кадра.

## Какая работа исчезла

| Узел | Принятое мобильное изменение | Что экономится / риск |
|---|---|---|
| app/c7/landscape.tsx:60; scene/shared-world.ts; render-worker.ts | mobile выбирается до createC7Scene по компактному viewport или coarse/no-hover; debug normal сохраняет полный профиль | Не скачиваются desktop sky fields и текстуры. Профиль фиксируется до размонтирования; поворот экрана не начинает вторую загрузку |
| lab/c7-scene/grass.js:277 | near density9 вместо28 в прежнем low, дальняя простая топология с первого кадра |709243→227547стеблей; меньше подготовки/вершин. Трава заметно менее плотная — разрешённое упрощение |
| far-grass.js:209; world.js:168 | far budget20% |299425→59870стеблей. Дальние планы менее зернистые; силуэты рельефа прежние |
| trees.js:717 | один прежний skeleton, sectionStride3, segmentFactor.75, leafStride2, leafScale1.25; двойные перекрёстные leaf cards остаются | Меньше геометрии во всех проходах: основной, отражение, tree atlas, shadow maps. Нет нового прохода/второго LOD набора. Рисунок листовых групп крупнее |
| world.js:122; sky-light.js; rear-fill.js | sun+3sky shadow maps2048 вместо4096; rear1024 вместо2048 | Меньше заполняемых/хранимых texels. Источники света и направления прежние. Точность теней ниже; физический resident peak не измерен |
| sky-horizon.js; mobile-data/ | sky field256×128, local128×64,17слоёв;2×2усреднение углов и консервативные guards | Четверть texels, gzip2631194→853972B. Возможны локальные отличия мягких теней. Полный terrain и PCF fallback сохранены |
| sky.js; trees.js; c7-bake-mobile-profile.mjs | cloud1024; bark mip tail128; offline leaf mip tail512 с прежней alpha coverage | Удалены высокие мобильные mip levels и runtime leaf coverage build. Нет KTX/WASM decoder. Половина разрешения отражения **не** принята |

Ничего не меняется в DOM/типографике/содержимом, траектории, полном terrain, волнах и режиме непрозрачных секций. DPR мобильной сцены остаётся прежним1, desktop1.5/его прежний low. Главный выигрыш M6 — суммарное уменьшение работы геометрии/теней и отдельный граф мобильных ресурсов. Эффект каждого пункта отдельно не выдаётся за измеренный.

## Данные и приёмка

- scripts/c7-bake-mobile-profile.mjs заново создал7derivatives. Все7SHA совпали с измеренным M6. Retained RGBA bark/leaf tails проверены побайтно; cloud и horizon — явные приближения.
- Mobile manifest содержит входные SHA, SHA генератора, размеры и SHA выходных данных. Packager отвергает устаревшие inputs/повреждённые derivatives. Версионный runtime-v609 отделён от608.
- Изменение far-grass требует нового startup manifest/key. Повторный bake дал прежние422176raw/173272gzipB и побайтно прежний payload. Terrain cache942273B остаётся точным; coarse-grid M2 не используется.
- Production23desktop pixel/shader пары на390(full-profile low)/1440/2560 точны;6/6reverse точны. Mobile8поз390 равныM6, все4width320/390/430/844 прошли обратный возврат и GL checks. Открыты dawn/noon/contact и интегрированный mobile hero.
- Полный локальный сайт390/1440/2560: hero→process→testimonials→contacts→process→hero PASS. Firefox и headless WebKit390/1440: функциональный PASS. Это не строгое междвижковое pixel equality или native Safari.
-6новых lifecycle gates PASS: worker rotation390→844→390; main-thread fallback без Worker; touch/coarse landscape844; отмена во время загрузки с переходом в кейс и возвратом; испорченный mobile gzip с корректным fallback и остановкой worker; context loss/restore с точным raw pixel восстановлением. Ни в одном мобильном сценарии не запрашивались desktop sky/tree/cloud ресурсы. Ошибки при намеренно испорченном файле отмечены как ожидаемые.
- Изолированная C7 сборка/типы PASS.54исходника app/runtime проверены против реального проекта. Остальные концепты export сохранены.
- ZIP82/82entries проверен чтением обратно. SHA256:a228462a1b858ec9eee087719c752656778f36263a46650f96fd9757c1b1279c.
- ZIP11719432B и raw package13340297B включают **оба** профиля, поэтому больше608. Они не описывают мобильную HTTP передачу. Браузер получает только выбранный набор, что проверено запросами.
- Tracked diff неизменен:cca8bbcb1a9932b74371aa1940a9f430f9084327c60546c7448365c541273f4d. Checkpoint609 создан до следующего прохода;607/608пакеты сохранены.331совпадающий PNG в evidence заменён побайтно идентичными APFS clones без удаления изображений.

## Что дальше

Цели≤2.5MB runtime и≤4s сетевой готовности пока не достигнуты: сейчас2.67MB и4.69s в указанной модели. Первый экран/DOM и готовность живого3D — разные события. Нельзя обещать мгновенный полный пейзаж на любом телефоне.

В существующих новых timing данных обнаружено конкретное последовательное ожидание: после получения world.js до вызова фабрики проходит примерно0.78–0.80s; required data fetch начинается лишь примерно через1.08s после import-start. Следующая гипотеза — начать передачу обязательных бинарных inputs **до** исполнения world-модуля, с единым владельцем буферов/отменой, не дублируя HTTP. Это отдельный вопрос следующего прохода, пока не реализован и не измерен. Не повторять неудачные M1 свет, M2 coarse terrain, M4 half reflection, M5 batching или flat-light/radiance идеи без нового основания.

G04/G07 REWORK, G08 OPEN. NOT_RUN: физические iOS/Android, слабый GPU, native Safari, VoiceOver/TalkBack, resident GPU peak, реально показанные кадры на устройстве. FF функциональный PASS не закрывает строгие pixels. На мощном Mac mobile full site уже около60Hz; больший запас GPU не равен измеренному росту экранного FPS.

## Точные новые источники и проверки

Авторские world/grass/far-grass/sky-light/rear-fill/sky-horizon/trees/sky/terrain-cache/worker-entry, vendor/ez-tree/tree.js (generateLODs/createGeometry/skeleton), app/c7/{landscape,scene/shared-world,scene/render-worker}, package/bake/build scripts. Версионные входы зафиксированы в checkpoint-v608/manifest.json, mobile-data/manifest.json, build-inputs-v609.json и portable manifest. Интернет-источники и предшествующие гипотезы перечислены в [плане](c7-architecture-speed-plan-2026-10-31.md); новые первичные ссылки для общего этапа также в [отчёте608](c7-speed-pass-v608-2026-10-31.md).

Evidence: evidence/c7-architecture-speed-2026-10-31/ — m6-{smoke,paired}/results.json, m6-decision.json, v609-data-parity.json, mobile-bake-v609.log, startup-bake-v609.log, v609-desktop-verified/results.json, v609-mobile-visual/results.json, v609-mobile-network{,-decision}.json, v609-mobile-full-site-paired/results.json, v609-local-live/results.json, v609-cross-browser.json, v609-lifecycle.json, v609-integrity.json, archive-v609-verification.json, public-v609/{receipt-public.json,delivery.json,chromium/results.json,resources.json}. Предыдущие600–608тесты используются только с указанной версией, не как новые проверки609.
