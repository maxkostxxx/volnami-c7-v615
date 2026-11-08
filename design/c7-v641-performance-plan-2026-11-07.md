# C7 v641 — измерить, исправить и проверить локально

Публикация и Git push запрещены текущим поручением; без субагентов и видимых окон. База — production export v640. Копия изменяемых исходников и tracked patch: backups/c7-v641-start-2026-11-07. Не менять художественные параметры/разрешение/частоту/тайминг ради цифр.

1. [x] Навыки: сохранить существующий threejs-performance r186; установить отдельно asset-pipeline, web-perf, debug-profiler и прочитать playbook. Стек React19.1.1 / Next15.5.29 / Three0.186 / WebGL2 / worker; R3F отсутствует.
2. [x] Воспроизводимая база: production HTTP с compression/cache; 390/1440/2560, DPR1, desktop/эмуляция touch, cold/warm/ограниченная сеть/CPU. LCP/FCP/CLS, long tasks/events, отдельно ready 3D; сохранить HTTP bytes/waterfall, screenshots и environment.
3. [x] Full-cycle: slow/fast/reverse, тяжёлые позы, counters всех проходов, CPU/worker profile, fence p50/p95/p99 (не presentation FPS), memory/resource bytes/counts, lifecycle/hidden/reopen/resize/orientation. Проверить пригодность инструментов; не повторять отвергнутый Metal timer query без новой причины.
4. [x] Приоритизировать подтверждённые проблемы. Одно значимое изменение — контрольная пара/повтор; выгодные изменения сохранять, отрицательные откатывать. Для ресурсов только подходящие к фактическим форматам преобразования с исходниками и pixel-check.
5. [x] Обновить реально используемый runtime после принятия изменений, собрать export и локальный пакет. Повторить базовые сценарии/несколько прогонов, функциональные проверки/скриншоты. Debug-перехваты остаются в QA, не в пользовательской версии.
6. [x] Отчёт: причины/файлы/до-после с медианой и разбросом/пределы/NOT_RUN/установленные инструменты. Не объявлять10/10 и не публиковать.

Предыдущие эксперименты и отказы прочитаны: c7-performance-audit-2x-2026-10-29, remaining-audit-v591, v625/v637/v640 result. Важное ограничение: раньше на батарее blank Chrome был30Hz; после смены питания перепроверить и не смешивать результаты.


Финальный checkpoint ·08.11:18 loading+18 flight до и столько же после,3парных late-WASM ownership,33Chromium+22WebKit exact pixels;Firefox19/22strict и baseline-only controls — OPEN. Сборка/89source hashes/43bundled sources/110package SHA PASS;temporary QA hooks отсутствуют в продукте.20Next-навигаций до/после,Chrome/WebKit resize/reopen,UI3/smoke2/edges5/fault6/horizon10 PASS. Реальный hidden вheadless NOT_RUN;synthetic handler отдельно PASS. Три новых skill и2браузера установлены;основные зависимости прежние.

Приняты только3 scene source изменения:release позднего декодера,2single-channel texture formats. Renderer DPR/geometry/lighting/camera/тайминг UI сохранены. Interleaved B/C/C/B1440≈34.18→34.41 (+0.7%), существенного прироста нет. Sequential desktop after местами ниже; цифры и разброс сохранены, не скрыты.

Открытые продуктовые ограничения:40–60wide,slow-network <4s,strictFirefox,image3 art acceptance,physical/nativeSafari/readers,реальное hidden/энергия/fieldINP/полныйVRAM. Эти пункты не закрыты завершением аудита. Итог: [отчёт](/Users/maxkost/volnami/design/c7-v641-performance-result-2026-11-07.md).Публичнаяv640 не обновлялась;commit/push/publish не выполнялись.
