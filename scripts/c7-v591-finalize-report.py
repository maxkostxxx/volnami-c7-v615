from pathlib import Path
import json,csv,hashlib,datetime,collections,re

def read(p): return json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
public=read('evidence/c7-v591-public/results.json')
assert len(public)==4 and all(r['code']==0 for r in public)
delivery=read('evidence/c7-v591-public-delivery/results.json')
assert delivery['pass'] and len(delivery['checks'])==105
checks=read('evidence/c7-v591-verification/results.json')
assert len(checks)==7 and all(r['code']==0 for r in checks)
suites=read('evidence/c7-v591-final-checks/results.json')
assert len(suites['runs'])==4 and all(r['code']==0 for r in suites['runs'])
protected=read('evidence/c7-v591-preservation/results.json')
assert protected['checked']==150 and not protected['failed']
backup=read('backups/c7-v572-start-2026-10-29/manifest.json')
assert all(sha(Path('backups/c7-v572-start-2026-10-29')/r['path'])==r['sha256'] for r in backup)
build=read('out/c7-build.json')
assert all(sha(p)==h for p,h in build['sources'].items())
pkg=read('evidence/c7-v591-package.json')
assert pkg['allEntryHashesExact'] and sha('artifacts/c7-preview-2026-10-29-v591.zip')==pkg['archiveSHA256']
receipt=read('/Users/maxkost/.config/volnami-c7-preview/harvis-v591.json')
perf=read('evidence/c7-v591-performance/results.json')
browsers={e:read(f'evidence/c7-v591-public/{e}/results.json') for e in ['chromium','firefox','webkit']}
assert all(d['pass'] for d in browsers.values())
depth={e:read(p) for e,p in [('chromium','evidence/c7-v591-depth-chromium/results.json'),('webkit','evidence/c7-v590-depth-webkit/results.json'),('firefox','evidence/c7-v591-depth-firefox/results.json')]}
assert all(d['sourceSHA']==sha('lab/c7-scene/world.js') and not d['errors'] for d in depth.values())
assert all(r['diff']==0 and not r['glError'] for e in ['chromium','webkit'] for r in depth[e]['rows'])
assert all(not r['glError'] for r in depth['firefox']['rows'])
assert all(not r['coverage']['supported'] for r in depth['firefox']['rows'] if r['kind']=='baseline-candidate')
now=datetime.datetime.now(datetime.timezone.utc)
msk=now.astimezone(datetime.timezone(datetime.timedelta(hours=3)))
expiry=datetime.datetime.fromisoformat(receipt['expiresAt'].replace('Z','+00:00')).astimezone(datetime.timezone(datetime.timedelta(hours=3)))
report_path='design/c7-remaining-audit-v591-2026-10-29.md'
status={'version':'v591','at':now.isoformat(),'url':'https://breezy-hazel-428.harvis.page/c7/','expiresAt':receipt['expiresAt'],'tenOfTen':False,'agentUse':False,'visibleWindowsOpened':False,'commits':False,'publicFilesExact':105,'protectedFilesExact':150,'backupFilesExact':len(backup),'currentTargetedSuites':4,'unchangedUIBaseline':'v570: 8/8; not rerun as v591','verification':checks,'performance':perf['runs'],'pairedGainPercent':{'390':4.65,'1440':5.81,'2560':4.47},'depthPixels':{e:{'pairs':len(d['rows']),'exact':sum(r['diff']==0 for r in d['rows']),'maxDifferingChannels':max(r['diff'] for r in d['rows']),'maxChannelDifference':max(r['max'] for r in d['rows'])} for e,d in depth.items()},'G04':'REWORK — reference shapes, lighting and crowns differ','G07':'REWORK — FPS/transfer budgets and physical/native acceptance','G08':'OPEN — one week not guaranteed; owner claim deferred','report':report_path}
rows=[]
for width in [390,1440,2560]:
 vals={r['mode']:r for r in perf['runs'] if r['width']==width}
 rows.append(f"| {width} | {vals['hero-idle']['actualRenderedFPS']:.2f} | {vals['process-idle']['actualRenderedFPS']:.2f} | {vals['whole-page-scroll']['activeRenderedFPS']:.2f} |")
