// Renders public/og.png and the PNG icons from tools/og.html and public/icon.svg.
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = path.join(os.homedir(), '.cache/ms-playwright');
const dir = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()[0];
const browser = await chromium.launch({ executablePath: path.join(root, dir, 'chrome-linux64/chrome') });
const here = path.resolve('tools');
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('file://' + path.join(here, 'og.html'));
await p.screenshot({ path: 'public/og.png' });
for (const s of [180, 512]) {
  const q = await browser.newPage({ viewport: { width: s, height: s } });
  await q.goto('file://' + path.resolve('public/icon.svg'));
  await q.screenshot({ path: `public/icon-${s}.png`, omitBackground: true });
}
await browser.close();
console.log('rendered og.png, icon-180.png, icon-512.png');
