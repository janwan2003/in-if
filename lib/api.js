// InIf API. Runs inside the Durable Object of the Worker pb-in-if-db (worker/index.js),
// with `env.DB` a D1-style shim over the object's SQLite storage.
// Answers are sealed: before a plan tips, nobody (the creator included) can read
// anyone else's answer. After the tip only the going list is revealed; who said
// "not this time" is never revealed, and an expired plan reveals no answers.
import { planState, conditionLines } from './resolve.js';

const LIMITS = { create: 20, join: 60, write: 600 }; // per IP per hour
const MAX_MEMBERS = 200;
const DAY = 86400000;
const KEEP_AFTER_DEADLINE = 120 * DAY;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ALPHA = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function rid(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const x of b) s += ALPHA[x % ALPHA.length];
  return s;
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clean(v, max, field, required = false) {
  if (v == null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text`);
  v = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !v) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return v;
}
const cleanDetails = (v) => {
  if (v == null) return '';
  if (typeof v !== 'string') throw new HttpError(400, 'Details must be text');
  v = v.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (v.length > 400) throw new HttpError(400, 'Details are too long (max 400)');
  return v;
};
const nameKey = (n) => n.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function intIn(v, lo, hi, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${field} must be a whole number from ${lo} to ${hi}`);
  return n;
}
function deadlineOk(v, now) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Pick a closing time');
  if (n < now + 5 * 60000) throw new HttpError(400, 'The closing time must be at least 5 minutes from now');
  if (n > now + 180 * DAY) throw new HttpError(400, 'The closing time must be within 6 months');
  return Math.round(n);
}

async function rateLimit(env, request, bucket) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const hour = Math.floor(Date.now() / 3600000);
  const key = `${bucket}:${(await sha(`${ip}|in-if|${hour}`)).slice(0, 24)}:${hour}`;
  const row = await env.DB.prepare(
    'INSERT INTO rate (key, n, reset_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(key, (hour + 1) * 3600000).first();
  if (row.n > LIMITS[bucket]) throw new HttpError(429, 'Too many requests from your network. Try again in a while.');
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser clients; browsers always send Origin on POST/PUT/PATCH/DELETE
  return origin === new URL(request.url).origin;
}

async function body(request) {
  try {
    const b = await request.json();
    if (!b || typeof b !== 'object') throw new Error();
    return b;
  } catch {
    throw new HttpError(400, 'Invalid request');
  }
}

async function loadPlan(env, id) {
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) throw new HttpError(404, 'Plan not found');
  const p = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Plan not found');
  const { results } = await env.DB.prepare(
    'SELECT id, name, token_hash, status, cond_min, cond_names, created_at FROM members WHERE plan_id = ? ORDER BY created_at, id',
  ).bind(id).all();
  const members = results.map((r) => ({
    id: r.id, name: r.name, tokenHash: r.token_hash, status: r.status,
    condMin: r.cond_min, condNames: JSON.parse(r.cond_names || '[]'), createdAt: r.created_at,
  }));
  return { plan: p, members };
}

const stateInput = (p) => ({ target: p.target, deadline: p.deadline, tippedAt: p.tipped_at });

async function whoAmI(request, planId, members) {
  const t = request.headers.get('x-member-token');
  if (!t || t.length > 64) return null;
  const h = await sha(`${planId}:${t}`);
  return members.find((m) => m.tokenHash === h) || null;
}

// Record the tip the first time the going set reaches the target before the deadline.
async function settle(env, plan, members) {
  const s = planState(stateInput(plan), members);
  if (s.tipsNow) {
    const now = Date.now();
    await env.DB.prepare('UPDATE plans SET tipped_at = ?, tipped_count = ?, updated_at = ? WHERE id = ? AND tipped_at IS NULL')
      .bind(now, s.going.length, now, plan.id).run();
    plan.tipped_at = now;
    plan.tipped_count = s.going.length;
  }
  return s;
}

// The only view of a plan the API ever returns.
function view(plan, members, me) {
  const s = planState(stateInput(plan), members);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || '';
  const out = {
    plan: {
      id: plan.id, title: plan.title, when: plan.when_text, details: plan.details,
      target: plan.target, deadline: plan.deadline, createdAt: plan.created_at,
      tippedAt: plan.tipped_at || null, tippedCount: plan.tipped_count || null,
      creatorName: nameOf(plan.creator_id),
    },
    state: s.tipped ? 'on' : s.expired ? 'expired' : 'open',
    count: s.going.length,
    waiting: s.waiting.length,
    // Everyone who has opened the plan and given a name. Their answers are not included.
    people: members.map((m) => ({ id: m.id, name: m.name })),
    now: Date.now(),
  };
  out.peopleCount = members.length;
  if (s.tipped || s.expired) {
    // After the tip or the deadline, names of people who are not going stay private:
    // "opened it but isn't on the going list" would hint at who said no.
    const keep = new Set(s.tipped ? s.going : []);
    if (me) keep.add(me.id);
    out.people = out.people.filter((x) => keep.has(x.id));
    out.waiting = 0;
  }
  if (s.tipped) {
    out.going = s.going.map((id) => ({ id, name: nameOf(id) }));
    out.lines = conditionLines(members, s.going, nameOf);
  }
  if (me) {
    out.me = {
      id: me.id, name: me.name, status: me.status, condMin: me.condMin, condNames: me.condNames,
      isCreator: me.id === plan.creator_id, going: s.going.includes(me.id), waiting: s.waiting.includes(me.id),
    };
  }
  return out;
}

