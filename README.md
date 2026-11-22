# InIf

“It’s on if enough are in.” A no-login link for group plans: everyone answers in secret (“I’m in”,
“I’m in, only if…”, “Not this time”), and the plan tips, revealing who’s going, once enough people are in.
If the deadline passes first, nobody’s answer is ever shown.

Live: https://pb-in-if.pages.dev · Product/support page: https://janwan2003.github.io/in-if/

## Architecture
Cloudflare Pages (static `public/`, no build step) + Pages Functions (`functions/`). The data lives in **one
SQLite-backed Durable Object** in the Worker `pb-in-if-db` (`worker/`), because the account is at the free
plan's 10 D1 databases. `worker/index.js` wraps the object's SQL storage in a small D1-style shim, so
`lib/api.js` is plain SQL against `schema.sql`. `lib/resolve.js` computes who is going from everyone's
conditions (largest fixed point) and is unit-tested.

Sealing is enforced in `lib/api.js` `view()`: before the tip, no response contains anyone else's answer;
after the tip only the going list (non-going names are dropped); after an expiry no names but your own.

## Develop
```
npx -y pnpm@9 install
(cd worker && npx wrangler dev --port 8871 --ip 127.0.0.1 --persist-to ../.wrangler/state) &   # worker/.dev.vars: TEST_HOOKS=1
npx wrangler pages dev --port 8870 --ip 127.0.0.1 --persist-to .wrangler/state
npm run test:unit
BASE=http://127.0.0.1:8870 node tests/e2e/run.mjs     # real Chromium, 7 contexts, screenshots in shots/
BASE=http://127.0.0.1:8870 node tests/e2e/layout.mjs  # 360/390/768/1280 px: overflow, wrapped buttons, axe-core, console
node tools/render-images.mjs                           # og.png and icons
```

## Deploy
```
set -a; . ../../.env; set +a
(cd worker && npx wrangler deploy)        # only when worker/ or lib/ changed
npx wrangler pages deploy --branch main
BASE=https://pb-in-if.pages.dev node tests/e2e/run.mjs     # deletes its own plan; skips the expiry step
BASE=https://pb-in-if.pages.dev node tests/e2e/layout.mjs  # deletes its fixture plans; skips the expired state
```

## Usage counts
`npm run stats` reads `/api/__stats` (counts only: plans, tipped, people, new creators/joiners this week and last).
The route returns 404 unless the `x-stats-key` header matches the Worker secret `STATS_KEY`
(kept as `INIF_STATS_KEY` in this venture's gitignored `.env`; locally `worker/.dev.vars`).
