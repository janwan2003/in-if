import { $, h, api, toast, share, savePlan, forgetPlan, myPlans, fmtDeadline, fmtLeft, fmtAhead, LOCK } from '/common.js';

const id = location.pathname.split('/')[2] || '';
const app = $('#app');
let token = null;
let v = null; // latest view from the API
let editing = false; // answer editor open: don't redraw it under the user's fingers
let draft = null; // { mode: 'in'|'cond'|'out', condMin, condNames:Set }
let isNew = false;
let busy = false;
let pendingName = null; // name typed before joining, kept across redraws

// Personal link: #k=<token> restores your answer on another device.
{
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('k')) {
    token = hash.get('k');
    savePlan(id, { token });
  }
  if (location.hash.includes('new')) isNew = true;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  token = token || myPlans()[id]?.token || null;
}

const planUrl = () => `${location.origin}/p/${id}`;
const lock = () => { const s = h('span'); s.innerHTML = LOCK; return s.firstChild; };

async function load() {
  try {
    v = await api(`plans/${id}`, { token });
    if (token && !v.me) { token = null; forgetPlan(id); }
    if (v.me) savePlan(id, { token, title: v.plan.title, mine: v.me.isCreator });
    document.title = `${v.plan.title} · InIf`;
    render();
  } catch (e) {
    if (e.status === 404) {
      forgetPlan(id);
      app.replaceChildren(h('div', { class: 'card expired-card' },
        h('h1', { text: 'This plan is gone' }),
        h('p', { class: 'muted', text: 'It was deleted, or the link is wrong.' }),
        h('a', { class: 'btn primary', href: '/', text: 'Start a plan' })));
    } else if (!v) {
      app.replaceChildren(h('div', { class: 'card expired-card' }, h('p', { text: e.message }), h('button', { class: 'btn', onclick: load, text: 'Try again' })));
    }
  }
}

