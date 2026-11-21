import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, planState, conditionLines } from '../../lib/resolve.js';

const m = (id, status = 'in', condMin = null, condNames = []) => ({ id, status, condMin, condNames });
const sorted = (a) => [...a].sort();

test('firm yeses all go; outs and blanks never count', () => {
  const r = resolve([m('a'), m('b'), m('c', 'out'), m('d', null)]);
  assert.deepEqual(sorted(r.going), ['a', 'b']);
  assert.deepEqual(r.waiting, []);
});

test('"only if at least N" holds only when N are going', () => {
  assert.deepEqual(sorted(resolve([m('a'), m('b'), m('c', 'in', 4)]).going), ['a', 'b']);
  assert.deepEqual(resolve([m('a'), m('b'), m('c', 'in', 4)]).waiting, ['c']);
  assert.equal(resolve([m('a'), m('b'), m('c', 'in', 3)]).going.length, 3);
});

test('mutual min conditions all hold together (largest fixed point)', () => {
  const r = resolve([m('a', 'in', 5), m('b', 'in', 5), m('c', 'in', 5), m('d', 'in', 5), m('e', 'in', 5)]);
  assert.equal(r.going.length, 5);
  const r2 = resolve([m('a', 'in', 5), m('b', 'in', 5), m('c', 'in', 5), m('d', 'in', 5)]);
  assert.equal(r2.going.length, 0);
});

test('cascade: dropping one person can drop others who needed them', () => {
  // d needs at least 5; a needs d; with only 4 in, d drops, then a drops.
  const r = resolve([m('a', 'in', null, ['d']), m('b'), m('c'), m('d', 'in', 5)]);
  assert.deepEqual(sorted(r.going), ['b', 'c']);
  assert.deepEqual(sorted(r.waiting), ['a', 'd']);
});

test('name conditions: mutual "only if you come" pairs go together', () => {
  const r = resolve([m('a', 'in', null, ['b']), m('b', 'in', null, ['a'])]);
  assert.deepEqual(sorted(r.going), ['a', 'b']);
});

test('name condition on someone who is out or blank fails', () => {
  assert.deepEqual(resolve([m('a', 'in', null, ['b']), m('b', 'out')]).going, []);
  assert.deepEqual(resolve([m('a', 'in', null, ['zz'])]).going, []);
});

test('a condition naming yourself is ignored', () => {
  assert.deepEqual(resolve([m('a', 'in', null, ['a'])]).going, ['a']);
});

test('planState: tips when going reaches target before the deadline', () => {
  const plan = { target: 3, deadline: 1000, tippedAt: null };
  const s = planState(plan, [m('a'), m('b'), m('c')], 500);
  assert.equal(s.tipsNow, true);
  assert.equal(s.tipped, true);
  assert.equal(s.open, false);
});

test('planState: conditional yeses that do not hold do not tip', () => {
  const plan = { target: 3, deadline: 1000, tippedAt: null };
  const s = planState(plan, [m('a'), m('b'), m('c', 'in', 4)], 500);
  assert.equal(s.tipped, false);
  assert.equal(s.open, true);
  assert.equal(s.going.length, 2);
});

test('planState: past the deadline without a tip it expires and cannot tip', () => {
  const plan = { target: 2, deadline: 1000, tippedAt: null };
  const s = planState(plan, [m('a'), m('b')], 1000);
  assert.equal(s.expired, true);
  assert.equal(s.tipped, false);
  assert.equal(s.tipsNow, false);
});

test('planState: once tipped it stays tipped, even after withdrawals or the deadline', () => {
  const plan = { target: 3, deadline: 1000, tippedAt: 400 };
  const s = planState(plan, [m('a')], 5000);
  assert.equal(s.tipped, true);
  assert.equal(s.expired, false);
  assert.equal(s.tipsNow, false);
});

test('conditionLines: counts only, grouped by name, ignores conditions outside the going set', () => {
  const ms = [m('t'), m('a', 'in', null, ['t']), m('b', 'in', 3, ['t']), m('c'), m('x', 'in', 99)];
  const going = resolve(ms).going;
  const lines = conditionLines(ms, going, (id) => ({ t: 'Tom' })[id]);
  assert.deepEqual(lines, [{ count: 2, kind: 'name', name: 'Tom' }, { count: 1, kind: 'min' }]);
});
