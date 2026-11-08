# C7 v646 — план и результат прохода

Локально, без агентов/commit/push/deploy. [Проверенная версия](http://127.0.0.1:3212/c7/), [результат v646](/Users/maxkost/volnami/design/c7-v646-shading-result-2026-11-08.md).

- [x] Сохранить641/645/foreign dirty work; согласовать фиксированные сценарии и проверить метод завершения команд.31,35/41,90не смешиваются, остаточная причина неизвестна.
- [x] ИзучитьgeneratedGLSL, active uniforms, vertex/fragment/frame затраты. Исправить прошлый flat diagnostic, отказаться от неприменимых shader-only долей Амдала.
- [x] Проверитьэквивалентные shader варианты; принять spatial zero-spot materials с исходным opaque sort/live deopt; отклонитьнеподтверждённые shadow/lut/precision/ветер варианты.
- [x] Добавитьточный ограниченный crown field cache; проверитьобратную прокрутку/инвалидацию/свет/отражение.
- [x] Внедритьодноразовую desktop grass preparation с serial fallback/timeout/abort/cleanup; устранить14MiB удержанныхнормалейпослеhydration. Mobile extra Worker выключен.
- [x] Production build/package/84Chrome fixed +14live/WebKit22/Firefoxfunctional, wide3-way AB/BA/AB, native first-scroll, cold/warm/4Mbps,5+5cycles/context/fault/UI; scope reuse2незатронутыхэтаповдоказанпобайтно.
- [x] Package111SHA/90build/48bundle, baselines/HEAD/foreign diff сохранены; ТЗ/матрица/журнал/ADR обновлены.
- [ ] +75–100%,полный4Mbps mobile<4с,physical/native/displayFPS/strictFirefox/полноеimage3/внешняяприёмка. **Не закрыты**, G04/G07REWORK/G08OPEN.

Результатwide33.38→41.40/с (+24.01%), не физическийFPS. Следующийкрупныйкандидат—организацияповторнойterrain/tree visibility вdirectional/reflectionpass; выигрышвнесколькомиллисекундсэквивалентнымPCFещёнедоказан. WASM/WebGPUбезновыхоснованийнепредлагаются.