function render() {
  const p = v.plan;
  const sections = [head(p), status(p)];
  if (isNew && v.state === 'open') sections.push(sharePrompt(p, true));
  if (v.state !== 'expired') sections.push(answer(p));
  else if (v.me) sections.push(h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin:0' }, 'Your answer stays private. ', yourAnswerText())));
  if (!isNew && v.state === 'open') sections.push(sharePrompt(p, false));
  sections.push(people());
  if (v.me?.isCreator) sections.push(creatorTools(p));
  else if (v.me) sections.push(memberTools());
  sections.push(cta());
  app.replaceChildren(...sections.filter(Boolean));
}

function head(p) {
  const left = p.deadline - Date.now();
  const pill = v.state === 'on'
    ? h('span', { class: 'pill on', text: `It’s on · ${v.count} going` })
    : v.state === 'expired'
      ? h('span', { class: 'pill off', text: 'Closed · didn’t tip' })
      : h('span', { class: 'pill' }, `Open · closes ${fmtDeadline(p.deadline)}`, h('span', { class: 'muted', style: 'font-weight:600', text: `· ${fmtLeft(left)}` }));
  return h('section', { class: 'plan-head', style: 'margin-bottom:16px' },
    pill,
    h('h1', { text: p.title }),
    p.when ? h('div', { class: 'plan-meta', text: p.when }) : null,
    p.details ? h('div', { class: 'plan-details', text: p.details }) : null,
    h('div', { class: 'muted small', style: 'margin-top:8px', text: `Started by ${p.creatorName || 'someone'} · it’s on if ${p.target} are in` }));
}

function meter(count, waiting, target) {
  const dots = [];
  for (let i = 0; i < Math.min(target, 40); i++) {
    dots.push(h('span', { class: `dot ${i < count ? 'in' : i < count + waiting ? 'wait' : ''}` }));
  }
  if (count > target) dots.push(h('span', { class: 'dot extra', text: `+${count - target}` }));
  return h('div', { class: 'meter', 'aria-hidden': 'true' }, dots);
}

function status(p) {
  if (v.state === 'on') return tipCard(p);
  if (v.state === 'expired') {
    return h('div', { class: 'card expired-card' },
      h('h2', { text: 'This one didn’t tip' }),
      h('p', { class: 'muted', text: `${v.count} of ${p.target} were in when it closed. Nobody’s answer was revealed, so nobody was left hanging.` }),
      v.me?.isCreator ? h('p', { class: 'small muted', style: 'margin:0', text: 'You can reopen it with a new closing time below.' }) : null);
  }
  const need = Math.max(0, p.target - v.count);
  return h('div', { class: 'card', 'aria-live': 'polite' },
    meter(v.count, Math.min(v.waiting, need), p.target),
    h('div', { class: 'count' }, `${v.count} of ${p.target} `, h('small', { text: 'are in' })),
    h('p', { class: 'muted', style: 'margin:4px 0 0' },
      need ? `${need} more needed by ${fmtDeadline(p.deadline)}.` : '',
      v.waiting ? ` ${v.waiting} more ${v.waiting === 1 ? 'is' : 'are'} in if their conditions are met.` : ''),
    h('div', { class: 'sealed' }, lock(), h('span', {}, h('strong', { text: 'Answers are sealed. ' }), 'Nobody, not even the organiser, sees who’s in until it tips. If it doesn’t, no answer is ever shown.')));
}

function tipCard(p) {
  const ahead = p.tippedAt && p.deadline > p.tippedAt ? `Tipped ${fmtAhead(p.deadline - p.tippedAt)} before the deadline.` : 'It tipped.';
  const lines = (v.lines || []).map((l) => h('div', { class: 'line', text: l.kind === 'name'
    ? `${l.count} ${l.count === 1 ? 'person was' : 'people were'} in only if ${l.name} came 👀`
    : `${l.count} ${l.count === 1 ? 'person was' : 'people were'} in only if enough others came` }));
  return h('div', { class: 'tip', 'aria-live': 'polite' },
    h('h2', { text: 'It’s on! 🎉' }),
    h('div', { style: 'font-size:1.15rem;font-weight:700', text: `${v.count} ${v.count === 1 ? 'is' : 'are'} going` }),
    h('div', { class: 'names' }, (v.going || []).map((g) => h('span', { text: g.name }))),
    h('div', { style: 'opacity:.9', text: ahead }),
    lines,
    h('div', { class: 'btns' },
      h('button', { class: 'btn white', onclick: () => share({ title: p.title, text: `It’s on! ${v.count} going: ${p.title}${p.when ? ` (${p.when})` : ''}.`, url: planUrl() }), text: 'Tell the group' }),
      h('button', { class: 'btn clear', onclick: () => saveCard(p), text: 'Save the card' })));
}

function yourAnswerText() {
  const m = v.me;
  if (!m || !m.status) return 'You haven’t answered.';
  if (m.status === 'out') return 'You said not this time.';
  const conds = condText(m.condMin, m.condNames);
  return conds ? `You’re in, only if ${conds}.` : 'You’re in.';
}
function condText(condMin, condNames) {
  const names = (condNames || []).map((cid) => v.people.find((x) => x.id === cid)?.name).filter(Boolean);
  const parts = [];
  if (condMin) parts.push(`at least ${condMin} are going`);
  if (names.length) parts.push(`${listJoin(names)} ${names.length === 1 ? 'is' : 'are'} going`);
  return parts.join(' and ');
}
const listJoin = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

function answer(p) {
  const m = v.me;
  if (m && m.status && !editing) {
    let badge;
    if (m.status === 'out') badge = h('span', { class: 'badge out', text: 'Not this time' });
    else if (v.state === 'on') badge = m.going ? h('span', { class: 'badge going', text: 'Going' }) : h('span', { class: 'badge wait', text: 'Waiting on your condition' });
    else badge = m.waiting ? h('span', { class: 'badge wait', text: 'In, if…' }) : h('span', { class: 'badge in', text: 'In' });
    return h('div', { class: 'card', id: 'answer' },
      h('div', { class: 'muted small', style: 'font-weight:700;margin-bottom:6px' }, v.state === 'on' ? `Your answer, ${m.name}` : `Your answer, ${m.name} (only you can see it)`),
      h('div', { class: 'mine-answer' },
        h('div', {}, badge, ' ', h('strong', { text: yourAnswerText() })),
        h('button', { class: 'btn ghost', onclick: () => { editing = true; draft = null; render(); }, text: 'Change' })),
      m.status === 'in' && m.waiting && v.state === 'open' ? h('p', { class: 'muted small', style: 'margin:10px 0 0', text: 'Your condition isn’t met yet, so you’re not in the count. You will be as soon as it is.' }) : null);
  }
  if (!draft) {
    draft = { mode: m?.status === 'out' ? 'out' : m?.status === 'in' && (m.condMin || m.condNames?.length) ? 'cond' : m?.status === 'in' ? 'in' : null,
      condMin: m?.condMin || null, condNames: new Set(m?.condNames || []) };
  }
  const nameInput = m ? null : h('label', { class: 'field' }, h('span', { text: 'Your name' }),
    h('input', { type: 'text', id: 'name', maxlength: '24', placeholder: 'As the group knows you', autocomplete: 'nickname', value: pendingName ?? savedName(), oninput: (e) => { pendingName = e.target.value; } }));
  const err = h('p', { class: 'err', role: 'alert', id: 'answer-err' });
  const choose = (mode) => async () => {
    draft.mode = mode;
    if (mode === 'cond') { render(); $('#cond-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    await submit(mode);
  };
  const title = v.state === 'on' ? 'Want to come too?' : m ? 'Change your answer' : 'Are you in?';
  return h('div', { class: 'card', id: 'answer' },
    h('h2', { text: title }),
    v.state === 'open' ? h('p', { class: 'muted small', text: 'Only you will see your answer unless the plan tips.' }) : null,
    nameInput,
    h('div', { class: 'answer-btns' },
      h('button', { class: 'btn primary big', 'data-answer': 'in', onclick: choose('in'), text: 'I’m in' }),
      h('div', { class: 'row' },
        h('button', { class: `btn ${draft.mode === 'cond' ? '' : 'soft'}`, 'data-answer': 'cond', 'aria-expanded': String(draft.mode === 'cond'), onclick: choose('cond'), text: 'I’m in, only if…' }),
        h('button', { class: 'btn ghost', 'data-answer': 'out', onclick: choose('out'), text: 'Not this time' }))),
    draft.mode === 'cond' ? condPanel(p) : null,
    err,
    m && editing ? h('button', { class: 'btn link', onclick: () => { editing = false; draft = null; render(); }, text: 'Keep my answer' }) : null);
}

function savedName() { try { return localStorage.getItem('inif:name') || ''; } catch { return ''; } }

function condPanel(p) {
  const others = v.people.filter((x) => x.id !== v.me?.id);
  const useMin = draft.condMin != null;
  const minOut = h('output', { text: String(draft.condMin || Math.max(p.target + 1, 3)) });
  const setMin = (n) => { draft.condMin = Math.max(2, Math.min(200, n)); minOut.textContent = draft.condMin; minBox.checked = true; };
  const minBox = h('input', { type: 'checkbox', id: 'cond-min', checked: useMin, onchange: (e) => { draft.condMin = e.target.checked ? Number(minOut.textContent) : null; } });
  return h('div', { class: 'only-if', id: 'cond-panel', style: 'margin-top:12px' },
    h('h3', { text: 'I’m in, only if…' }),
    h('label', { class: 'check', style: 'margin-bottom:8px' }, minBox, 'at least'),
    h('div', { style: 'display:flex;align-items:center;gap:12px;margin:0 0 14px 30px' },
      h('div', { class: 'stepper', role: 'group', 'aria-label': 'Minimum going' },
        h('button', { type: 'button', 'aria-label': 'Fewer', onclick: () => setMin(Number(minOut.textContent) - 1), text: '−' }),
        minOut,
        h('button', { type: 'button', 'aria-label': 'More', onclick: () => setMin(Number(minOut.textContent) + 1), text: '+' })),
      h('span', { class: 'muted', text: 'are going (me included)' })),
    h('div', { style: 'font-weight:700;margin-bottom:8px', text: 'these people are going:' }),
    others.length
      ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Only if these people are going' }, others.map((o) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(draft.condNames.has(o.id)), text: o.name,
        onclick: (e) => { draft.condNames.has(o.id) ? draft.condNames.delete(o.id) : draft.condNames.add(o.id); e.currentTarget.setAttribute('aria-pressed', String(draft.condNames.has(o.id))); },
      })))
      : h('p', { class: 'muted small', text: 'Nobody else has opened the plan yet. Come back once others have, to pick names.' }),
    h('p', { class: 'muted small', style: 'margin:12px 0' }, 'Nobody sees your condition. After a tip, the card only says things like “2 were in only if Tom came”.'),
    h('button', { class: 'btn primary block', id: 'save-cond', onclick: () => submit('cond'), text: 'Save my answer' }));
}

