# C7 v642 — контролируемая оптимизация

Без агентов/видимых окон/commit/push/publish. База runtime-v641, изменения v641 сохраняются.

1. [x] Источник/runtime проверены, четыре skills перечитаны, backup сделан. Калибровка счётчиков: старый overhead≈0,34%, расширенный≈1%; rAF/submission/completion/display разделены.
2. [x] Fresh-browser ablation: 3 повтора на10 факторов/сочетаний и12 baseline controls. Дрейф первой серии исключён. Поиск11 неподвижных поз выделил q=.6, затем3 финальные пары. Отражения/освещение/растительность — главные измеренные расходы; отключения не выпущены.
3. [x] Ordinary-HTTP timeline и24 финальные cold/warm загрузки,3 повтора/вариант/профиль. 4Мбит/с ready5,283→5,213с; desktop без существенного изменения. Route.fulfill timeline исключён из сетевых доказательств.
4. [x] Приняты static false receiver shader (Chromium, с возвратом uniform при редактировании), условное перекрытие turf с terrain I/O и корректный поздний fade/обновление отражения. Остальные shader/worker-bundle пробы без пользы отклонены.
5. [x] 24 чередующихся motion сравнения: wide34,44→37,20 GPU-completed/s, transition42,51→47,10. Final-package fixed q=.6:52,28→57,12. 33 Chromium visual pairs max1/255, WebKit22 exact; UI/edges/fault/resize/5+5case-back/slow-fast down-up/stale bootstrap PASS. Native hidden/physical NOT_RUN.
6. [x] Production build,89 source/44 bundled/110 package SHA, reversible patch, сохранность HEAD/tracked diff, отчёт/ТЗ/матрица/журнал обновлены. Пакет v642 локальный, публичная v640 прежняя; commit/push/publish не выполнялись.

Проверенный результат: [отчёт](/Users/maxkost/volnami/design/c7-v642-performance-result-2026-11-08.md), [доказательства](/Users/maxkost/volnami/evidence/c7-v642-experiments-2026-11-08/summary.json), [локальный просмотр](http://127.0.0.1:3198/c7/).

Открытый приоритет: сохранить точное sky/tree visibility с меньшей стоимостью shader/повторных проходов; уменьшить передачу/подготовку terrain без decode-регрессии; физические устройства/native Safari/presentation cadence. Wide40–60/×2, slow-network<4с, strict Firefox, полное image3 и внешняя приёмка остаются открытыми. **G04/G07 REWORK, G08 OPEN;10/10 не объявляется.**
