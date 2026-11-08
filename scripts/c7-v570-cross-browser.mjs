// Background verification of the deployed C7 page; viewport emulation is not device acceptance.
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.QA_BASE_URL;
const output = process.env.QA_OUTPUT;
const engine = process.env.QA_ENGINE;
assert.ok(base && output && ['chromium', 'firefox', 'webkit'].includes(engine), 'QA_BASE_URL, QA_OUTPUT and QA_ENGINE required');
await fs.mkdir(output, { recursive: true });
const browser = await ({ chromium, firefox, webkit })[engine].launch({
  headless: true,
  ...(engine === 'chromium' ? { args: ['--use-angle=metal'] } : {}),
  ...(engine === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } } : {}),
});
const result = { base, engine, version: browser.version(), at: new Date().toISOString(), kind: 'Headless browser with emulated viewport. WebKit is not native Safari; no physical device or screen-reader acceptance.', runs: [], pass: false };
try {
  const sizes = (engine === 'chromium' ? [[390, 844], [1440, 900], [2560, 1080]] : [[390, 844], [1440, 900]]).filter(([w]) => !process.env.QA_WIDTHS || process.env.QA_WIDTHS.split(',').includes(String(w)));
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], samples = [];
    result.active = { width, height, errors, samples, failures: [], warnings: [] };
    page.on('requestfailed', r => result.active?.failures.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); else if (e.type() === 'warning') result.active?.warnings.push(e.text()); });
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
    assert.equal((await page.goto(`${base}/c7/?c7-debug`, { waitUntil: 'networkidle', timeout: 120000 })).status(), 200);
    try { await page.locator('.c7-landscape:is(.is-ready,.is-fallback)').waitFor({ timeout: 90000 });
      assert.ok(await page.locator('.c7-landscape').evaluate(e => e.classList.contains('is-ready')), '3D initialization entered fallback'); } catch (error) {
      result.active.dom = await page.locator('.c7-landscape').evaluate(e => ({ className: e.className, debug: e.dataset.c7Debug }));
      throw error;
    }
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.c7-landscape canvas')).opacity === '1');
    const delivery=await page.evaluate(()=>{
      const resources=performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,encoded:e.encodedBodySize,decoded:e.decodedBodySize,transfer:e.transferSize,duration:e.duration}));
      const world=resources.filter(e=>e.path.includes('/3d/c7/runtime-v395/'));
      return {kind:'Cold-context Resource Timing after readiness; local server has no HTTP compression. Observed requests, not guaranteed complete critical-path attribution.',readyByMs:performance.now(),resourceBytes:resources.reduce((n,e)=>n+e.encoded,0),worldBytes:world.reduce((n,e)=>n+e.encoded,0),world};
    });
    for (const id of ['hero', 'process', 'contacts', 'hero']) {
      await page.evaluate(id => scrollTo({ top: id === 'hero' ? 0 : document.getElementById(id).offsetTop, behavior: 'instant' }), id);
      await page.waitForTimeout(100);
      await page.waitForFunction(id => {
        const state = JSON.parse(document.querySelector('.c7-landscape').dataset.c7Debug);
        const target = { hero: 0, process: .3, contacts: .93 }[id];
        return id === 'hero' ? state.exactProgress === 0 && state.smoothProgress === 0 : Math.abs(state.exactProgress - target) < .002 && Math.abs(state.exactProgress - state.smoothProgress) < .002;
      }, id, { timeout: 30000 });
      const state = await page.locator('.c7-landscape').evaluate(e => JSON.parse(e.dataset.c7Debug));
      assert.ok(state.camera.every(Number.isFinite));
      samples.push({ id, exact: state.exactProgress, smooth: state.smoothProgress, solar: state.solar, camera: state.camera, frames: state.frames });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (id !== 'hero' || samples.length === 1) await page.screenshot({ path: `${output}/${width}-${id}.jpg`, type: 'jpeg', quality: 80 });
    }
    assert.deepEqual(samples[0].camera, samples.at(-1).camera);
    assert.equal(samples[0].solar, 0);
    assert.equal(samples[2].solar, 1);
    assert.equal(samples.at(-1).solar, 0);
    assert.ok(samples.at(-1).frames > samples[0].frames);
    await page.locator('.c7-case-open').click();
    await page.waitForURL('**/c7/case/miratorg-extra-meat/');
    assert.equal(await page.locator('h1').innerText(), 'Extra Meat');
    for (const img of await page.locator('.c7-project-cover img,.c7-project-gallery img').all()) {
      await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(e => e.complete && e.naturalWidth > 0, await img.elementHandle(), { timeout: 30000 });
      await img.evaluate(e => e.decode());
    }
    await page.locator('.c7-project-back').click();
    await page.waitForURL('**/c7/#cases');
    try { await page.locator('.c7-landscape:is(.is-ready,.is-fallback)').waitFor({ timeout: 90000 });
      assert.ok(await page.locator('.c7-landscape').evaluate(e => e.classList.contains('is-ready')), '3D initialization entered fallback'); } catch (error) {
      result.active.dom = await page.locator('.c7-landscape').evaluate(e => ({ className: e.className, debug: e.dataset.c7Debug }));
      throw error;
    }
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.c7-landscape canvas')).opacity === '1');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    result.runs.push({ width, height, pass: true, samples, errors, delivery });
    delete result.active;
    await context.close();
    console.log(engine, width, 'WebGL/return/case PASS');
  }
  result.pass = true;
} catch (error) {
  result.error = error.message;
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(`${output}/results.json`, JSON.stringify(result, null, 2));
}
