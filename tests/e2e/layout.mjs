// Layout and accessibility check in real Chromium, at four widths, for every page state:
// home, plan (open / condition panel / tipped / expired*), plan not found, privacy.
// Per page: no horizontal overflow, no button whose label wraps onto two lines, no console errors,
// and an axe-core scan (WCAG 2 A/AA rules) with zero violations. Screenshots go to shots/layout/.
// *expired needs the local TEST_HOOKS worker, so it is skipped against production.
// Also checks that a hostile plan id cannot inject markup into the link-preview HTML.
// Usage: BASE=http://127.0.0.1:8870 node tests/e2e/layout.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const BASE = process.env.BASE || 'http://127.0.0.1:8870';
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
const OUT = path.join(process.env.SHOTS || 'shots', 'layout');
fs.mkdirSync(OUT, { recursive: true });
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

function findChrome() {
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
}

// API helpers (node fetch sends no Origin header, which the same-origin check allows).
async function call(p, { method = 'GET', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-member-token'] = token;
  const r = await fetch(`${BASE}/api/${p}`, { method, headers, body: body && JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${j.error}`);
  return j;
}
const created = [];
async function makePlan(title, target) {
  const r = await call('plans', { method: 'POST', body: { title, when: 'Sat 14 Dec, from 8 pm', details: 'Upstairs room at the Crown, about €25 each for food', target, deadline: Date.now() + 3 * 86400000, name: 'Ana' } });
  created.push(r);
  return r;
}
async function addFriend(id, name, answer) {
  const j = await call(`plans/${id}/join`, { method: 'POST', body: { name } });
  if (answer) await call(`plans/${id}/answer`, { method: 'PUT', token: j.token, body: answer });
  return j;
}

const failures = [];
const browser = await chromium.launch({ executablePath: findChrome() });
try {
  // Fixtures: an open plan (Ana in, Ben in, Cy only-if, Dee out), a tipped plan, an expired plan.
  const open = await makePlan('Christmas drinks with the old team', 8);
  await addFriend(open.id, 'Ben', { status: 'in' });
  const cy = await addFriend(open.id, 'Cy', { status: 'in', condMin: 6 });
  await addFriend(open.id, 'Dee', { status: 'out' });
  await addFriend(open.id, 'Eleanor-Rose', null);
  const on = await makePlan('Christmas drinks with the old team', 3);
  await addFriend(on.id, 'Ben', { status: 'in' });
  const ben = await call(`plans/${on.id}`); // need Ben's id for a name condition
  await addFriend(on.id, 'Cy', { status: 'in', condNames: [ben.people.find((p) => p.name === 'Ben').id] });
  let expired = null;
  if (LOCAL) {
    expired = await makePlan('Boxing Day walk', 6);
    await addFriend(expired.id, 'Ben', { status: 'in' });
    await fetch(`${BASE}/api/__test/expire/${expired.id}`, { method: 'POST' });
  }

  const pages = [
    { name: 'home', url: '/' },
    { name: 'plan-open-creator', url: `/p/${open.id}#k=${open.token}` },
    { name: 'plan-open-visitor', url: `/p/${open.id}` },
    { name: 'plan-condition', url: `/p/${open.id}#k=${cy.token}`, act: async (p) => { await p.getByRole('button', { name: 'Change' }).click(); await p.getByRole('button', { name: 'I’m in, only if…' }).click(); await p.locator('#cond-panel').waitFor(); } },
    { name: 'plan-tipped', url: `/p/${on.id}#k=${on.token}`, wait: 'It’s on! 🎉' },
    ...(expired ? [{ name: 'plan-expired', url: `/p/${expired.id}#k=${expired.token}`, wait: 'This one didn’t tip' }] : []),
    { name: 'plan-missing', url: '/p/zzzzzzzz', wait: 'This plan is gone' },
    { name: 'privacy', url: '/privacy' },
  ];
  const widths = [360, 390, 768, 1280];

  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 800 : 860 }, deviceScaleFactor: w < 800 ? 2 : 1, isMobile: w < 800, hasTouch: w < 800, bypassCSP: true });
    for (const pg of pages) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(BASE + pg.url);
      if (pg.url.startsWith('/p/')) await page.locator('#app > :not(.spinner)').first().waitFor();
      if (pg.wait) await page.getByText(pg.wait).first().waitFor();
      if (pg.act) await pg.act(page);
      await page.waitForTimeout(150);
      const tag = `${pg.name}@${w}`;
      const lay = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth - vw;
        const wide = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > vw + 1; })
          .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
        // A button label that wraps makes the button taller than one line of its text plus padding.
        const wrapped = [...document.querySelectorAll('.btn, .chip')].filter((b) => {
          if (!b.offsetParent) return false;
          const lh = parseFloat(getComputedStyle(b).lineHeight) || 24;
          const r = document.createRange(); r.selectNodeContents(b);
          return r.getClientRects().length > 1 && [...r.getClientRects()].some((x) => Math.abs(x.top - r.getClientRects()[0].top) > lh / 2);
        }).map((b) => b.textContent.trim());
        return { overflow, wide, wrapped };
      });
      if (lay.overflow > 0) failures.push(`${tag}: horizontal overflow ${lay.overflow}px (${lay.wide.join(', ')})`);
      if (lay.wrapped.length) failures.push(`${tag}: wrapped button labels: ${lay.wrapped.join(' | ')}`);
      await page.addScriptTag({ path: AXE });
      const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')}`));
      for (const a of axe) failures.push(`${tag}: axe ${a}`);
      for (const e of errs) failures.push(`${tag}: console ${e}`);
      await page.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: true });
      console.log(`· ${tag}: overflow ${lay.overflow}, wrapped ${lay.wrapped.length}, axe ${axe.length}, console ${errs.length}`);
      await page.close();
    }
    await ctx.close();
  }

  // Link preview HTML must not echo a hostile id.
  const evil = await (await fetch(`${BASE}/p/${encodeURIComponent('"><b>x</b>')}`)).text();
  if (evil.includes('<b>x</b>')) failures.push('preview: hostile plan id reflected into HTML');
  const ogUrl = (await (await fetch(`${BASE}/p/${open.id}`)).text()).match(/og:url" content="([^"]*)"/)?.[1];
  if (ogUrl !== `${new URL(BASE).origin}/p/${open.id}`) failures.push(`preview: og:url is ${ogUrl}`);
} finally {
  for (const c of created) await call(`plans/${c.id}`, { method: 'DELETE', token: c.token }).catch(() => {});
  await browser.close();
}
if (failures.length) { console.log(`FAIL (${failures.length})\n${failures.join('\n')}`); process.exit(1); }
console.log(`PASS (${BASE})`);
