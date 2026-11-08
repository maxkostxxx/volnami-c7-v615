import { firefox } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.QA_BASE_URL ?? 'https://breezy-hazel-428.harvis.page';
const out = process.env.QA_OUTPUT ?? 'evidence/shared-site-v543-firefox';
await fs.mkdir(out, { recursive: true });
const browser = await firefox.launch({
  headless: true,
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false },
});
const runs = [];
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'networkidle', timeout: 120000 });
    assert.equal(response.status(), 200);
    await page.locator('.c7-landscape.is-ready').waitFor({ timeout: 90000 });
    for (const id of ['process', 'testimonials', 'hero']) {
      await page.evaluate(id => scrollTo({ top: id === 'hero' ? 0 : document.getElementById(id).offsetTop, behavior: 'instant' }), id);
      await page.waitForTimeout(1800);
      const state = await page.locator('.c7-landscape').evaluate(element => JSON.parse(element.dataset.c7Debug));
      assert.ok(Math.abs(state.exactProgress - state.smoothProgress) < .002);
      assert.ok(state.camera.every(Number.isFinite));
    }
    await page.locator('.c7-case-open').click();
    await page.waitForURL('**/c7/case/miratorg-extra-meat/');
    assert.equal(await page.locator('h1').textContent(), 'Extra Meat');
    await page.locator('.c7-project-back').click();
    await page.waitForURL('**/c7/#cases');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    runs.push({ width, height, pass: true, errors });
    console.log(width, 'real Firefox main/case PASS');
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ base, kind: 'Official Playwright Firefox 155 launched headless with real WebGL; emulated viewport, not Safari or a physical phone.', runs }, null, 2));
}