async function submit(mode) {
  if (busy) return;
  const err = $('#answer-err');
  if (err) err.textContent = '';
  const body = { status: mode === 'out' ? 'out' : 'in', condMin: null, condNames: [] };
  if (mode === 'cond') {
    body.condMin = draft.condMin;
    body.condNames = [...draft.condNames];
    if (!body.condMin && !body.condNames.length) { err.textContent = 'Pick a number or at least one person, or just tap “I’m in”.'; return; }
  }
  busy = true;
  try {
    if (!v.me) {
      const name = $('#name')?.value.trim();
      if (!name) { err.textContent = 'Add your name first.'; $('#name').focus(); busy = false; return; }
      const j = await api(`plans/${id}/join`, { method: 'POST', body: { name } });
      token = j.token;
      savePlan(id, { token, title: v.plan.title });
      try { localStorage.setItem('inif:name', name); } catch {}
    }
    const wasOn = v.state === 'on';
    v = await api(`plans/${id}/answer`, { method: 'PUT', body, token });
    editing = false;
    draft = null;
    render();
    if (!wasOn && v.state === 'on') toast('You tipped it! It’s on.');
    else toast(mode === 'out' ? 'Got it. Nobody will see that.' : v.state === 'on' ? 'Saved.' : 'You’re in. Sealed until it tips.');
  } catch (e) {
    if (err) err.textContent = e.message;
    if (e.status === 409 || e.status === 401) load();
  } finally {
    busy = false;
  }
}

