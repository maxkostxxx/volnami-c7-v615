import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// A portable preview intentionally omits the private source manifest. In that
// case verify both local source provenance and every file actually served.
export async function verifiedBuild(base) {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const build = process.env.QA_LOCAL_MANIFEST
    ? JSON.parse(await readFile(process.env.QA_LOCAL_MANIFEST, 'utf8'))
    : await (await fetch(base + '/c7-build.json')).json();
  for (const [file, hash] of Object.entries(build.sources)) {
    if (sha(await readFile(file)) !== hash) throw Error('Stale source: ' + file);
  }
  if (process.env.QA_LOCAL_MANIFEST) {
    if (!process.env.QA_PACKAGE_MANIFEST) throw Error('Portable QA requires QA_PACKAGE_MANIFEST');
    const packaged = JSON.parse(await readFile(process.env.QA_PACKAGE_MANIFEST, 'utf8'));
    if (JSON.stringify(packaged.build.sources) !== JSON.stringify(build.sources)) throw Error('Package/build mismatch');
    for (const file of packaged.files) {
      const response = await fetch(base + '/' + file.file);
      if (!response.ok || sha(Buffer.from(await response.arrayBuffer())) !== file.sha256) {
        throw Error('Served package mismatch: ' + file.file);
      }
    }
  }
  return build;
}
