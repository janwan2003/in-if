// End-to-end test in real Chromium, one browser context per person (creator on desktop, friends on phones).
// Covers: create from a template, share prompt, sealed answers (checked in the raw API responses, not just
// the UI), "only if" conditions on a count and on a name, the live link preview, the tip (names appear,
// "not this time" never revealed), the shareable card, leave, edit, an expiry that reveals nothing
// (local only: a TEST_HOOKS endpoint of the local worker moves the deadline into the past), and delete.
// Usage: BASE=http://127.0.0.1:8870 node tests/e2e/run.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8870';
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name), fullPage: true });

async function person(label, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (404|409)/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  return { label, ctx, page };
}
// Raw API read as a given page (uses its stored token), to check what the server actually reveals.
const rawView = (p, id) => p.evaluate(async (id) => {
  const t = (JSON.parse(localStorage.getItem('inif:plans') || '{}')[id] || {}).token;
  const r = await fetch(`/api/plans/${id}`, { headers: t ? { 'x-member-token': t } : {} });
  return r.json();
}, id);
const anonView = async (id) => (await fetch(`${BASE}/api/plans/${id}`)).json();
const ogTitle = async (id) => (await (await fetch(`${BASE}/p/${id}`)).text()).match(/og:title" content="([^"]*)"/)[1];

async function answer(p, { name, mode, min, names = [] }) {
  await p.goto(`${BASE}/p/${planId}`);
  await p.getByRole('heading', { name: 'Are you in?' }).waitFor();
  if (name) await p.getByLabel('Your name').fill(name);
  if (mode === 'in') await p.getByRole('button', { name: 'I’m in', exact: true }).click();
  if (mode === 'out') await p.getByRole('button', { name: 'Not this time' }).click();
  if (mode === 'cond') {
    await p.getByRole('button', { name: 'I’m in, only if…' }).click();
    if (min) {
      await p.locator('#cond-min').check();
      const out = p.locator('#cond-panel output');
      while (Number(await out.textContent()) < min) await p.locator('#cond-panel').getByRole('button', { name: 'More' }).click();
      while (Number(await out.textContent()) > min) await p.locator('#cond-panel').getByRole('button', { name: 'Fewer' }).click();
    }
    for (const n of names) await p.locator('#cond-panel').getByRole('button', { name: n, exact: true }).click();
    await p.getByRole('button', { name: 'Save my answer' }).click();
  }
  await p.locator('.mine-answer').waitFor();
}

let planId;
try {
  const ana = await person('Ana', DESKTOP);
  const A = ana.page;

  step('home page renders, template fills the form');
  await A.goto(BASE);
  await shot(A, 'home-desktop.png');
  await A.getByRole('button', { name: 'Ski trip' }).click();
  assert.equal(await A.getByLabel('What’s the plan?').inputValue(), 'Ski weekend');
  assert.equal(await A.locator('#target').textContent(), '6');
  await A.getByRole('button', { name: 'Fewer' }).click();
  await A.getByRole('button', { name: 'Fewer' }).click(); // target 4

  step('validation: name is required');
  await A.getByRole('button', { name: 'Create the link' }).click();
  await A.getByText('Add your name so friends know who’s asking.').waitFor();
  await A.getByLabel('Your name').fill('Ana');
  await A.getByRole('button', { name: 'Create the link' }).click();
  await A.waitForURL(/\/p\/[A-Za-z0-9]+$/);
  planId = new URL(A.url()).pathname.split('/')[2];
  await A.getByRole('heading', { name: 'Your plan is ready' }).waitFor();
  await A.getByText('1 of 4').waitFor();
  await shot(A, 'plan-new-desktop.png');

  step('share copies the link (desktop has no Web Share)');
  await A.getByRole('button', { name: 'Send to the group' }).click();
  const clip = await A.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes(`/p/${planId}`), clip);
  assert.ok(clip.includes('it’s on if 4 are in'), clip);

  step('link preview shows the live count');
  assert.equal(await ogTitle(planId), 'Ski weekend · 1 of 4 in');

  step('Ben is in; Cy is in only if Ben comes and at least 5 go; Dee says not this time');
  const ben = await person('Ben', PHONE); const B = ben.page;
  await answer(B, { name: 'Ben', mode: 'in' });
  await B.getByText('2 of 4').waitFor();
  const cy = await person('Cy', PHONE); const C = cy.page;
  await C.goto(`${BASE}/p/${planId}`);
  await C.getByLabel('Your name').fill('Cy');
  await C.getByRole('button', { name: 'I’m in, only if…' }).click();
  await shot(C, 'plan-condition-phone.png');
  await answer(C, { name: 'Cy', mode: 'cond', min: 5, names: ['Ben'] });
  await C.getByText('You’re in, only if at least 5 are going and Ben is going.').waitFor();
  await C.getByText('1 more is in if their conditions are met.').waitFor();
  const dee = await person('Dee', PHONE); const D = dee.page;
  await answer(D, { name: 'Dee', mode: 'out' });
  await D.getByText('You said not this time.').waitFor();
  await shot(D, 'plan-open-phone.png');

  step('sealed: no API response reveals another person’s answer before the tip');
  for (const v of [await anonView(planId), await rawView(A, planId), await rawView(B, planId)]) {
    assert.equal(v.state, 'open');
    assert.equal(v.count, 2);
    assert.equal(v.going, undefined);
    assert.equal(v.lines, undefined);
    for (const p of v.people) assert.deepEqual(Object.keys(p).sort(), ['id', 'name']);
    const s = JSON.stringify(v);
    assert.ok(!/"status"/.test(s.replace(/"me":\{[^}]*\}/, '')), 'only my own status may appear');
  }
  assert.equal((await rawView(A, planId)).me.isCreator, true);
  assert.equal((await rawView(B, planId)).me.status, 'in');

  step('the creator sees only the count, live, without reloading');
  await A.getByText('2 of 4').waitFor({ timeout: 15000 });
  await A.getByText('Opened by 4 (answers sealed)').waitFor();

  step('Eve is in only if at least 4 go: Ana, Ben, Cy, Eve = 4, but Cy needs 5, so Cy drops, then Eve drops: no tip');
  const eve = await person('Eve', PHONE); const E = eve.page;
  await answer(E, { name: 'Eve', mode: 'cond', min: 4 });
  await E.getByText('2 more are in if their conditions are met.').waitFor();
  await E.getByText('Waiting', { exact: false }).first().waitFor().catch(() => {});
  assert.equal((await anonView(planId)).state, 'open');
  assert.equal((await anonView(planId)).waiting, 2);

  step('Fay is in (firm): now 5 are in, every condition holds, and it tips with 5 going');
  const fay = await person('Fay', PHONE); const F = fay.page;
  await answer(F, { name: 'Fay', mode: 'in' });
  await F.getByRole('heading', { name: 'It’s on! 🎉' }).waitFor();
  await F.getByText('5 are going').waitFor();
  const tipped = await anonView(planId);
  assert.equal(tipped.state, 'on');
  assert.deepEqual(tipped.going.map((g) => g.name).sort(), ['Ana', 'Ben', 'Cy', 'Eve', 'Fay']);
  assert.deepEqual(tipped.lines, [{ count: 1, kind: 'name', name: 'Ben' }, { count: 2, kind: 'min' }]);
  assert.ok(!JSON.stringify(tipped).includes('Dee'), 'who said not this time is never revealed');
  assert.equal(tipped.peopleCount, 6);
  await F.getByText('1 person was in only if Ben came 👀').waitFor();
  await F.getByText('6 people opened this plan.').waitFor();
  assert.equal(await ogTitle(planId), 'It’s on! 5 going · Ski weekend');
  await shot(F, 'plan-tipped-phone.png');

  step('the creator’s page flips to the tip without a reload');
  await A.getByRole('heading', { name: 'It’s on! 🎉' }).waitFor({ timeout: 15000 });
  await shot(A, 'plan-tipped-desktop.png');

  step('save the card (desktop download of a PNG)');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.getByRole('button', { name: 'Save the card' }).click()]);
  const cardPath = path.join(SHOTS, 'card.png');
  await dl.saveAs(cardPath);
  assert.ok(fs.statSync(cardPath).size > 20000, 'card PNG has content');

  step('after the tip: Dee changes her mind and comes too; Dee sees only the going list');
  await D.reload();
  await D.getByRole('button', { name: 'Change' }).click();
  await D.getByRole('heading', { name: 'Want to come too?' }).waitFor();
  await D.getByRole('button', { name: 'I’m in', exact: true }).click();
  await D.getByText('6 are going').waitFor();

  step('Ben leaves after the tip: Cy (only if Ben) drops, the plan stays on with 4');
  await B.reload();
  B.once('dialog', (d) => d.accept());
  await B.getByRole('button', { name: 'Leave this plan' }).click();
  await B.getByRole('heading', { name: 'Want to come too?' }).waitFor();
  const afterLeave = await anonView(planId);
  assert.equal(afterLeave.state, 'on');
  assert.deepEqual(afterLeave.going.map((g) => g.name).sort(), ['Ana', 'Dee', 'Eve', 'Fay']);
  await C.reload();
  await C.getByText('Waiting on your condition').waitFor();

  step('creator edits the title (number and deadline are fixed after the tip)');
  await A.getByRole('button', { name: 'Edit plan' }).click();
  await A.locator('dialog').getByText('It already tipped').waitFor();
  await A.locator('dialog').getByLabel('Plan').fill('Ski weekend in Feb');
  await A.locator('dialog').getByRole('button', { name: 'Save' }).click();
  await A.getByRole('heading', { name: 'Ski weekend in Feb' }).waitFor();

  step('personal link restores an answer on a new device');
  await A.getByRole('button', { name: 'Open on another device' }).click();
  const personal = await A.evaluate(() => navigator.clipboard.readText());
  assert.ok(personal.includes('#k='));
  const ana2 = await person('Ana2', PHONE);
  await ana2.page.goto(personal);
  await ana2.page.getByRole('heading', { name: 'You made this plan' }).waitFor();
  assert.ok(!ana2.page.url().includes('#k='), 'token is stripped from the address bar');

  if (LOCAL) {
    step('expiry (local only): a plan that closes without tipping reveals nothing');
    await A.goto(BASE);
    await A.getByLabel('What’s the plan?').fill('Drinks on Friday');
    await A.getByLabel('Your name').fill('Ana');
    await A.getByRole('button', { name: 'Create the link' }).click();
    await A.waitForURL(/\/p\/[A-Za-z0-9]+$/);
    const id2 = new URL(A.url()).pathname.split('/')[2];
    await B.goto(`${BASE}/p/${id2}`);
    await B.getByLabel('Your name').fill('Ben');
    await B.getByRole('button', { name: 'I’m in', exact: true }).click();
    await B.locator('.mine-answer').waitFor();
    assert.equal((await fetch(`${BASE}/api/__test/expire/${id2}`, { method: 'POST' })).status, 200);
    const exp = await anonView(id2);
    assert.equal(exp.state, 'expired');
    assert.deepEqual(exp.people, []);
    assert.equal(exp.going, undefined);
    assert.ok(!JSON.stringify(exp).includes('Ben'));
    assert.equal(await ogTitle(id2), 'Drinks on Friday · closed');
    await B.reload();
    await B.getByRole('heading', { name: 'This one didn’t tip' }).waitFor();
    await shot(B, 'plan-expired-phone.png');
    step('the creator reopens it with a new deadline');
    await A.reload();
    await A.getByRole('button', { name: 'Reopen with a new deadline' }).click();
    await A.locator('dialog').getByRole('button', { name: 'Save' }).click();
    await A.getByText('2 of 6').waitFor();
    A.once('dialog', (d) => d.accept());
    await A.getByRole('button', { name: 'Delete' }).click();
    await A.waitForURL(`${BASE}/`);
    await A.goto(`${BASE}/p/${planId}`);
  }

  step('home lists the plan; delete removes it for everyone');
  await A.goto(BASE);
  await A.locator('#mine').getByText('Ski weekend in Feb').waitFor();
  await A.goto(`${BASE}/p/${planId}`);
  A.once('dialog', (d) => d.accept());
  await A.getByRole('button', { name: 'Delete' }).click();
  await A.waitForURL(`${BASE}/`);
  await E.reload();
  await E.getByRole('heading', { name: 'This plan is gone' }).waitFor();
  assert.equal((await fetch(`${BASE}/api/plans/${planId}`)).status, 404);

  step('home and privacy at phone width');
  await F.goto(BASE);
  await shot(F, 'home-phone.png');
  await F.goto(`${BASE}/privacy`);
  await F.getByRole('heading', { name: 'Privacy' }).waitFor();

  assert.deepEqual(errors, [], 'no console errors');
  console.log(`PASS (${BASE})`);
} finally {
  await browser.close();
}
