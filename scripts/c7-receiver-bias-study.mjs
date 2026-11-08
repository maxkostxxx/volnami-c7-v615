import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const candidate = process.env.QA_CANDIDATE ?? 'lab/c7-snapshots/receiver-plane-nobias-v530';
const out = process.env.QA_OUTPUT ?? 'evidence/receiver-bias-v530-study';
const values = (process.env.QA_BIAS_VALUES ?? '0,.1,.2,.3,.4,.5').split(',').map(Number);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--disable-gpu-shader-disk-cache'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [], rows = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(`http://127.0.0.1:3027/${candidate}/shared.html?clean&freeze`);
  await page.waitForSelector('body.ready', { timeout: 120000 });
  for (const [width, height] of [[1280, 720], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(aspect => Math.abs(sceneLab.camera.aspect - aspect) < 1e-8, width / height);
    for (const bias of values) {
      const row = await page.evaluate(async bias => {
        const s = sceneLab;
        s.skyHorizon.uniforms.uReceiverTexelBias.value = bias;
        s.set({ sun: 0, move: 0, time: 0 });
        const gl = s.renderer.getContext();
        return {
          bias,
          linked: s.renderer.info.programs.every(program => gl.getProgramParameter(program.program, gl.LINK_STATUS)),
          glError: gl.getError(),
        };
      }, bias);
      const name = `${width}-${String(bias).replace('.', 'p')}.jpg`;
      await page.screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 95 });
      rows.push({ width, height, ...row, file: name });
      console.log(width, bias);
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ candidate, values, rows, errors }, null, 2));
}
if (errors.length || rows.some(row => !row.linked || row.glError)) process.exitCode = 1;
