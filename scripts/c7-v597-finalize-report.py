import json,csv,collections,hashlib,pathlib,datetime,zoneinfo
P=pathlib.Path
read=lambda p:json.loads(P(p).read_text())
qa=read('evidence/c7-v597-verification/results.json');suites=read('evidence/c7-v597-final-checks/results.json')['runs'];public=read('evidence/c7-v597-public/results.json')
assert len(qa)==5 and len(suites)==8 and len(public)==4
assert all(x['code']==0 for x in qa+suites+public)
pixels=read('evidence/c7-v597-runtime-pixels/results.json');assert len(pixels['rows'])==66 and all(r['exact'] for r in pixels['rows']) and not pixels['errors']
perf=read('evidence/c7-v597-flight-abba/results.json');assert len(perf['rows'])==12 and not perf['errors']
repeat=read('evidence/c7-v597-flight-repeat-1440/results.json');assert len(repeat['rows'])==4 and not repeat['errors']
perfRows=perf['rows']+repeat['rows']
summary=[]
for w in [390,1440,2560]:
 values={m:sum(r['activeRenderedFPS'] for r in perfRows if r['width']==w and r['mode']==m)/sum(1 for r in perfRows if r['width']==w and r['mode']==m) for m in ['baseline','candidate']}
 summary.append({'width':w,**values,'percent':(values['candidate']/values['baseline']-1)*100})
