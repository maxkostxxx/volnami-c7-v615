"""Create a new ZIP only from an exact, supplied preview manifest."""
import argparse
import hashlib
import json
import pathlib
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('package', type=pathlib.Path)
parser.add_argument('--output', required=True, type=pathlib.Path)
args = parser.parse_args()
root = args.package
manifest = json.loads(pathlib.Path(str(root) + '-manifest.json').read_text())
archive = pathlib.Path(str(root) + '.zip')
expected = {r['file']: r for r in manifest['files']}
assert len(expected) == len(manifest['files'])
assert not archive.exists(), 'Refuse to overwrite a prior archive'
assert set(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()) == set(expected)
sha = lambda data: hashlib.sha256(data).hexdigest()
for name, record in expected.items():
    assert not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts
    data = (root / name).read_bytes()
    assert len(data) == record['bytes'] and sha(data) == record['sha256'], name
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in sorted(expected):
        z.writestr(name, (root / name).read_bytes())
with zipfile.ZipFile(archive) as z:
    assert set(z.namelist()) == set(expected)
    for name, record in expected.items():
        assert sha(z.read(name)) == record['sha256'], name
result = dict(files=len(expected), packageBytes=manifest['bytes'], archiveBytes=archive.stat().st_size,
              allEntryHashesExact=True, archiveSHA256=sha(archive.read_bytes()))
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2))
print(result)
