from pathlib import Path
from PIL import Image
import math,json,os
candidate=os.environ.get('QA_CANDIDATE','dusk-aureole-v420')
root=Path('evidence')/candidate
x=json.loads((root/'results.json').read_text())
targets=json.loads(Path('evidence/sunset-reference-v420/profile.json').read_text())['rows']
runs=[]
for row in x['rows']:
 if row['phase']!=.86:continue
 im=Image.open(row['file']).convert('RGB');w,h=im.size;ndc=row['state']['sun'];cx=(ndc[0]+1)*w/2;cy=(1-ndc[1])*h/2;res=[]
 for target in targets:
  r=target['r']*h/720
  pixels=[im.getpixel((i,j)) for j in range(max(0,int(cy-r-3)),int(cy)+1) for i in range(max(0,int(cx-r-3)),min(w,int(cx+r+4))) if abs(math.hypot(i-cx,j-cy)-r)<1.5*h/720]
  rgb=[sum(p[c] for p in pixels)/len(pixels) for c in range(3)]
  res.append({'r':target['r'],'rgb':rgb,'target':target['rgb']})
 rmse=(sum((r['rgb'][c]-r['target'][c])**2 for r in res for c in range(3))/(len(res)*3))**.5
 runs.append({'source':row['source'],'rmseRGB':rmse,'center':[cx,cy],'rows':res})
result={'method':'Upper annuli in JPEG screenshot at travel.86, radius scaled by viewport height/reference720. Image profile approximation; not identical camera or a whole-scene art score. Reference JPEG remains unchanged.','runs':runs}
(root/'profile-comparison.json').write_text(json.dumps(result,indent=2))
print([(r['source'],round(r['rmseRGB'],3)) for r in runs])
