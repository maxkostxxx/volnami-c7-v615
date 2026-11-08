# C7 v635 · свет, motion, курсор и документы (07.11.2026)

Статус: **опубликовано** на https://maxkostxxx.github.io/c7/ после финального аудита PASS, коммит `9054c08` (push `f6dadbf..9054c08 main`). Пакет: `artifacts/c7-preview-2026-11-07-v635-legal-final/` (109 файлов, 22 545 910 B). Runtime-v635 подключён в app/c7; runtime-v632 и runtime-v633 не заменялись. Production: index/world.js SHA256 совпали, legal-страницы 200, public is-ready 4059 мс, 0 ошибок.

## Выполнено

1. **Свет v630.** Убраны повышенный meadow IBL и wrap-diffuse. Сохранены receiveShadow=false, far density .25, фильтр bump, уменьшенный шум, target 1280×720, footprint .002 и reflection каждый dirty-кадр. 12 кадров на 390/1440/2560, 0 ошибок.
2. **Плашка «О нас».** Полупрозрачный фон rgba(248,238,229,.80), blur(10px) и fallback без blur. Текст непрозрачный; расчётный контраст 8.37:1, overflow 0.
3. **Reveal.** Плашка 22px→0 за 640ms, текст 5px→0 за 480ms с задержкой 80ms, wave-маска снизу вверх. Повтор только после полного выхода секции. Фоновая волна ±1px/10s, текст не двигается. Reduced motion и прямой #about сразу показывают конечную позу.
4. **Wave-курсор.** Дуга с двумя волнами, damping через rAF, ripple 360ms, наклон при скролле ≤8°. Нет React-перерендеров и DOM-записей после остановки. Touch и reduced motion отключены, системный курсор сохранён.
5. **Документы.** `/policy` (139 строк), `/agreement` (13), `/cookie` (28) — точное совпадение с исходниками. Cookie-баннер не добавлен, потому что аналитики и рекламы нет.
6. **Форма.** Обязательный чекбокс выключен по умолчанию. Без согласия mailto не создаётся; сообщение и фокус доступны. После согласия формируется mailto на `v.volnami@yandex.ru`.
7. **Initial hero reduced-motion.** Исправлено: начальный hero теперь совпадает с settled-кадром после возврата, отражение отрисовывается при готовности без rAF.

## Финальный аудит

На 390×844, 1440×900, 2560×1440, reduced motion:

- initial hero == reverse hero **побайтово**, `reflectionRendered=true`;
- about/process/testimonials/final тоже совпали побайтово;
- exactProgress=1, smoothProgress=1;
- **0 console errors, 0 page errors, 0 HTTP 404, 0 failed requests**;
- worker ready и main-thread ready прошли;
- legal-страницы отвечают 200, мобильная читаемость без overflow;
- форма блокирует отправку без согласия, после согласия правильный mailto;
- курсор отключается на touch и reduced motion.

Доказательства: `evidence/c7-v635-headless/`, `artifacts/c7-preview-2026-11-07-v635-motion-qa/`, `evidence/c7-wave-cursor-v635-2026-11-07/`, `evidence/c7-v635-legal-2026-11-07/`, `evidence/c7-v635-reduced-motion-2026-11-07/after/`, `/tmp/volnami-c7-v635-legal-final-audit/report.json`.

## Ограничения

- PASS относится к запрошенному объёму и headless Chromium/Metal. Физические iOS/Android, native Safari и VoiceOver/TalkBack этим проходом не проверены.
- Устаревший `scripts/c7-reverse-qa.mjs` дважды завис на screenshot timeout и на неизменённом baseline; это pre-existing harness issue, не дефект пакета. Эквивалентная Metal-проверка пройдена.
- Публикация и коммит не выполнялись по заданию; для выпуска нужен отдельный deploy `artifacts/c7-preview-2026-11-07-v635-legal-final`.
