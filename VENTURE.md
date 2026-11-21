---
slug: in-if
stage: idea
priority: 5
url:
repo:
updated: 2026-11-21
---

# in-if

## Thesis

**Who:** Any friend group, family, team or club trying to make a plan happen: New Year's Eve,
a ski weekend, a festival, Christmas Eve drinks, five-a-side, a reunion, a group holiday. This is
an everyday audience: ordinary group chats, not organisers.

**What:** A no-login "it's on if enough are in" link. Group-chat plans stall because nobody
wants to commit first. Saying yes before anyone else feels exposed, so everyone replies "maybe"
and the plan dies. One person writes the plan ("Ski weekend in Feb, ~€300, happens if 6 are in
by Friday 6 pm") and sends the link. Each friend taps **I'm in**, optionally with a condition:
"only if at least 5 are in", or "only if Ana and Tom are in". **Commitments are sealed:** nobody,
including the creator, sees who said yes until the plan tips. Everyone sees only the count of
firm yeses against the target ("4 of 6"). The app works out, from everyone's conditions, the
largest group whose conditions all hold. When that group reaches the target, the plan tips. The
names appear and a card announces "It's on: 7 are going." If the deadline passes without
tipping, the plan quietly expires and **no name is ever revealed**, so nobody was left hanging.

The mechanism is an assurance contract (the all-or-nothing rule behind Kickstarter, and the
"I'll do it if N others will" pledge of mySociety's PledgeBank), turned into a 10-second tap in a
group chat.

**Needs others:** yes. A plan with a threshold of other people's commitments has no value alone,
and the sealed count only means something when others tap.

**Viral moment:** the tip. The link preview flips from "Ski weekend · 4 of 6 · closes Fri 6 pm"
to "It's on! 7 going", and people post the "It's on" card to the chat and to stories. A second,
softer moment: after the tip, the card says "2 people were in only if Tom came 👀" (counts
only, never whose condition it was). That line gets screenshotted and teased.

**How often:** weekly for active groups (weekend plans, drinks, sport), plus big seasonal
deadlines: New Year's Eve (6 weeks out), Christmas Eve and Boxing Day meetups, January ski trips,
spring festival tickets, summer holidays. Everyone is in several group chats with stalled plans.

**Why now:** December is the peak month for stalled group plans (NYE, Christmas reunions).
The closest products are new install-only iPhone apps (Planlark, TimeTo, Hive). PledgeBank, the
web version of the idea, closed in 2015. No browser link does a sealed threshold commitment.

### The six questions

1. **Why the group IS the input:** the plan exists only as the set of other people's sealed
   yeses. With one person there is no count, no condition to satisfy and no tip.
2. **Reveal moment:** the tip. Names unlock all at once when the threshold is met, and the
   "It's on" card appears. People come back to the link to see whether it has tipped; the
   preview shows the live count.
3. **Ritual or deadline:** every plan has a closing time (default 48 hours), and the countdown
   is on the card. Seasonal pushes: NYE, Christmas Eve, the January ski trip, summer holiday.
4. **30-second join:** open link → read the plan → nickname → tap "I'm in" (optional: "only if
   ≥ N" stepper, or tick names from those who have joined). No typing beyond the nickname.
5. **Screenshot-worthy result:** the "It's on" card: plan name, date, the faces/initials of
   everyone going, "tipped 3 h before the deadline", and the anonymous condition line.
6. **Why a joiner creates their own:** everyone has a stalled plan in another chat. The tip card
   ends with "Got a plan nobody will commit to? Make it tip." Once you have seen a plan actually
   happen, the next "who's in?" message in any chat is an obvious place to use it.

## Market evidence

Searches run 2026-11-21. Sources are search-result summaries, not opened pages, unless noted.

- **The idea has precedent, and its web version closed:** PledgeBank (mySociety, 2005–2015)
  ran conditional pledges in the format "I will do x if y number of people agree to do the same"
  and was closed in 2015 to focus on core services ([mySociety, "goodbye to some old friends"](https://www.mysociety.org/2015/01/28/goodbye-to-some-old-friends/),
  [civictech.guide](https://civictech.guide/projects/pledgebank)). Its creator's write-ups on why
  it never took off ([part 1](https://flourish.org/?p=507), [part 2](https://www.flourish.org/2012/02/part-2-why-i-think-pledgebank-failed-when-groupon-and-kickstarter-flew/))
  point at civic pledges to strangers. Our version is for small friend plans, where the payoff
  is immediate.
- **New install-only apps chase the same pain:** [Planlark](https://apps.apple.com/us/app/planlark/id6760189622)
  (iOS 18+, the organiser sets "how many people are needed", plans "expire automatically if
  enough people do not commit", invitees get an SMS link to download, Premium $2.99/month);
  [TimeTo: Plans That Happen](https://apps.apple.com/us/app/-/id6480720009) (targets "everyone
  reacts yes, and then nothing"); [Hive](https://apps.apple.com/app/id6745452283),
  [Howbout](https://howbout.app/blog/making-plans/the-only-app-you-need-to-get-together-with-friends/)
  (availability, each plan gets its own chat). All need an install, and none seals the
  commitments or supports "only if X comes".
- **How people do it now:** "who's in?" messages, WhatsApp polls with visible votes (so the first
  yes is exposed), and endless "maybe". Howbout's own guide says that for the most part group
  chat plans never end up happening ([Howbout blog](https://howbout.app/blog/making-plans/the-only-app-you-need-to-get-together-with-friends/));
  a dev who built an app for it calls group chats "terrible at planning hangouts"
  ([DEV Community](https://dev.to/timmbach/i-built-an-app-because-group-chats-are-terrible-at-planning-hangouts-k53));
  Elite Daily on the big-friend-group planning struggle ([Elite Daily](https://www.elitedaily.com/p/trying-to-make-plans-with-a-big-friend-group-is-such-a-struggle-tbh-9131999));
  advice columns on flaky friends ([Substack](https://shityoushouldcareabout.substack.com/p/how-do-i-deal-with-my-flakey-friends)).
- **Spontaneous-plan apps can spread fast:** Down to Lunch reached No. 1 in Social and No. 2
  overall on the US App Store in April 2016 ([Wikipedia](https://en.wikipedia.com/wiki/Down_to_Lunch),
  [Business Insider](https://businessinsider.in/college-kids-are-going-crazy-for-an-app-that-helps-them-spontaneously-lunch-blaze-or-chill-with-friends-and-it-just-shot-up-above-facebook-in-the-app-store/amp_articleshow/51844884.cms)),
  but it needed an install and a friend graph.
- **Gap:** no search-volume figure found; demand evidence is the number of new apps attacking
  "plans never happen" and the universal group-chat behaviour, not volume.

## Our edge

- **Loop: needs others.** The plan is the group's sealed commitments.
- **K estimate ≈ 1.8** = 8 friends see a plan link × 75% tap in or out (one tap, no risk because
  it is sealed, and the count pulls) × 30% of joiners start their own plan within a few weeks.
  Reason: stalled plans are in every chat every week, and the "It's on" card shows a plan that
  actually happened. Weakest factor: joiner → creator. The tip card must end with a one-tap
  "Make a plan tip", prefilled with common plans (NYE, drinks Friday, trip).
- **The sharp angle nobody has:** sealed yeses plus conditions ("only if ≥ 5", "only if Ana
  comes") and a face-saving expiry. The new apps have headcounts but no sealing and no
  conditions, and they need installs. WhatsApp polls expose the first yes.
- Pairs naturally with the operator's WeGoWhen: "It's on" → "Pick the date" (link out), and
  WeGoWhen's result → "Make it tip". Operator to decide whether this is a WeGoWhen feature or its
  own product. Recommended as its own product: different moment, different screenshot.
- **Resolution logic** is small and testable: iterate to the largest set of committed members
  whose conditions all hold (monotone fixed point: start from all yeses, drop anyone whose
  condition fails, repeat).
- **Risks:** people may want to see names before committing (offer an opt-in "show my name now"
  per person; default sealed). Low-stakes plans ("lunch?") don't need it, so the product must be
  pitched at plans with friction: cost, travel, tickets.

## Status

Idea only. Nothing built. Evidence above from web search on 2026-11-21.

## Next steps

1. Write the resolution function and its unit tests first (conditions on counts and names,
   deadline, withdrawals before the tip, what to do if someone withdraws after the tip).
2. Design the plan card, the live link preview ("4 of 6 · closes Fri 6 pm") and the "It's on"
   card. They are the product.
3. Build on Cloudflare Pages + Functions + D1 (`pb-in-if`): plans, members (nickname + device
   token), commitments (sealed), conditions; dynamic OG image; rate limit per IP.
4. Templates: NYE, Christmas Eve drinks, ski trip, festival, five-a-side, reunion.
5. Playwright end-to-end test: creator + 5 members with mixed conditions → tip → names reveal;
   and an expiry with no names leaked (check the API responses, not just the UI).
6. Aim for live by ~2026-12-08 so NYE plans can tip.

## Monetization plan

None now (rule 4). Later: optional supporter tip; possibly a "group trip" upgrade (deposit
tracking links) once the operator can take money. No ads.

## Log

- 2026-11-21 scout: created from scouting session; evidence from 3 web searches (search-result
  summaries, pages not opened). Not built.
