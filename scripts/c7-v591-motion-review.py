from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw
root=Path('evidence/c7-v591-motion')
data=json.loads((root/'results.json').read_text())
assert len(data['runs'])==3 and all(r['pass'] for r in data['runs'])
records=[]
fractions=[.22,.36,.5,.64,.78,.9]
for width in [390,1440,2560]:
 video=root/f'{width}-down-up.webm'
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(video)],text=True).strip())
 frames=[]
 for i,fraction in enumerate(fractions):
  frame=root/f'{width}-frame-{i}.jpg'
  subprocess.run(['ffmpeg','-loglevel','error','-nostdin','-y','-ss',str(duration*fraction),'-i',str(video),'-frames:v','1','-vf','scale=480:-1',str(frame)],check=True)
  frames.append(Image.open(frame).convert('RGB'))
 w,h=frames[0].size
 sheet=Image.new('RGB',(w*3,(h+24)*2),'#e8e8e8');draw=ImageDraw.Draw(sheet)
 for i,frame in enumerate(frames):
  x,y=i%3*w,i//3*(h+24);sheet.paste(frame,(x,y+24));draw.text((x+5,y+5),f'{width}px / {duration*fractions[i]:.1f}s',fill='black')
 sheet.save(root/f'{width}-contact.jpg',quality=86)
 records.append({'width':width,'duration':duration,'samplesFraction':fractions,'kind':'Six samples from recorded motion, not exhaustive frame review'})
(root/'contact-sheets.json').write_text(json.dumps(records,indent=2))
print(records)