net=[r['delivery'] for r in browsers['chromium']['runs']]
world_mb=[r['worldBytes']/1e6 for r in net]
report=f'''# C7 — проверенное ускорение и выпуск v591

**Сайт обновлён:** https://breezy-hazel-428.harvis.page/c7/ . Все 105 публичных файлов совпадают с проверенным пакетом. Семь сценариев Chromium/Firefox/WebKit прошли. Срок preview по receipt — **{expiry:%d.%m.%Y %H:%M:%S} МСК**, гарантированной недели нет.

Работа 29.10.2026 с 01:01 до {msk:%H:%M} МСК, без агентов, видимых окон и коммитов. **10/10 не достигнуто.** Этот выпуск даёт умеренное ускорение отрисовки; точное художественное совпадение и целевые 40–60 FPS остаются открытыми.

## Принято в код

В `lab/c7-scene/world.js` добавлен проход глубины для 13 крон и крупных render targets рельефа. Он отсекает скрытые фрагменты до дорогого расчёта света. Геометрия и alpha-маски общие с исходными объектами; новые текстуры не добавлены. Прокси следуют родительской видимости и локальным матрицам, удаляются при dispose до освобождения общих ресурсов.

Рельеф использует проход только при размере render target от 1,5 млн пикселей: меньший размер не показал выигрыша. Разрешение кадра, теней, отражения, плотность травы и художественные параметры сохранены. На Firefox оптимизация отключена: дополнительный проход менял края даже после попытки invariant/same-vertex. Firefox сохраняет исходный путь отрисовки; ускорение ему не приписывается.

## Измерения

В одинаковом мире при чередовании baseline/candidate/candidate/baseline: 390 low **+4,65%**, 1440 normal **+5,81%**, 2560 normal **+4,47%**. Это небольшой локальный выигрыш на текущем Mac, не гарантия для других устройств.

Свежий полный сайт, headless Chromium на Mac, viewport-эмуляция, по 2 с прогрева и 10 с режима:

| Ширина | Hero FPS | Process FPS | Активный пролёт FPS |
| --- | ---: | ---: | ---: |
{chr(10).join(rows)}

Активный пролёт исключает штатную остановку сцены за непрозрачным контентом. Весь интервал прокрутки включает эти остановки и даёт другую цифру; обе сохранены в JSON. Последовательные замеры v571 и v591 при разной нагрузке нельзя выдавать за причинный прирост 20–35%; для оценки изменения использовано чередование B/C/C/B. Целевой бюджет не пройден.

Числовые данные света/рельефа остаются 9 284 189 байт, lossless-выигрыш предыдущей v571 сохранён. Наблюдаемый публичный runtime сейчас {min(world_mb):.2f}–{max(world_mb):.2f} МБ по Resource Timing. Сетевые ориентиры 3–6 МБ mobile / 5–10 МБ desktop не выполнены. Это наблюдавшиеся запросы к готовности сцены, не доказательство полного критического пути.

## Проверки и визуальный результат

- Chromium: 24 пары baseline/candidate и 21 reverse, все 45 точны по RGBA. WebKit: 16 пар и 14 reverse, все 30 точны. Source SHA этих запусков равен текущему authoring world.js.
- Firefox fallback: 21 из 30 сравнений точны, до 1797 отличающихся каналов и максимум 5/255; ошибки WebGL отсутствуют. Это оставшаяся нестабильность исходного пути, **общего побитного PASS Firefox нет**. Отклонённый вариант с depth pass сохранён отдельно, не опубликован.
- Текущие fault, state, suspension, navigation — 4/4. Неизменный UI/контент/доступность/интеракции имеют базу v570 8/8; новая полная восьмёрка v591 не заявляется. Native release проверил 101 неизменный статический файл и текущие source SHA.
- Restore возвращает точный кадр; double dispose освобождает геометрию (650→0) и WebGL-контекст; abort даёт AbortError. После dispose счётчик renderer.info.textures остаётся 1, но контекст потерян. Поле `status: failed` — существующее значение API для уже disposed мира, а не результат теста. Нулевое число текстур не заявляется.
- Публичные сценарии: Chromium 390/1440/2560, Firefox и WebKit 390/1440. Проверены WebGL, солнечный цикл, возврат камеры, Extra Meat с пятью изображениями, обратная ссылка, ошибки консоли/HTTP и отсутствие горизонтального переполнения. WebKit не выдаётся за Safari; viewport не выдаётся за физический телефон.
- Сравнены исходный image3 и актуальные кадры. У текущей сцены шире освещённая полоса берега, отличаются профиль склонов и форма/свет крон. Этот выпуск сохраняет изображение, **не исправляет эти художественные отличия**. G04 остаётся REWORK.
- Все 150 защищённых файлов и {len(backup)} резервных файлов начала этого прохода точны. Ничего не удалялось, коммитов нет.

## Отклонённые варианты

Resolved horizon, shadow-only Meshopt proxy, mediump BRDF, filtered micro-noise, grass depth после нового terrain/leaf depth не дали достаточного выигрыша. Radiance cache сначала выявил ошибки render state/лимита sampler; исправленный вариант запустился, но был медленнее и дал чёрную границу отражения. Увеличение рассеяния воды не улучшило композицию. Все эти варианты остались в evidence/scripts, в runtime не перенесены. Подробности и последовательность: `design/c7-execution-plan-v572-2026-10-29.md`.

## Что остаётся

1. G04: отдельно исправить геометрию среднего освещённого гребня и тёмного склона, затем форму крон; сверять в одинаковом 16:9 с image3 и на 390/1440/2560, проверяя весь солнечный цикл. Уменьшение общего света не заменяет правку профиля.
2. G07: пересмотреть стоимость многократного расчёта света земли/крон. Повторять отклонённые выше варианты без новой причины не нужно. Нужен выигрыш существенно больше текущих 4–6%, с проверкой сохранения вида и всех поз. Сетевой бюджет также остаётся открытым.
3. Физические iOS/Android, слабый GPU, настоящий Safari, VoiceOver/TalkBack и внешняя художественная приёмка не выполнены. Указанные среды недоступны в текущем прогоне.
4. G08: неделя размещения требует отложенного пользователем закрепления. Срок текущей ссылки указан выше. Один Extra Meat и подготовка письма mailto остаются согласованным объёмом.

Пакет: 105 файлов / {pkg['bytes']} байт; ZIP {pkg['archiveBytes']} байт, SHA256 `{pkg['archiveSHA256']}`. Использован успешный Next export v548 с выпуском только двух runtime-файлов (world.js, package.json); новой сборки Next не было.

Доказательства: `evidence/c7-v591-completion-status.json`, `c7-v591-verification/`, `c7-v591-depth-chromium/`, `c7-v590-depth-webkit/`, `c7-v591-depth-firefox/`, `c7-v591-performance/`, `c7-v591-public/`, `c7-v591-public-delivery/`, `c7-v591-preservation/`.
'''
Path(report_path).write_text(report)
block=f'''<!-- v591-status-start -->
> **Текущий выпуск v591 · 29.10.2026, {msk:%H:%M} МСК.** https://breezy-hazel-428.harvis.page/c7/ . Depth coverage крон/крупного рельефа даёт около 4–6% в парном замере; Firefox использует прежний путь. Chromium 45/45 и WebKit 30/30 pixel pairs точны, Firefox 21/30 — общего strict PASS нет. 4/4 текущих функциональных набора, 105 публичных SHA и 7 публичных сценариев прошли. **10/10 не достигнуто: G04/G07 REWORK, G08 OPEN.** Пролёт 390/1440/2560: 35,75/16,87/13,75 FPS, физические устройства/native Safari/дикторы не проверены. Preview до {expiry:%d.%m.%Y %H:%M:%S} МСК; неделя не гарантирована. ТЗ и открытые требования не ослаблены. Отчёт: `{report_path}`. Ниже — история предыдущих версий.
<!-- v591-status-end -->'''
for f in ['design/c7-master-tz-2026-10-25.md','design/c7-finish-plan-2026-10-26.md','design/c7-completion-tz-2026-10-23-r2.md','design/c7-local-handoff-2026-10-26.md','design/c7-current-world-passport-2026-10-26.md']:
 p=Path(f);s=p.read_text()
 if '<!-- v591-status-start -->' in s:s=re.sub(r'<!-- v591-status-start -->[\s\S]*?<!-- v591-status-end -->',lambda _:block,s)
 else:
  first,rest=s.split('\n',1);s=first+'\n\n'+block+'\n'+rest
 if 'local-handoff' in f:s=re.sub(r'^# .*', '# C7 — передача текущей версии v591 · 29 октября 2026',s,count=1)
 p.write_text(s)
