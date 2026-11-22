// Shared helpers for InIf pages.
export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const KEY = 'inif:plans';
export function myPlans() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function savePlan(id, data) {
  const all = myPlans();
  all[id] = { ...(all[id] || {}), ...data, savedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
}
export function forgetPlan(id) {
  const all = myPlans();
  delete all[id];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-member-token'] = token;
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('You seem to be offline. Check your connection and try again.'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status})`), { status: res.status });
  return data;
}

let toastTimer;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    toast('Link copied. Paste it in the group chat.');
    return 'copied';
  } catch {
    window.prompt('Copy this link:', url);
    return 'prompted';
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtDeadline(ms) {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  if (sameDay) return `today ${time}`;
  if (tomorrow) return `tomorrow ${time}`;
  if (ms - now.getTime() < 6 * 86400000 && ms > now.getTime()) return `${DAYS[d.getDay()]} ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
export function fmtLeft(ms) {
  if (ms <= 0) return 'closed';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min left`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return m % 60 ? `${hrs} h ${m % 60} min left` : `${hrs} h left`;
  const d = Math.floor(hrs / 24);
  return `${d} day${d > 1 ? 's' : ''}${hrs % 24 ? ` ${hrs % 24} h` : ''} left`;
}
export function fmtAhead(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h`;
  return `${Math.round(hrs / 24)} days`;
}

export const LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