function sharePrompt(p, fresh) {
  const text = `${p.title}${p.when ? ` (${p.when})` : ''}: it’s on if ${p.target} are in by ${fmtDeadline(p.deadline)}. Answers are sealed until it tips, so just say what you want.`;
  return h('div', { class: 'card', style: fresh ? 'border:2px solid var(--accent)' : '' },
    fresh ? h('h2', { text: 'Your plan is ready' }) : h('h3', { text: 'Get more people to answer' }),
    h('p', { class: 'muted', text: fresh ? 'Send the link to the group chat. Everyone answers in secret, and you’ll all see it tip.' : 'The more people see it, the faster it tips.' }),
    h('button', { class: 'btn primary block', id: 'share', onclick: async () => { const r = await share({ title: p.title, text, url: planUrl() }); if (fresh && r !== 'cancelled') { isNew = false; render(); } }, text: 'Send to the group' }),
    h('p', { class: 'muted small', style: 'margin:8px 0 0;word-break:break-all' }, planUrl()));
}

function people() {
  if (v.state !== 'open') {
    if (!v.peopleCount) return null;
    // After the tip or the deadline, names of people who are not going stay private.
    return h('p', { class: 'muted small', style: 'text-align:center;margin:16px 0 0', text: `${v.peopleCount} ${v.peopleCount === 1 ? 'person' : 'people'} opened this plan.` });
  }
  if (!v.people.length) return null;
  return h('div', { class: 'card people' },
    h('h3', { text: `Opened by ${v.people.length} (answers sealed)` }),
    h('div', { class: 'chips' }, v.people.map((x) => h('span', { class: 'chip static', text: x.id === v.me?.id ? `${x.name} (you)` : x.name }))));
}

function memberTools() {
  return h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px' },
    h('button', { class: 'btn link', onclick: copyPersonal, text: 'Answer from another device' }),
    h('button', { class: 'btn link', onclick: leave, text: 'Leave this plan' }));
}

async function copyPersonal() {
  const url = `${planUrl()}#k=${token}`;
  try { await navigator.clipboard.writeText(url); toast('Personal link copied. Keep it to yourself: it opens your answer.'); } catch { window.prompt('Your personal link (keep it private):', url); }
}

async function leave() {
  if (!confirm('Leave this plan? Your name and answer are removed.')) return;
  try {
    await api(`plans/${id}/me`, { method: 'DELETE', token });
    forgetPlan(id);
    token = null;
    toast('You left the plan.');
    load();
  } catch (e) { toast(e.message); }
}

function creatorTools(p) {
  return h('div', { class: 'card' },
    h('h3', { text: 'You made this plan' }),
    h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
      h('button', { class: 'btn ghost', id: 'edit', onclick: () => editDialog(p), text: v.state === 'expired' ? 'Reopen with a new deadline' : 'Edit plan' }),
      h('button', { class: 'btn danger', onclick: del, text: 'Delete' }),
      h('button', { class: 'btn link', onclick: copyPersonal, text: 'Open on another device' })),
    v.state === 'open' ? h('p', { class: 'muted small', style: 'margin:10px 0 0', text: 'You can’t see anyone’s answer either. That’s the point.' }) : null);
}