p=Path('design/c7-working-matrix-2026-10-26.csv')
with p.open(encoding='utf-8-sig',newline='') as f:reader=csv.DictReader(f);headers=reader.fieldnames;matrix=list(reader)
texts={
 'Q02':'v591: текущие state/suspension/navigation проходят. 45 Chromium и 30 WebKit pixel pairs точны; Firefox 21/30. Пролёт 35,75/16,87/13,75 FPS на390/1440/2560; общая плавность не принята.',
 'Q09':f'v591: прежние lossless данные9,28МБ, публичный runtime{min(world_mb):.2f}–{max(world_mb):.2f}МБ.105HTTP SHA точны; сетевой бюджет остаётся открытым.',
 'N05':'v591: ускорение сохраняет вид в Chromium/WebKit на проверенных состояниях; семь публичных сценариев проходят. Отличия image3 и недостаточный FPS остаются; законченный фрагмент не принят.',
 'G02':'v591:105HTTP SHA и150protected SHA точны, current fault/lifecycle проходят. Формат/данные unchangedv571; сетевой бюджет открыт.',
 'G04':'v591: художественные параметры сохранены. Ширина освещённого берега, профиль склонов, формы/свет крон ещё отличаются от image3. REWORK сохраняется.',
 'G07':'v591: depth coverage даёт+4,65/+5,81/+4,47% в парных390/1440/2560. Полный активный пролёт35,75/16,87/13,75FPS; цель40–60 не достигнута. Firefox bypass,21/30strictpairs. Физические/native/дикторы NOT_RUN.',
 'G08':f'v591 опубликована,105HTTP SHA и7публичных сценариев прошли. Preview до{expiry:%d.%m.%Y %H:%M:%S}МСК. Неделя/внешняя приёмка открыты, закрепление отложено пользователем.'}
