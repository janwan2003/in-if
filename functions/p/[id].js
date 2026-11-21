// Serves the plan page with a live link preview: "Ski weekend · 4 of 6 in · closes in 2 days".

function left(ms) {
  const hrs = Math.round(ms / 3600000);
  if (hrs < 1) return 'closes within the hour';
  if (hrs < 36) return `closes in ${hrs} h`;
  return `closes in ${Math.round(hrs / 24)} days`;
}

export async function onRequestGet({ request, env, params }) {
  const page = await env.ASSETS.fetch(new URL('/plan', request.url));
  const id = String(params.id || '');
  let title = 'A plan on InIf';
  let desc = 'It’s on if enough are in. Answers are sealed until it tips.';
  try {
    const stub = env.PLANS.get(env.PLANS.idFromName('main'));
    const p = await (await stub.fetch(`https://do/__preview/${encodeURIComponent(id)}`)).json();
    if (p?.state === 'on') {
      title = `It’s on! ${p.count} going · ${p.title}`;
      desc = 'It tipped. Open to see who’s going, or join in.';
    } else if (p?.state === 'expired') {
      title = `${p.title} · closed`;
      desc = 'This plan didn’t tip, and nobody’s answer was revealed.';
    } else if (p) {
      title = `${p.title} · ${p.count} of ${p.target} in`;
      desc = `It’s on if ${p.target} are in · ${left(p.deadline - Date.now())}. Answers are sealed until it tips.`;
    }
  } catch (e) {
    console.error(e);
  }
  const url = `${new URL(request.url).origin}/p/${id}`;
  const res = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(`${title} · InIf`); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('head', { element(el) { el.append(`<meta property="og:url" content="${url}">`, { html: true }); } })
    .transform(page);
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}
