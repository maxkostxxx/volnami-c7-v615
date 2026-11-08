import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const driver = 'http://127.0.0.1:4723';
const site = process.env.QA_BASE_URL ?? 'https://breezy-hazel-428.harvis.page';
const out = process.env.QA_OUTPUT ?? 'evidence/shared-site-v543-safari';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(out, { recursive: true });

async function request(method, path, body) {
  const response = await fetch(driver + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${path}: ${data.value?.error ?? response.status} ${data.value?.message ?? ''}`);
  return data.value;
}

let sessionId;
const runs = [];
try {
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sessionId = created.sessionId;
  const execute = (script, args = []) => request('POST', `/session/${sessionId}/execute/sync`, { script, args });
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await request('POST', `/session/${sessionId}/window/rect`, { width, height, x: 0, y: 0 });
    await request('POST', `/session/${sessionId}/url`, { url: `${site}/c7/?c7-debug` });
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < 90000) {
      ready = await execute('return document.querySelector(".c7-landscape")?.classList.contains("is-ready") === true');
      if (ready) break;
      await sleep(500);
    }
    assert.ok(ready, 'Safari scene ready timeout');
    for (const id of ['process', 'testimonials', 'hero']) {
      await execute(`scrollTo({top:${id === 'hero' ? 0 : `document.getElementById('${id}').offsetTop`},behavior:'instant'})`);
      await sleep(1800);
      const state = await execute('return JSON.parse(document.querySelector(".c7-landscape").dataset.c7Debug)');
      assert.ok(Math.abs(state.exactProgress - state.smoothProgress) < .002);
      assert.ok(state.camera.every(Number.isFinite));
    }
    const frameStats = await request('POST', `/session/${sessionId}/execute/async`, {
      script: `const done=arguments[arguments.length-1],frames=[];let previous;function tick(t){if(previous)frames.push(t-previous);previous=t;if(frames.length>=90)done(frames);else requestAnimationFrame(tick)}requestAnimationFrame(tick);`,
      args: [],
    });
    const sorted = frameStats.toSorted((a, b) => a - b);
    await execute('document.querySelector(".c7-case-open").click()');
    await sleep(1500);
    assert.equal(await execute('return document.querySelector("h1")?.textContent'), 'Extra Meat');
    await execute('document.querySelector(".c7-project-back").click()');
    await sleep(1500);
    assert.ok((await execute('return location.href')).includes('/c7/#cases'));
    runs.push({ width, height, pass: true, frameTime: {
      median: sorted[Math.floor(sorted.length * .5)],
      p95: sorted[Math.floor(sorted.length * .95)],
      samples: sorted.length,
    } });
    console.log(width, 'Safari main/case PASS', runs.at(-1).frameTime);
  }
} finally {
  if (sessionId) await request('DELETE', `/session/${sessionId}`);
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ site, kind: 'Real Safari 27 via safaridriver, hidden app; emulated viewport, not physical mobile or VoiceOver.', runs }, null, 2));
}
