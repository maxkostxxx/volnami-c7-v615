import json,hashlib,zipfile,pathlib
root=pathlib.Path('artifacts/c7-preview-2026-10-29-v598')
m=json.loads(pathlib.Path(str(root)+'-manifest.json').read_text())
archive=pathlib.Path(str(root)+'.zip')
assert not archive.exists()
expected={r['file']:r for r in m['files']}
assert len(expected)==len(m['files'])==107
assert not any(p.endswith(('bark-color.jpg','bark-normal.jpg','bark-roughness.jpg')) for p in expected)
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name,r in expected.items():
  data=(root/name).read_bytes()
  assert len(data)==r['bytes'] and hashlib.sha256(data).hexdigest()==r['sha256']
  z.writestr(name,data)
with zipfile.ZipFile(archive) as z:
 assert set(z.namelist())==set(expected)
 for name,r in expected.items():assert hashlib.sha256(z.read(name)).hexdigest()==r['sha256']
r={'files':len(expected),'packageBytes':m['bytes'],'archiveBytes':archive.stat().st_size,'allEntryHashesExact':True,'archiveSHA256':hashlib.sha256(archive.read_bytes()).hexdigest()}
pathlib.Path('evidence/c7-v598-package.json').write_text(json.dumps(r,indent=2))
print(r)