counts_before=collections.Counter(r['status'] for r in matrix)
for r in matrix:
 if r['id'] in texts:r['actual']=texts[r['id']];r['evidence']=report_path+'; evidence/c7-v591-completion-status.json'
assert len(matrix)==149 and collections.Counter(r['status'] for r in matrix)==counts_before
with p.open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=headers);w.writeheader();w.writerows(matrix)
status['matrixCounts']=dict(counts_before)
Path('evidence/c7-v591-completion-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
p=Path('design/c7-execution-journal-2026-10-23-r2.md')
if '### EXEC110 —' not in p.read_text():
 with p.open('a') as f:f.write(f'''\n\n### EXEC110 — v591, {msk:%H:%M} МСК\n\nПроход глубины для 13 крон и рельефа от 1,5 млн пикселей внедрён, проверен и опубликован. Парный прирост 4,65/5,81/4,47%; полный пролёт 35,75/16,87/13,75 FPS. Chromium 45/45, WebKit 30/30 RGBA exact; Firefox сохраняет исходный путь, 21/30 сравнений точны, общего strict PASS нет. Текущие 4/4 набора, 105 HTTP SHA, 7 публичных сценариев, 150 защищённых SHA и 8 резервных SHA проходят. Исходные UI, данные и assets сохранены; 101 статический файл прежнего export проверен. Новый Next build и новая полная восьмёрка suites не заявляются.\n\nG04/G07 — REWORK, G08 — OPEN. Пробные horizon/radiance/shadow/grass изменения не дали качественного выигрыша и не перенесены. Художественного 1:1 нет; физические устройства, native Safari и дикторы — NOT_RUN. Неделя не обеспечена, receipt до {expiry:%d.%m.%Y %H:%M:%S} МСК. Без агентов, видимых окон, коммитов и удаления файлов. Подробности: {report_path}.\n''')
p=Path('design/c7-execution-plan-v572-2026-10-29.md')
p.write_text(p.read_text().replace('4. [ ] Собрать','4. [x] Собрать',1))
with p.open('a') as f:f.write(f'''\n\n## Итог {msk:%H:%M} МСК — v591 опубликована\n\n- [x] Сохранить исходное состояние, провести диагностику и перенести подтверждённое ускорение.\n- [x] Проверить актуальные fault/state/suspension/navigation, restore/dispose/abort, три ширины, Chromium/WebKit pixel parity и Firefox bypass.\n- [x] Собрать 105 файлов, проверить ZIP/HTTPS SHA и семь публичных сценариев, обновить ТЗ, матрицу и журнал.\n- [ ] Достичь 40–60 FPS и сетевых бюджетов. Текущего прироста 4–6% недостаточно.\n- [ ] Исправить видимые отличия image3: ширину светлого берега, профиль склонов, кроны. В этой итерации изображение сохранено.\n- [ ] Проверить физические устройства, native Safari и дикторы; получить внешнюю приёмку и неделю хостинга.\n\nОткрытые критерии не закрывались количеством тестов. Следующие конкретные работы указаны в {report_path}.\n''')
print({'version':'v591','publicPass':True,'matrix':dict(counts_before),'tenOfTen':False,'finishedMoscow':msk.isoformat()})
