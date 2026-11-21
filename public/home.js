import { $, h, api, savePlan, myPlans } from '/common.js';

const TEMPLATES = [
  { label: 'New Year’s Eve', title: 'New Year’s Eve together', when: '31 Dec', details: '', target: 8, close: '168' },
  { label: 'Friday drinks', title: 'Drinks on Friday', when: 'Fri from 7 pm', details: '', target: 4, close: '48' },
  { label: 'Ski trip', title: 'Ski weekend', when: 'February', details: 'Chalet + lift pass, about €300 each', target: 6, close: '168' },
  { label: 'Festival', title: 'Festival tickets together', when: 'Summer', details: 'Buying tickets as a group', target: 5, close: '168' },
  { label: 'Five-a-side', title: 'Five-a-side football', when: 'Thu 8 pm', details: 'Pitch booking split between us', target: 10, close: '48' },
  { label: 'Reunion', title: 'Reunion dinner', when: 'Over Christmas', details: '', target: 6, close: '336' },
  { label: 'Weekend away', title: 'Weekend away', when: '', details: '', target: 4, close: '168' },
];

const form = $('#create');
const out = $('#target');
let target = 6;
const setTarget = (n) => { target = Math.max(2, Math.min(200, n)); out.textContent = target; };
form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setTarget(target + Number(b.dataset.step))));

const tpl = $('#templates');
for (const t of TEMPLATES) {
  tpl.append(h('button', {
    type: 'button', class: 'chip', 'aria-pressed': 'false', text: t.label,
    onclick: (e) => {
      tpl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
      form.title.value = t.title;
      form.when.value = t.when;
      form.details.value = t.details;
      form.close.value = t.close;
      $('#custom-wrap').classList.add('hidden');
      setTarget(t.target);
      form.name.value ? form.title.focus() : form.name.focus();
    },
  }));
}
const qs = new URLSearchParams(location.search);
if (qs.get('t')) { const t = TEMPLATES.find((x) => x.label.toLowerCase().startsWith(qs.get('t').toLowerCase())); if (t) tpl.children[TEMPLATES.indexOf(t)].click(); }

form.close.addEventListener('change', () => {
  const custom = form.close.value === 'custom';
  $('#custom-wrap').classList.toggle('hidden', !custom);
  if (custom && !form.custom.value) {
    const d = new Date(Date.now() + 3 * 86400000);
    d.setHours(18, 0, 0, 0);
    form.custom.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
});

// Remember the name used last time.
try { const n = localStorage.getItem('inif:name'); if (n) form.name.value = n; } catch {}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#create-err');
  err.textContent = '';
  const title = form.title.value.trim();
  const name = form.name.value.trim();
  if (!title) { err.textContent = 'Say what the plan is.'; form.title.focus(); return; }
  if (!name) { err.textContent = 'Add your name so friends know who’s asking.'; form.name.focus(); return; }
  let deadline;
  if (form.close.value === 'custom') {
    deadline = new Date(form.custom.value).getTime();
    if (!Number.isFinite(deadline)) { err.textContent = 'Pick when answers close.'; return; }
  } else deadline = Date.now() + Number(form.close.value) * 3600000;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const r = await api('plans', { method: 'POST', body: { title, when: form.when.value, details: form.details.value, target, deadline, name, in: form.in.checked } });
    savePlan(r.id, { token: r.token, title, mine: true });
    try { localStorage.setItem('inif:name', name); } catch {}
    location.href = `/p/${r.id}#new`;
  } catch (x) {
    err.textContent = x.message;
    btn.disabled = false;
    btn.textContent = 'Create the link';
  }
});

const mine = Object.entries(myPlans()).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 12);
if (mine.length) {
  $('#mine-sec').classList.remove('hidden');
  $('#mine').replaceChildren(...mine.map(([id, p]) => h('a', { href: `/p/${id}` }, h('span', { text: p.title || 'Plan' }), h('span', { class: 'muted small', text: p.mine ? 'You made this' : 'Open' }))));
}