receipt=read(P.home()/'.config/volnami-c7-preview/harvis-v597.json');assert receipt['updated'] and receipt['url']=='https://breezy-hazel-428.harvis.page'
expiry=datetime.datetime.fromisoformat(receipt['expiresAt'].replace('Z','+00:00')).astimezone(zoneinfo.ZoneInfo('Europe/Moscow')).strftime('%d.%m.%Y %H:%M:%S МСК')
pkg=read('evidence/c7-v597-package.json');assert pkg['allEntryHashesExact']
assert hashlib.sha256(P('artifacts/c7-preview-2026-10-29-v597.zip').read_bytes()).hexdigest()==pkg['archiveSHA256']
net=read('evidence/c7-v597-public/chromium/results.json')
network=[{'width':r['width'],'runtimeBytes':r['delivery']['worldBytes'],'resourceBytes':r['delivery']['resourceBytes']} for r in net['runs']]
status={'version':'v597','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':receipt['url']+'/c7/','expiresAt':receipt['expiresAt'],'tenOfTen':False,'open':['G04 REWORK: bank/slope/crown match','G07 REWORK: FPS and network budgets','G08 OPEN: owner claim deferred; no guaranteed week'],'notRun':['physical iOS','physical Android','weak GPU','native Safari','VoiceOver','TalkBack'],'performance':summary,'network':network,'functionalSuites':len(suites),'publicScenarios':sum(len(read(f'evidence/c7-v597-public/{e}/results.json')['runs']) for e in ['chromium','firefox','webkit']),'portablePixelPairs':33,'protected':150,'backups':43,'package':pkg,'accepted':['Original bark mip tail 2..10 as lossless WebP atlas','Conservative Three ESM minification','Manifest-only runtime packaging'],'rejected':['Hardware 3D horizon interpolation: no gain','Spatial shader specialization with preserved order: no gain','New front bank profile: no confirmed visual improvement after fresh bake; restored']}
P('evidence/c7-v597-completion-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
rows='\n'.join(f"| {r['width']} | {r['baseline']:.2f} | {r['candidate']:.2f} | {r['percent']:+.2f}% |" for r in summary)
netText=', '.join(f"{r['width']}: {r['runtimeBytes']/1e6:.2f} МБ" for r in network)
report=f'''# C7 — проверенный выпуск v597, 29.10.2026

Обновлена существующая ссылка: https://breezy-hazel-428.harvis.page/c7/ . Срок по receipt: **{expiry}**. Неделя не гарантирована; закрепление отложено пользователем. **10/10 не достигнуто.** Один исполнитель, без агентов, видимых окон и коммитов.

## Изменения

Три текстуры коры: 4 486 548 → 386 262 байта. Сохранены исходные GPU mip2..10, упакованные без потерь в атласы WebP; нижние уровни больше не пересоздаются браузером. Оригинальные JPEG сохранены. Тесты относятся к авторскому маршруту, не к произвольному приближению камеры. Three ESM: 2 120 885 → 792 573 байта, без сжатия выражений и изменения имён свойств. Пакет использует явный runtime manifest и не передаёт старые неиспользуемые JPEG. Полный пакет: 27 141 876 → 21 714 318 байт (−20,0%); ZIP {pkg['archiveBytes']} байт.

## Скорость и сеть

Одинаковый Mac, headless Chromium/Metal, 2 с прогрева + 10 с полного пролёта, порядок baseline/candidate/candidate/baseline. Считаются реально отрисованные кадры через счётчик сцены, исключая штатные остановки за непрозрачным контентом; rAF сохранён отдельно. Это эмуляция размеров, не физические телефоны.

| Ширина | v591 FPS | v597 FPS | Разница |
| --- | ---: | ---: | ---: |
{rows}

Для 1440 после первого отклонения выполнена ещё одна серия B/C/C/B; таблица включает все 4 пробы каждого варианта, для 390/2560 — по 2. Это парная локальная выборка, не гарантия ускорения на других устройствах. Цель 40–60 FPS не выполнена. Публичный runtime по Resource Timing к готовности сцены: {netText}; прежний около16,43 МБ. Полный критический путь этим не доказан. Ориентиры 3–6 МБ mobile / 5–10 МБ desktop остаются открытыми.

## Визуал и проверки

33 пары фактического portable runtime v591/v597 в Chromium совпали побитно, включая минифицированный Three и новый загрузчик. Отдельный тест транспорта: Chromium33/33 exact; WebKit максимум2/255 на 74 каналах; Firefox максимум8/255 при таком же максимуме контрольного повтора — strict PASS Firefox не присвоен. Проверены кадры на 390/1440/2560 и 11 опорных фазах.

Новый более крутой профиль берега прошёл полный пересчёт геометрии/небесного затенения, но не подтвердил улучшение по image3 и **отменён вместе с кэшами**. Кроны не изменены. Ширина освещённой полосы, профиль склонов и форма/свет крон остаются отличиями; G04 REWORK. Hardware-horizon и spatial shader specialization не дали устойчивого выигрыша и не включены.

8/8 функциональных наборов; lifecycle restore/dispose/abort; Firefox/WebKit перед публикацией; 105 публичных SHA и 7 публичных сценариев прошли. 150 защищённых файлов и43 резервные копии точны. Проверены 99 сохраняемых файлов старого export; переиспользована успешная Next-сборка v548, новой Next-сборки нет. Один Extra Meat и mailto сохранены.

Физические iOS/Android, слабый GPU, native Safari, VoiceOver/TalkBack — NOT_RUN. Подключённых телефонов по USB не найдено; видимых приложений и настроек компьютера не меняли.

Доказательства: `evidence/c7-v597-completion-status.json`, `c7-v597-flight-abba/`, `c7-v597-runtime-pixels/`, `c7-v597-final-checks/`, `c7-v597-public/`, `c7-v597-public-delivery/`, `c7-v597-preservation/`. ZIP SHA256: `{pkg['archiveSHA256']}`.
'''
P('design/c7-release-v597-2026-10-29.md').write_text(report)
headline=f'''> **Текущий выпуск v597 · 29.10.2026.** https://breezy-hazel-428.harvis.page/c7/ . Пакет уменьшен на 5,43 МБ (20%); сохранённая mip-цепочка коры и минификация Three. 33 пары кадров runtime Chromium точны, 8/8 текущих функциональных наборов,105 публичных SHA и 7 публичных сценариев прошли. **G04/G07 REWORK, G08 OPEN; 10/10 не достигнуто.** Правка берега отклонена и восстановлена, художественные отличия остаются. Парные FPS: {', '.join(f"{r['width']} {r['baseline']:.2f}→{r['candidate']:.2f}" for r in summary)}. Физические устройства/native Safari/дикторы NOT_RUN. Preview до {expiry}; неделя не гарантирована. Отчёт: `design/c7-release-v597-2026-10-29.md`.
'''
for f in ['design/c7-master-tz-2026-10-25.md','design/c7-execution-plan-v572-2026-10-29.md']:
 s=P(f).read_text();assert '<!-- v597-status-start -->' not in s
 at=s.index('\n')+1;s=s[:at]+'\n<!-- v597-status-start -->\n'+headline+'<!-- v597-status-end -->\n'+s[at:];P(f).write_text(s)
p=P('design/c7-execution-plan-v592-2026-10-29.md');s=p.read_text().replace('5. [ ]','5. [x]').replace('6. [ ]','6. [x]');s+='\n'+headline+'\nЧасовой проход завершён; открытые критерии выше не закрывались успешными тестами.\n';p.write_text(s)
p=P('design/c7-execution-journal-2026-10-23-r2.md');s=p.read_text();assert '### EXEC111 —' not in s;s+='\n\n### EXEC111 — v597, 29.10.2026\n\n'+headline+'\nТранспорт коры проверен отдельно на 3 движках. Новый профиль с полным sky bake отвергнут после сравнения с image3; исходники и поля восстановлены. Две shader-гипотезы без выигрыша отклонены. 150protected/43backup SHA точны. Незакоммиченная работа сохранена.\n';p.write_text(s)
p=P('design/c7-working-matrix-2026-10-26.csv')
with p.open(encoding='utf-8-sig',newline='') as f:r=csv.DictReader(f);fields=r.fieldnames;matrix=list(r)
counts=collections.Counter(r['status'] for r in matrix)
updates={
 **{i:'v597: геометрия и свет сохранены после отклонения нового профиля берега. 33пары portable runtime точны в Chromium. Отличия освещённого берега, склонов и крон остаются; художественное1:1не принято.' for i in ['W01','W07','N05','G04']},
 **{i:'v597:8/8текущих функциональных suites и 7 публичных сценариев прошли;33пары runtime Chromium exact. Это не принятие FPS/физических устройств. G07 остаётся REWORK.' for i in ['W09','Q02','G02','G05']},
 'Q09':f'v597:105 публичных SHA точны,7публичных сценариев без HTTP/console ошибок. Runtime {netText}. Сетевые бюджеты не закрыты.',
 'Q10':'v597: физические устройства NOT_RUN; свежий USB-инвентарь телефонов не нашёл, adb отсутствует. Viewport-эмуляция не выдана за телефон.',
 **{i:'v597:актуальные8suites/33pixel pairs/7публичных сценариев/105SHA подтверждены;150protected и43backup сохранены. Физические среды NOT_RUN, G04/G07/G08открыты.' for i in ['N11','N14']},
 'G07':'v597:пакет−5,43МБ;парный полный пролёт '+', '.join(f"{r['width']} {r['baseline']:.2f}→{r['candidate']:.2f} FPS" for r in summary)+'. Цель40–60FPS и сетевой бюджет не выполнены. Физические среды NOT_RUN; строгая повторяемость Firefox не подтверждена.',
 'G08':f'v597опубликована и проверена;receipt до {expiry}. Закрепление отложено пользователем; гарантированной недели нет. G08OPEN.'}
for r in matrix:
 if r['id'] in updates:r['actual']=updates[r['id']];r['evidence']='design/c7-release-v597-2026-10-29.md; evidence/c7-v597-completion-status.json'
assert len(matrix)==149 and collections.Counter(r['status'] for r in matrix)==counts
with p.open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(matrix)
print(json.dumps({'performance':summary,'network':network,'expiry':expiry,'matrix':dict(counts)},ensure_ascii=False,indent=2))
