# C7 — контрольная точка v645 и оставшаяся цель

Локально, без агентов, окон, коммитов, push и публикации. v641 — неизменяемый эталон.

1. **DONE:** перепроверить v641/v642, сохранить чужую работу, запечатать 41 файл v641. HEAD и tracked patch неизменны.
2. **DONE:** контролируемо проверить растительность, освещение, тени, отражение, PMREM, CPU и разрешение. Исключить GLSL/resize ошибки измерений. Срезы v645 не смешаны со старыми контролями.
3. **DONE:** принять измеренные эквивалентные изменения: ground fusion, восемь water samples, 256 cached PMREM vectors, normal-grid cache, conservative tree occupancy, R32F equivalent depth, lossless leaf transport. Сохранить v643/v644 и проверяемый откат.
4. **DONE:** три пары AB/BA/AB на 390/1440/2560, 360 одинаковых поз, production 24/6с down/up, 24 cold/warm загрузки. 45 direct pixel comparisons max1/255, WebKit22exact; UI/fault/lifecycle/Firefox functional; 13 scripts и 110 SHA. Native hidden и physical не названы PASS.
5. **DONE для проверенных прототипов:** TF/multi-draw/depth-only/NoL/leaf-constant/CPU subtree варианты не дали полезного крупного выигрыша и не подключены. Offline terrain predictor −7,55% одного body пока не принят: browser gain и decoder проверки не выполнены.
6. **OPEN:** +75–100%, wide60/с, <4с на4Мбит/с, physical devices/presentation, strict Firefox и image3 acceptance. Итог wide+21,89%, не75%. rAF60Hz ограничивает первичное подтверждение процента, но uncapped тоже ниже цели; аппаратный предел не установлен. Следующий крупный вариант — иной shader/dataflow совместных view/visibility проходов с новым изолированным прототипом и pixel gate; не повторять отклонённые реализации. Startup отдельно: browser adaptive codec/parallel build с контролем peak memory.

[Результат](c7-v645-performance-result-2026-11-08.md) содержит данные, условия, ограничения и повторение. Предыдущие планы и отчёты — история; критерии ТЗ не снижены.


08.11: последующий shader/Worker проход v646 выполнен; [результат v646](/Users/maxkost/volnami/design/c7-v646-shading-result-2026-11-08.md) и [план646](/Users/maxkost/volnami/design/c7-v646-performance-plan-2026-11-08.md). Цель75–100% остаётся открытой.