function toLocalInput(ms) {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function editDialog(p) {
  const locked = !!p.tippedAt;
  const f = (label, el) => h('label', { class: 'field' }, h('span', { text: label }), el);
  const title = h('input', { type: 'text', maxlength: '80', value: p.title });
  const when = h('input', { type: 'text', maxlength: '60', value: p.when });
  const details = h('textarea', { maxlength: '400', rows: '3' }); details.value = p.details;
  const target = h('input', { type: 'text', inputmode: 'numeric', value: String(p.target) });
  const deadline = h('input', { type: 'datetime-local', value: toLocalInput(v.state === 'expired' ? Date.now() + 2 * 86400000 : p.deadline) });
  const err = h('p', { class: 'err', role: 'alert' });
  const dlg = h('dialog', {},
    h('h2', { text: v.state === 'expired' ? 'Reopen the plan' : 'Edit plan' }),
    f('Plan', title), f('When', when), f('Details', details),
    locked ? h('p', { class: 'muted small', text: 'It already tipped, so the number and the deadline are fixed.' }) : h('div', { class: 'row2' }, f('People needed', target), f('Answers close', deadline)),
    err,
    h('div', { class: 'dialog-btns' },
      h('button', { class: 'btn ghost', onclick: () => dlg.close(), text: 'Cancel' }),
      h('button', { class: 'btn primary', onclick: async () => {
        const body = { title: title.value, when: when.value, details: details.value };
        if (!locked) { body.target = Number(target.value); body.deadline = new Date(deadline.value).getTime(); }
        try { v = await api(`plans/${id}`, { method: 'PATCH', body, token }); savePlan(id, { title: v.plan.title }); dlg.close(); render(); toast('Saved.'); } catch (e) { err.textContent = e.message; }
      }, text: 'Save' })));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

async function del() {
  if (!confirm('Delete this plan for everyone? This can’t be undone.')) return;
  try { await api(`plans/${id}`, { method: 'DELETE', token }); forgetPlan(id); location.href = '/'; } catch (e) { toast(e.message); }
}

function cta() {
  return h('div', { class: 'card cta', style: 'margin-top:16px' },
    h('h2', { text: 'Got a plan nobody will commit to?' }),
    h('p', { text: 'Every group chat has one. Make it tip.' }),
    h('a', { class: 'btn primary', href: '/?from=plan#create', text: 'Start your own plan' }));
}

// Shareable 1080×1350 card for the chat or a story.
async function saveCard(p) {
  const W = 1080, H = 1350;
  const c = h('canvas', { width: W, height: H });
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f9d58'); g.addColorStop(.6, '#0b7d63'); g.addColorStop(1, '#0a5f73');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  x.fillStyle = '#fff';
  x.font = font(800, 40); x.fillText('InIf', 80, 120);
  x.font = font(900, 150); x.fillText('It’s on!', 80, 330);
  x.font = font(800, 64);
  let y = wrap(x, p.title, 80, 450, W - 160, 76, 3);
  if (p.when) { x.font = font(600, 44); x.globalAlpha = .85; x.fillText(p.when, 80, y + 10); x.globalAlpha = 1; y += 70; }
  x.font = font(800, 54); x.fillText(`${v.count} going`, 80, y + 70); y += 120;
  // name pills
  x.font = font(700, 40);
  let px = 80, py = y;
  for (const n of (v.going || []).map((g2) => g2.name)) {
    const w = x.measureText(n).width + 56;
    if (px + w > W - 80) { px = 80; py += 82; }
    if (py > H - 330) break;
    x.fillStyle = 'rgba(255,255,255,.18)'; roundRect(x, px, py, w, 64, 32); x.fill();
    x.fillStyle = '#fff'; x.fillText(n, px + 28, py + 46);
    px += w + 16;
  }
  x.font = font(600, 38); x.globalAlpha = .92;
  const line = (v.lines || [])[0];
  if (line && line.kind === 'name') x.fillText(`${line.count} ${line.count === 1 ? 'was' : 'were'} in only if ${line.name} came 👀`, 80, H - 230);
  if (p.tippedAt && p.deadline > p.tippedAt) x.fillText(`Tipped ${fmtAhead(p.deadline - p.tippedAt)} before the deadline`, 80, H - 170);
  x.globalAlpha = .75; x.font = font(600, 34);
  x.fillText('Make your plan tip: pb-in-if.pages.dev', 80, H - 90);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'its-on.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'It’s on!' }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: 'its-on.png' });
  document.body.append(a); a.click(); a.remove();
  toast('Card saved.');
}
function wrap(x, text, left, top, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', y = top, n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) {
      x.fillText(line, left, y); y += lh; line = w;
      if (++n >= maxLines - 1) { line = words.slice(words.indexOf(w)).join(' '); break; }
    } else line = t;
  }
  x.fillText(line, left, y);
  return y + lh;
}
function roundRect(x, l, t, w, hh, r) {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + hh, r); x.arcTo(l + w, t + hh, l, t + hh, r);
  x.arcTo(l, t + hh, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}

// Live updates: poll while the page is visible, without touching an open editor.
setInterval(() => {
  if (document.visibilityState !== 'visible' || editing || busy || draft?.mode === 'cond' || document.querySelector('dialog[open]')) return;
  if (document.activeElement?.id === 'name') return;
  load();
}, 10000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !editing) load(); });

load();
