# C7 v610 — ранняя загрузка обязательных данных

Опубликован [v610](https://glossy-mesa-120.harvis.page/c7/). Receipt до **01.11.2026 03:54:50 МСК**. HTTP200 и 83/83 SHA доставки проверены. Публичный Chromium390/1440/2560 прошёл живой пролёт и возврат.

## Что изменилось

После получения `world.js` браузер ещё около 0.8 s готовил модуль, и только затем фабрика сцены начинала запросы рельефа и полей неба. v610 начинает семь запросов обычного пути подготовки одновременно с загрузкой/исполнением модуля. Одно тело ответа имеет одного владельца и одного потребителя; повторных скачиваний не добавляется.

Это следующий шаг после v608 (компактный точный terrain transport и один ESM bundle) и v609 (отдельный мобильный профиль). Числа этих проходов нельзя складывать: у каждого свой baseline и условия. Итоговый мобильный профиль сохраняет полный рельеф, озеро, 13 деревьев, живое отражение и солнечный цикл, но уменьшает плотность травы, детализацию деревьев/теней и мобильных полей неба. Desktop сохраняет прежнее изображение. Мобильное упрощение — явное разрешённое изменение качества, а не «бесплатная» оптимизация.

## Механизм и архитектура

| Место | Реальное изменение | Польза и цена |
|---|---|---|
| `lab/c7-scene/startup-inputs.js` | Чистый fetch helper: terrain manifest/gzip/source, startup manifest/gzip, два sky field; профиль выбирается заранее | Убирает ожидание сети после исполнения world. Добавляется один маленький модуль и более раннее хранение сжатых буферов. Пиковая resident память не измерена |
| `lab/c7-scene/worker-entry.js:69` | Создаёт inputs перед dynamic import world; передаёт владение фабрике | Работает в основном OffscreenCanvas пути; ошибка модуля освобождает inputs |
| `app/c7/scene/shared-world.ts:43` | В fallback world и helper импортируются параллельно; ошибка отменяет общий controller | Тот же механизм без Worker. Не создаёт второй мир и не передаёт буферы между потоками |
| `world.js:99`, `terrain-cache.js:77`, `startup-data.js:32`, `sky-horizon.js:79` | Прежние загрузчики забирают готовящиеся тела через take, затем выполняют прежнюю распаковку/проверку | Никаких новых GPU-проходов. SHA/геометрия/fallback остаются. Старый самостоятельный путь для лаборатории сохранён |
| `scripts/c7-package-world.mjs:82` | Сохраняет helper рядом с worker; фиксирует его SHA в package manifest | Версионный `runtime-v610`, старый пакет не перезаписан. Шейдеры/данные не меняются |

Каждый запрос имеет AbortController. Прерывание страницы отменяет незавершённый транспорт; отдельная ошибка необязательного cache не отменяет остальные поля. Завершённое тело удаляется из map после передачи потребителю. Отмена/повторный take/pre-aborted signal проверяются отдельно. Старые кэши не включаются по имени «текущий»: packager проверяет входные и выходные SHA.

Из-за изменения loader-файла `sky-horizon.js` обновлён mobile manifest. Все семь производных payloads побайтно совпали с v609; terrain, startup и полноразмерные sky payloads не пересоздавались. Глобальные настройки/зависимости не менялись.

## Измерения

Прототип I1 против v609, B/C/C/B: mobile 4608.4 → 3717.75 ms (−19.33%); desktop 6655.75 → 5648 ms (−15.14%). Эти числа подтверждают гипотезу. **Финальный v610**, отдельные B/C/C/B:

| Условие | v609 | v610 | Изменение |
|---|---:|---:|---:|
| Mobile readiness, среднее двух стартов | 4628.85 ms | 3731.30 ms | −19.39% |
| Mobile отдельные старты | 4661.4 / 4596.3 ms | 3726.4 / 3736.2 ms | Кандидат быстрее в обоих |
| Desktop readiness, среднее двух стартов | 6644.30 ms | 5629.50 ms | −15.27% |
| Desktop отдельные старты | 6649.9 / 6638.7 ms | 5627.6 / 5631.4 ms | Кандидат быстрее в обоих |
| Mobile encoded runtime bytes | 2 669 015 B | 2 670 210 B | +1195 B |
| Desktop encoded runtime bytes | 5 041 654 B | 5 042 849 B | +1195 B |

Фактические drawing buffers: mobile390×844, desktop2160×1350. В каждом профильном сравнении все20 raw hashes (пять поз × четыре запуска) точны между версиями. Каждый требуемый URL запрошен один раз. SHA final portable world/worker/package/terrain зафиксированы в JSON; baseline и candidate отдельные versioned runtime.

Условия: Chromium 153.0.8010.12, ANGLE Metal Apple M3 Pro, device DPR1. Viewports 390×844 и 1440×900; фактические drawing buffers записаны в JSON. Mobile/desktop сохраняют свои профили v609. Реальный HTTP, Brotli quality6 для текста, latency100 ms, throughput10 Mbit/s, новый browser context, HTTP cache disabled, порядок B/C/C/B. Driver shader cache не очищался. Время от начала dynamic import до готовности сцены и отдельно до первого readPixels-барьера. Перед стартом прогрева нет; после готовности проверяются пять поз при waveTime10. Только одинаковый мини-HTML harness подставлен через route, все измеряемые ресурсы идут настоящим HTTP.

Это лабораторная готовность живого 3D, не LCP, не старт полного сайта и не время на физическом телефоне. Стоимость постоянного кадра от I1 не уменьшается: шейдеры, проходы, геометрия и их потребители прежние. Малые абсолютные различия full-site submitted render/s не считаются FPS-ускорением.

## Сохранение и сборка

Checkpoint v609 создан до изменения. ZIP v609 остаётся с SHA `a228462a1b858ec9eee087719c752656778f36263a46650f96fd9757c1b1279c`. Пользовательский tracked diff SHA неизменен: `cca8bbcb1a9932b74371aa1940a9f430f9084327c60546c7448365c541273f4d`.

Сборка выполнена в отдельном `evidence/.../build-workspace-v610`, с побайтно теми же C7 исходниками и ссылкой на существующие зависимости. Types/build PASS. Это C7-only export; другие концепты не пересобирались. 55 SHA app/runtime совпали с реальным проектом, 27 runtime payloads проверены. Все четыре CSS payload SHA совпали с v609. ZIP прочитан обратно: 83/83 файла, 11 720 205 B, SHA `260834a028f5f7deecf3e6b71f705bf75aac05b3902287358235d5eaba0a916f`.

Полный portable package 13 343 412 B raw и ZIP включают оба профиля и весь маршрут; это не HTTP-вес первого мобильного кадра. Новый helper увеличивает передаваемые байты примерно на 1.2 KB в модели Brotli6. Выигрыш I1 — сокращение последовательного ожидания, а не уменьшение количества данных.

## Приёмка и ограничения

Новые проверки именно v610:

- 23/23 пары raw pixels и shader source hashes точны с v609 на390 mobile /1440 /2560; совпали calls/triangles и счётчики ресурсов. 6/6 обратных возвратов точны. Позиции камеры, solar, travel и waveTime10 зафиксированы. Dawn кадры390 и1440 непосредственно открыты.
- 9/9 lifecycle gates: worker rotation, main fallback, coarse landscape, worker cancel→return, испорченный mobile field, context restore, main cancel→return, ошибка world-модуля в worker и main. В context restore raw pixels точны. Ни один mobile сценарий не запрашивал полный desktop sky/tree набор. Ожидаемые ошибки намеренно повреждённых данных выделены в JSON.
- 5/5 CPU ownership gates с настоящим `lab/c7-scene/startup-inputs.js`: один claim/одна передача, отмена потребителя, отмена родителя до claim, независимая ошибка optional cache, заранее отменённый signal без fetch.
- Полный локальный сайт390/1440/2560: живой пролёт/solar/возврат PASS. Firefox и headless WebKit390/1440: функциональный PASS. Все GPU проверки последовательны, серверы освобождаются в finally.
- Экспортирован только C7; другие концепты root out сохранены. Checkpoint610 содержит97 исходных/сопутствующих файлов с SHA. Коммитов нет.


G04/G07 остаются REWORK, G08 OPEN. Функциональный PASS Firefox не закрывает строгие pixel differences. Headless WebKit не заменяет native Safari.

NOT_RUN: физические iOS/Android, слабый GPU, VoiceOver/TalkBack, resident GPU peak и реальная плавность/показанные кадры на устройстве. Ускорение desktop-кадра с прежним изображением в этом проходе не доказано. «Мгновенный полный 3D на любом устройстве» не достигнут и не обещается.

Дальнейший крупный выигрыш desktop кадра требует отдельного доказанного пути уменьшения работы освещения/растительности. Простая смена языка, WebGPU/WASM, LOD или instancing не является готовым решением: instancing уже есть, старые неудачные варианты перечислены в плане. Ни M1 упрощённый свет, ни M2 грубая terrain-сетка, ни половинное отражение M4 не включены в релиз. M5 слияние grass bins и flat-light upper-bound не дали основания строить новый radiance pipeline.

## Источники и evidence

В этом подэтапе непосредственно прочитаны: исходники world, worker-entry, startup-data, terrain-cache, sky-horizon, startup-inputs, app/c7/scene/shared-world; packager/bundler/build/preview scripts; mobile baker; checkpoint-v609 manifest; результаты v609 и I1. Diff с checkpoint просмотрен вручную. Первичные интернет-источники прочитаны в общем проходе и перечислены в [плане](c7-architecture-speed-plan-2026-10-31.md); сюда не приписывается новое исследование сайтов.

Основные evidence в `evidence/c7-architecture-speed-2026-10-31/`: `i1-hypothesis.json`, `i1-ownership.json`, `i1-{mobile,desktop}-network.json`, `i1-decision.json`, `v610-{mobile,desktop}-network.json`, `v610-integrity.json`, `build-inputs-v610.json`, `build-v610.log`, `archive-v610-verification.json`. Дополнительные завершённые gates: `v610-pixels/results.json`, `v610-lifecycle.json`, `v610-ownership.json`, `v610-local-live/results.json`, `v610-cross-browser.json`, `v610-prepublication-gates.json`, `v610-network-decision.json`. Публичные проверки: `public-v610/{receipt-public.json,delivery.json,chromium/results.json,resources.json}`. Старые тесты не объявляются новыми.

Для контроля сетевых чисел дополнительно прочитана [официальная документация Playwright request.sizes](https://playwright.dev/docs/api/class-request#request-sizes): responseBodySize означает encoded body, отдельно от заголовков. В публичной проверке используются и request sizes, и Resource Timing page/worker; отсутствующие записи не приравниваются к нулевому весу.

## Проверка опубликованного сайта

Два свежих контекста без перехвата/эмуляции сети. На фактической сети этого Mac: mobile FCP512 ms, ready3461.1 ms; desktop FCP428 ms, ready4464.2 ms. LCP был текстом P/SPAN, а не canvas. Это одиночные абсолютные наблюдения, не paired verdict версии и не время телефона.

Resource Timing page+worker: mobile runtime2 701 198 encoded B, все наблюдённые подресурсы2 992 204 B; desktop runtime5 074 139 B, подресурсы6 260 764 B. Навигационный HTML не входит в эту сумму подресурсов. Чужой профиль не скачивался; повторных runtime URL нет. В worker первые gzip-запросы начинались на63.7–64.0 ms при world.js64.2 ms (mobile) и83.7–84.1 при world.js84.2 (desktop): раннее перекрытие работает и в опубликованном реальном worker.

Дополнительный `request.sizes()` оказался несогласован с Resource Timing: например у942273-байтового gzip сообщил943623 B, headersSize0; у worker-entry тело меньше фактического encodedBodySize. Эти значения сохранены отдельно, но **не** используются как точный HTTP encoded total и не смешиваются с проверенными размером файла/Resource Timing. Причина расхождения инструментов не установлена. Нет оснований приписывать её сцене.

Собственные порты3067/3068/3069 свободны после finally. Tracked diff по-прежнему сохранён. Новые диагностические файлы находятся только в evidence; рабочие продуктовые изменения ограничены C7 и его packaging scripts. Продолжение отдельного desktop frame-прохода, если оно выполняется, не входит в доказательства v610.
