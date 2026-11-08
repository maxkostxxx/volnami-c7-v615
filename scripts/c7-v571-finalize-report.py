from pathlib import Path
import json,csv,hashlib,datetime,collections,re
root=Path('.')
def read(p):return json.loads(Path(p).read_text())
public=read('evidence/c7-v571-public/results.json');assert len(public)==3 and all(r['code']==0 for r in public)
delivery=read('evidence/c7-v571-public-delivery/results.json');assert delivery['pass'] and len(delivery['checks'])==105
checks=read('evidence/c7-v571-verification-rerun/results.json');assert len(checks)==7 and all(r['code']==0 for r in checks)
suites=read('evidence/c7-v570-final-checks/results.json');assert len(suites['runs'])==8 and all(r['code']==0 for r in suites['runs'])
contrast=read('evidence/c7-v571-contrast-summary.json');assert contrast['violations']==0
backup=read('backups/c7-v561-start-2026-10-28/manifest.json');assert all(hashlib.sha256(Path(r['backup']).read_bytes()).hexdigest()==r['sha256'] for r in backup)
build=read('out/c7-build.json');assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in build['sources'].items())
receipt=read('/Users/maxkost/.config/volnami-c7-preview/harvis-v571.json')
perf=read('evidence/c7-v571-performance/results.json');prior=read('evidence/c7-v571-prior-performance/results.json')
codec=read('evidence/c7-v571-codec-browsers-rerun/results.json');browsers={e:read(f'evidence/c7-v571-public/{e}/results.json') for e in ['chromium','firefox','webkit']}
for e,data in browsers.items():assert data['pass']
now=datetime.datetime.now(datetime.timezone.utc);msk=now.astimezone(datetime.timezone(datetime.timedelta(hours=3)))
status={'version':'v571','at':now.isoformat(),'url':'https://breezy-hazel-428.harvis.page/c7/','expiresAt':receipt['expiresAt'],'tenOfTen':False,'agentUse':False,'visibleWindowsOpened':False,'commits':False,'binaryData':{'oldBytes':17289129,'newBytes':9284189,'savedBytes':8004940,'lossless':True},'publicFilesExact':105,'protectedFilesExact':150,'backupFilesExact':len(backup),'v570FunctionalSuites':8,'v571TargetedChecks':checks,'contrast':contrast,'performance':perf['runs'],'priorPerformance':prior['runs'],'G04':'REWORK — visible shape/lighting/crown differences and external art acceptance','G07':'REWORK — FPS/transfer budgets; physical devices and native accessibility unverified','G08':'OPEN — one week not guaranteed; claim deferred by user','report':'design/c7-remaining-audit-v571-2026-10-29.md'}
Path('evidence/c7-v571-completion-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
rows=[]
for width in [390,1440,2560]:
 vals={r['mode']:r for r in perf['runs'] if r['width']==width};old=next(r for r in prior['runs'] if r['width']==width and r['mode']=='whole-page-scroll')
 rows.append(f"| {width} | {vals['hero-idle']['actualRenderedFPS']:.2f} | {vals['process-idle']['actualRenderedFPS']:.2f} | {vals['whole-page-scroll']['activeRenderedFPS']:.2f} | {old['activeRenderedFPS']:.2f} |")
net=[r['delivery'] for r in browsers['chromium']['runs']]
report=f'''# C7 — итог ограниченного по времени прохода, v571

**Обновлено:** https://breezy-hazel-428.harvis.page/c7/ . Все 105 файлов по HTTPS совпали с проверенным пакетом. Семь публичных функциональных сценариев Chromium/Firefox/WebKit прошли. Preview действует до **30 октября 2026, 00:35:48 МСК**; гарантированной недели нет.

Работа: 28.10 с23:46 до29.10 {msk:%H:%M} МСК, в пределах часа. Без агентов, видимых окон и коммитов. **10/10 не достигнуто:** остаются видимые отличия от референса и недостаточный FPS. Физические телефоны, native Safari и экранные дикторы не проверены.

## Что изменилось

Сжатие числовых данных света и рельефа уменьшило передачу на **8 004 940 байт, или46,30%**, без потери данных. Значения RGBA16F и Float32 position/normal/aShore, а также индексы восстанавливаются с исходными SHA. Геометрия, число травинок, разрешение теней и кадра сохранены.

| Данные | До, байт | После, байт |
| --- | ---: | ---: |
| Основное поле света | 8 694 201 | 3 587 551 |
| Левое поле света | 3 151 436 | 1 485 367 |
| Кэш рельефа | 5 443 492 | 4 211 271 |
| Всего числовые данные | 17 289 129 | 9 284 189 |

Эта сумма **не равна всей загрузке сайта**. Свежий Resource Timing публичной страницы: около16,43МБ запросов runtime и16,90–17,99МБ всех наблюдавшихся ресурсов к моменту проверки готовности. Это не полная атрибуция критического пути. Сетевые ориентиры ТЗ3–6МБ mobile /5–10МБ desktop не закрыты. Прежнее приблизительное «17МБ» не использовано как сопоставимая полная сетевая база.

Decoder проверяет формат, размеры и SHA, поддерживает прежний формат и отдаёт управление между блоками поля. У рельефа сохранены проверки SHA всех атрибутов и резервная генерация. Обновлены builders и идемпотентная перепаковка полей.

Для света уменьшен широкий мягкий блеск земли: sheen .15→.05. Низкие источники на рассвете и закате ниже на2°; к полудню угловая поправка исчезает. Изменение материала действует весь цикл. Угловой радиус источника3° сохранён: проба1,5° дала грубые пятна и отклонена. Просмотрены исходный image3, первый кадр, день, закат, три контактных листа прохода и опубликованные кадры. Профиль склонов, распределение света и рисунок крон ещё отличаются от референса.

## Производительность

Headless Chromium на текущем Mac, эмуляция размеров, по2с прогрева и10с измерения режима. Активный пролёт исключает штатную остановку 3D за непрозрачным контентом. Это не физические телефоны.

| Ширина | Hero FPS | Process FPS | Активный пролёт v571 | Позднейший контроль v559 |
| --- | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

**Рост FPS не подтверждён; бюджет40–60FPS не пройден.** Последовательные полные замеры не являются чередованием A/B/A. В отдельном тесте старого/нового света на одном экземпляре мира результаты12,00/11,66/12,62/12,03FPS: устойчивого различия нет. Снижение сетевого объёма не выдаётся за ускорение отрисовки.

Отклонены constant specialization, PBR guard, кеш повторных запросов поля и предварительная интерполяция Float32: подтверждённого выигрыша нет. Диагностические плоские материалы в сайт не вошли. Первая GLSL-ошибка теста кеша сохранена; исправленный отдельный запуск точен по пикселям, но не быстрее.

## Проверки

- v570 прошла8/8 наборов UI, accessibility, fault, content, state, suspension, navigation, interactions. Контент — восемь размеров320…2560. После изменения только транспорта рельефа v571 отдельно прошла проверки трёх движков, задержки/отказа/abort кэша, fault и lifecycle, а также движение и контраст. Разным исходникам не приписан один общий запуск.
- Все поля света и четыре массива рельефа точны в Chromium/Firefox/WebKit. Ошибок WebGL и шейдеров нет. Restore возвращает точный кадр; double dispose освобождает геометрию и контекст; abort корректен.
- Строгий reverse-hash: Chromium4/4, WebKit4/4, Firefox3/4. **Общего побитного PASS Firefox нет.** Величина его расхождения в этой версии отдельно не измерялась; старые допуски ему не приписаны.
- Контраст:275 видимых текстовых проб в36 непустых состояниях, нарушений0. Минимум3,90:1 для крупного и5,54:1 для обычного текста. Восемь пустых состояний исключены из доказательств.
- Три прохода вниз/вверх на390/1440/2560 вернули камеру в начало; координаты конечны, pageerror нет. Просмотрено по6 кадров каждого видео. Это не проверка каждого кадра и не доказательство плавности.
- Публичные сценарии: Chromium390/1440/2560; Firefox и WebKit390/1440. WebGL, солнечный цикл, возврат, Extra Meat с пятью изображениями, консоль/HTTP/переполнение прошли. WebKit не назван native Safari.
- 150 защищённых файлов и24 резервных копии совпадают по SHA. Все текущие source SHA, export и105 файлов ZIP проверены. Использован успешный Next exportv548 с проверкой неизменных файлов; новая компиляция Next не заявлена.

## Выпуск, ограничения и дальнейший план

Пакет105 файлов:35 142 013→27 139 007байт. ZIP31 627 680→23 673 582байт; SHA256 `0485b77de4809d034b276456486196a66e6b54b3a37351f938d1317f5cc46dd0`. Публикация HTTP200/updated:true;105/105 публичных SHA точны. Локально: http://127.0.0.1:3007/c7/ . Временный сервер прежней версии3047 остановлен.

Первую попытку ZIP/проверки прервал ENOSPC; она не принята. Повторные доказательства сохранены отдельно. Очищены ранее разрешённый Code Cache Chrome, собственный неполный ZIP и скачанный update-cache внутри `Library/Caches/com.openai.codex/org.sparkle-project.Sparkle/Installation`. Установленное приложение, Launcher, чаты и проект сохранены; обновление при необходимости скачивается заново.

Матрица149 требований сохраняет открытые статусы. Следующая локальная работа — стоимость отрисовки и реальные отличия рельефа/света от image3. Затем остаются физические iOS/Android, слабыйGPU, native Safari, VoiceOver/TalkBack и внешняя художественная приёмка. Гарантированная неделя размещения требует отложенного пользователем закрепления. Один Extra Meat и ручная отправка подготовленного письма остаются согласованным объёмом; письма при QA не отправлялись.

Этот ограниченный по времени проход закончен. После его завершения новые тесты и исследования не запускаются; дальнейшая работа в фоне не обещается.

Доказательства: `evidence/c7-v571-completion-status.json`, `c7-v571-verification-rerun/`, `c7-v571-public/`, `c7-v571-public-delivery/`, `c7-v571-performance/`, `c7-v571-prior-performance/`, `c7-v571-light-pairs/`, `c7-v571-contrast-summary.json`, `c7-v571-motion/`, `c7-v571-preservation/`; план — `design/c7-render-cost-and-reference-2026-10-28.md`.
'''
# Keep typography readable in the new handoff; historical documents remain untouched below their status block.
report=re.sub(r'(?<=[А-Яа-я%])(?=\d)', ' ',report)
report=re.sub(r'(?<=\d)(?=[А-Яа-я])', ' ',report)
Path(status['report']).write_text(report)
block=f'''<!-- v571-status-start -->
> **Опубликована v571 · 29.10.2026, {msk:%H:%M} МСК.** https://breezy-hazel-428.harvis.page/c7/ . Данные рельефа/света17,29→9,28МБ без потерь; мягкий блеск земли и низкий свет уточнены. 105 публичных SHA точны, семь публичных функциональных сценариев прошли. 275 видимых проб контраста без нарушений; три прохода проверены. **G04/G07 остаются REWORK: буквальное1:1 и FPS40–60 не достигнуты; физические устройства/nativeSafari/дикторы не проверены.** Firefox strict reverse3/4, не общий byte-exact PASS. Preview до30.10.2026 00:35:48МСК, неделя не закреплена. Рабочий проход уложен в час, без агентов/окон/коммитов. Отчёт: `design/c7-remaining-audit-v571-2026-10-29.md`. Ниже сохранена история.
<!-- v571-status-end -->'''
block=re.sub(r'(?<=[А-Яа-я%])(?=\d)', ' ',block);block=re.sub(r'(?<=\d)(?=[А-Яа-я])',' ',block)
for f in ['design/c7-master-tz-2026-10-25.md','design/c7-finish-plan-2026-10-26.md','design/c7-completion-tz-2026-10-23-r2.md','design/c7-local-handoff-2026-10-26.md','design/c7-current-world-passport-2026-10-26.md']:
 p=Path(f);s=p.read_text();s=re.sub(r'<!-- v571-status-start -->[\s\S]*?<!-- v571-status-end -->',lambda _:block,s);s=s.replace('> **Текущая версия — v559','> **История — v559',1);p.write_text(s)
p=Path('design/c7-working-matrix-2026-10-26.csv')
with p.open(encoding='utf-8-sig',newline='') as f:reader=csv.DictReader(f);headers=reader.fieldnames;matrix=list(reader)
texts={
 'W07':'v571: мягкий блеск земли уменьшен, низкий свет рассвета/заката ниже на2°. Просмотрены image3 и актуальные кадры; видимые отличия профиля склонов/света/крон остаются. Буквальное1:1 не принято.',
 'N05':'v571: просмотрены390/1440/2560, три прохода и публичные кадры. Сцена сохраняет цельность в выборке; G04 и FPS не закрыты.',
 'G04':'v571: локальная доводка света, сохранена геометрия. Видимые отличия рельефа, распределения света и крон от image3 остаются; внешняя приёмка не получена.',
 'Q09':'v571: lossless числовые данные17 289 129→9 284 189байт. Публичный runtime около16,43МБ ResourceTiming; это не закрывает сетевой бюджет. Cache delay/failure/abort, fault и105HTTPS SHA прошли.',
 'G02':'v571: поля света и четыре массива рельефа точны в трёх движках; SHA/формат проверяются до использования. Cache delay/failure/abort, fault/lifecycle и105HTTPS SHA прошли. Сетевой бюджет и реальные устройства остаются открыты.',
 'G07':'v571: целевые40–60FPS не достигнуты. Активный пролёт Chromium390/1440/2560:31,05/13,38/11,17FPS. Поздний контрольv559:32,39/14,57/11,85; отдельные пары света не показывают устойчивого различия. FPS-выигрыш не заявлен. Физические устройства/nativeSafari/дикторы NOT_RUN. Firefox reverse3/4, строгий общий hash PASS отсутствует.',
 'Q02':'v571: три down/up проходят технически, камера возвращается, координаты конечны; просмотрено по6кадров. Бюджет FPS не достигнут. Полный state/hash/fast suite v570 проходит; после lossless транспортаv571 поля/геометрия точны.',
 'G08':'v571 опубликована по прежнему адресу;105HTTPS SHA и7публичных функциональных сценариев прошли. Preview до30.10.2026 00:35:48МСК. Гарантированная неделя и внешняя приёмка открыты; закрепление пользователь отложил.'}
for r in matrix:
 if r['id'] in texts:r['actual']=texts[r['id']];r['evidence']=status['report']+'; evidence/c7-v571-completion-status.json'
with p.open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=headers);w.writeheader();w.writerows(matrix)
assert len(matrix)==149
counts=dict(collections.Counter(r['status'] for r in matrix));status['matrixCounts']=counts;Path('evidence/c7-v571-completion-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
with Path('design/c7-execution-journal-2026-10-23-r2.md').open('a') as f:f.write(f'''\n\n### EXEC109 — завершение v571, {msk:%H:%M} МСК\n\nОпубликована v571:105 HTTPS SHA точны,7 публичных функциональных сценариев проходят. ZIP23 673 582байта, SHA0485b77de4809d034b276456486196a66e6b54b3a37351f938d1317f5cc46dd0. Данные рельефа/света17,29→9,28МБ lossless; полный опубликованный runtime около16,43МБ по Resource Timing.\n\nv5708/8полных suites; после byteplanes транспортаv571 —3движка exact-data,cache/fault/lifecycle,275visible contrast/36nonempty/0violations,3motion. Firefox reverse3/4:strictFAIL не скрыт. Actual active FPS31,05/13,38/11,17, контрольv55932,39/14,57/11,85; отдельные пары света≈12FPS, устойчивой разницы нет. G04/G07/G08 открыты,10/10 не присвоено. Телефоны/nativeSafari/дикторыNOT_RUN.\n\nПервый QA/ZIP прервал ENOSPC; доказательства не приняты, повторный каталог отдельный. Разрешённые Chrome/update caches очищены; установленное приложение и проект сохранены.24backupSHA и150protectedSHA точны. ТЗ/план/паспорт/149строчнаяматрица обновлены. Работа закончена в пределах часа; новые проверки после завершения не запускаются. Отчёт:{status['report']}.\n''')
with Path('design/c7-render-cost-and-reference-2026-10-28.md').open('a') as f:f.write(f'\n\n## Итог {msk:%H:%M} МСК\n\nДиагностика завершена; переносимые оптимизации fragment не найдены. Lossless-сжатие и мягкий свет внедрены, проверены и опубликованы какv571. Public105SHA/7scenarios PASS;275visible contrast без нарушений,3motion технически PASS. Часовой проход закончен; G04/G07/G08 остаются открыты. Полные результаты:{status["report"]}.\n')
print({'version':'v571','publicPass':True,'sources':len(build['sources']),'backupFiles':len(backup),'matrix':counts,'finishedMoscow':msk.isoformat(),'tenOfTen':False})