async function addMember(env, planId, name, now) {
  const id = rid(10);
  const token = rid(24);
  try {
    await env.DB.prepare(
      'INSERT INTO members (id, plan_id, name, name_key, token_hash, status, cond_min, cond_names, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, \'[]\', ?, ?)',
    ).bind(id, planId, name, nameKey(name), await sha(`${planId}:${token}`), now, now).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message || e))) throw new HttpError(409, `Someone here is already called “${name}”. Add an initial?`);
    throw e;
  }
  return { id, token };
}

function readAnswer(b, members, me) {
  const status = b.status === 'in' || b.status === 'out' ? b.status : null;
  let condMin = null;
  let condNames = [];
  if (status === 'in') {
    if (b.condMin != null && b.condMin !== '') condMin = intIn(b.condMin, 2, MAX_MEMBERS, 'Minimum');
    if (Array.isArray(b.condNames)) {
      const ids = new Set(members.map((m) => m.id));
      condNames = [...new Set(b.condNames)].filter((id) => typeof id === 'string' && ids.has(id) && id !== me.id).slice(0, 20);
    }
  }
  return { status, condMin, condNames };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  if (method !== 'GET' && !sameOrigin(request)) throw new HttpError(403, 'Cross-site request blocked');
  const now = Date.now();

  // Local test hook: move a plan's deadline into the past. Only when TEST_HOOKS=1 (worker/.dev.vars), never in production.
  if (parts[0] === '__test' && parts[1] === 'expire' && env.TEST_HOOKS === '1' && method === 'POST') {
    await env.DB.prepare('UPDATE plans SET deadline = ? WHERE id = ?').bind(now - 1000, parts[2]).run();
    return json({ ok: true });
  }
  // Aggregate usage counts for the operator's weekly metrics. Counts only, no names or plan text.
  // Needs the Worker secret STATS_KEY in the x-stats-key header; without it the route does not exist.
  if (parts[0] === '__stats' && method === 'GET') {
    const key = request.headers.get('x-stats-key') || '';
    if (!env.STATS_KEY || key.length !== env.STATS_KEY.length || (await sha(key)) !== (await sha(env.STATS_KEY))) throw new HttpError(404, 'Not found');
    return json(await stats(env, now));
  }
  if (parts[0] !== 'plans') throw new HttpError(404, 'Not found');

  // POST /api/plans: create a plan; the creator joins it as the first person.
  if (parts.length === 1 && method === 'POST') {
    await rateLimit(env, request, 'create');
    const b = await body(request);
    const title = clean(b.title, 80, 'Plan', true);
    const when = clean(b.when, 60, 'When');
    const details = cleanDetails(b.details);
    const target = intIn(b.target, 2, MAX_MEMBERS, 'People needed');
    const deadline = deadlineOk(b.deadline, now);
    const name = clean(b.name, 24, 'Your name', true);
    const id = rid(8);
    const memberId = rid(10);
    const token = rid(24);
    const status = b.in === false ? null : 'in';
    await env.DB.batch([
      env.DB.prepare('INSERT INTO plans (id, title, when_text, details, target, deadline, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, title, when, details, target, deadline, memberId, now, now),
      env.DB.prepare('INSERT INTO members (id, plan_id, name, name_key, token_hash, status, cond_min, cond_names, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, \'[]\', ?, ?)')
        .bind(memberId, id, name, nameKey(name), await sha(`${id}:${token}`), status, now, now),
    ]);
    // Housekeeping without a cron: old plans and spent rate-limit rows.
    const old = now - KEEP_AFTER_DEADLINE;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM members WHERE plan_id IN (SELECT id FROM plans WHERE deadline < ? AND updated_at < ?)').bind(old, old),
      env.DB.prepare('DELETE FROM plans WHERE deadline < ? AND updated_at < ?').bind(old, old),
      env.DB.prepare('DELETE FROM rate WHERE reset_at < ?').bind(now),
    ]);
    return json({ id, token, memberId }, 201);
  }

  const planId = parts[1];
  if (!planId) throw new HttpError(404, 'Not found');
  const action = parts[2] || '';

  if (!action && method === 'GET') {
    const { plan, members } = await loadPlan(env, planId);
    await settle(env, plan, members);
    return json(view(plan, members, await whoAmI(request, planId, members)));
  }

  await rateLimit(env, request, action === 'join' ? 'join' : 'write');
  const { plan, members } = await loadPlan(env, planId);
  const me = await whoAmI(request, planId, members);

  // POST /api/plans/:id/join {name}
  if (action === 'join' && method === 'POST') {
    const b = await body(request);
    const name = clean(b.name, 24, 'Your name', true);
    if (members.length >= MAX_MEMBERS) throw new HttpError(409, 'This plan is full');
    const s = planState(stateInput(plan), members);
    if (s.expired) throw new HttpError(409, 'This plan has closed');
    const added = await addMember(env, planId, name, now);
    const after = await loadPlan(env, planId);
    return json({ ...added, view: view(after.plan, after.members, after.members.find((m) => m.id === added.id)) }, 201);
  }

  if (!me) throw new HttpError(401, 'Join this plan first');

  // PUT /api/plans/:id/answer {status, condMin, condNames}
  if (action === 'answer' && method === 'PUT') {
    const s = planState(stateInput(plan), members);
    if (s.expired) throw new HttpError(409, 'This plan has closed');
    const a = readAnswer(await body(request), members, me);
    await env.DB.prepare('UPDATE members SET status = ?, cond_min = ?, cond_names = ?, updated_at = ? WHERE id = ?')
      .bind(a.status, a.condMin, JSON.stringify(a.condNames), now, me.id).run();
    Object.assign(me, a);
    await settle(env, plan, members);
    await env.DB.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').bind(now, planId).run();
    return json(view(plan, members, me));
  }

  // PATCH /api/plans/:id (creator) {title, when, details, target, deadline}
  if (!action && method === 'PATCH') {
    if (me.id !== plan.creator_id) throw new HttpError(403, 'Only the person who made this plan can edit it');
    const b = await body(request);
    if ('title' in b) plan.title = clean(b.title, 80, 'Plan', true);
    if ('when' in b) plan.when_text = clean(b.when, 60, 'When');
    if ('details' in b) plan.details = cleanDetails(b.details);
    if (!plan.tipped_at) {
      if ('target' in b) plan.target = intIn(b.target, 2, MAX_MEMBERS, 'People needed');
      if ('deadline' in b) plan.deadline = deadlineOk(b.deadline, now);
    }
    await env.DB.prepare('UPDATE plans SET title = ?, when_text = ?, details = ?, target = ?, deadline = ?, updated_at = ? WHERE id = ?')
      .bind(plan.title, plan.when_text, plan.details, plan.target, plan.deadline, now, planId).run();
    await settle(env, plan, members);
    return json(view(plan, members, me));
  }

  // DELETE /api/plans/:id (creator)
  if (!action && method === 'DELETE') {
    if (me.id !== plan.creator_id) throw new HttpError(403, 'Only the person who made this plan can delete it');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM members WHERE plan_id = ?').bind(planId),
      env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(planId),
    ]);
    return json({ ok: true });
  }

  // DELETE /api/plans/:id/me: leave (removes your name and answer)
  if (action === 'me' && method === 'DELETE') {
    if (me.id === plan.creator_id) throw new HttpError(409, 'You made this plan, so you cannot leave it. You can delete it instead.');
    await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(me.id).run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

async function stats(env, now) {
  const n = async (q, ...a) => (await env.DB.prepare(q).bind(...a).first()).n;
  const wk = now - 7 * DAY, wk2 = now - 14 * DAY;
  const joiners = 'SELECT COUNT(*) AS n FROM members WHERE created_at >= ? AND created_at < ? AND id NOT IN (SELECT creator_id FROM plans)';
  return {
    at: new Date(now).toISOString(),
    plansTotal: await n('SELECT COUNT(*) AS n FROM plans'),
    plansTipped: await n('SELECT COUNT(*) AS n FROM plans WHERE tipped_at IS NOT NULL'),
    plansOpenNow: await n('SELECT COUNT(*) AS n FROM plans WHERE deadline > ?', now),
    peopleTotal: await n('SELECT COUNT(*) AS n FROM members'),
    newCreators7d: await n('SELECT COUNT(*) AS n FROM plans WHERE created_at >= ?', wk),
    newCreatorsPrev7d: await n('SELECT COUNT(*) AS n FROM plans WHERE created_at >= ? AND created_at < ?', wk2, wk),
    newJoiners7d: await n(joiners, wk, now + 1),
    newJoinersPrev7d: await n(joiners, wk2, wk),
    activePeople7d: await n('SELECT COUNT(*) AS n FROM members WHERE updated_at >= ?', wk),
    note: 'Rows are deleted ~120 days after a plan closes, and when a creator deletes a plan or a person leaves.',
  };
}

export async function handleApi(request, env) {
  try {
    return await handle(request, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
}

// Data for the link preview of /p/<id>.
export async function previewData(env, id) {
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  const p = await env.DB.prepare('SELECT title, target, deadline, tipped_at FROM plans WHERE id = ?').bind(id).first();
  if (!p) return null;
  const { results } = await env.DB.prepare('SELECT id, status, cond_min, cond_names FROM members WHERE plan_id = ?').bind(id).all();
  const s = planState({ target: p.target, deadline: p.deadline, tippedAt: p.tipped_at },
    results.map((r) => ({ id: r.id, status: r.status, condMin: r.cond_min, condNames: JSON.parse(r.cond_names || '[]') })));
  return { title: p.title, target: p.target, deadline: p.deadline, count: s.going.length, state: s.tipped ? 'on' : s.expired ? 'expired' : 'open' };
}
