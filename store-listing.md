# Chrome Web Store listing — StaleList Triage for eBay

## Name
StaleList Triage for eBay

## Short description
Read-only triage for stale eBay listings: End candidate / Review / Keep / Protected badges on Seller Hub, with protection rules for listings with watchers, bids or sales. Never ends or relists anything.

## Detailed description

StaleList Triage helps eBay sellers decide what to do with listings that
stopped moving — without handing their account to an automation bot.

Open Seller Hub → Active listings, press "Run triage", and each row gets a
plain verdict:

- **End candidate** — old, no views, no watchers, no sales under the rule you picked
- **Review** — stale-ish, or protected from ending by a soft rule
- **Keep** — too young, or engagement is fine
- **Protected** — has sales, has bids, or sits below your price floor

Rules use the thresholds sellers already talk about: judge at 30 days, end
candidates at 90 (Standard preset), or a gentler 180-day preset. Protection
rules are always on: a listing with watchers is never marked End candidate,
auctions with bids and listings with sales are excluded automatically, and
multi-quantity listings get a warning so you check stock before acting.

When you are ready, one click checks the boxes of the End candidates *for
you to review* — the ending itself is always done by you, in eBay's own
interface. Nothing runs in the background, nothing is scheduled, and your
listing data never leaves your browser.

**Single purpose**: this extension exists for one purpose only — triaging
stale listings on the eBay Seller Hub Active listings page the user has
opened. Every feature serves that purpose.

Free plan: Standard preset, current page, up to 25 flags.
Pro ($9.99/month) adds: Gentle preset and custom rules, cross-page selection
saving, CSV export of the triage report, rule saving, and staleness scores.
**Free features will never be moved behind the paywall.** Pro only adds
capabilities; it does not take free ones away.

StaleList Triage is not affiliated with or endorsed by eBay Inc. "eBay" is
used descriptively only.

## Permission justifications (for the review form)

- **storage**: Stores the user's license key, saved custom rule, and the
  cross-page selection (item IDs + verdicts) locally on the user's device.
  Nothing is synced or transmitted.
- **downloads**: Used only when the user clicks "Export CSV" (Pro) to save
  the triage report they generated. No other downloads are initiated.
- **Host permissions (www.ebay.com /sh/* and /sell/*, www.ebay.co.uk/sh/*,
  www.ebay.de/sh/*)**: The content script must read the listing rows of the
  Seller Hub Active listings page the user has opened in order to compute
  triage verdicts and draw badges. It reads only the rendered page, performs
  no automated actions (it never clicks End/Relist/Sell Similar), makes no
  requests to eBay endpoints, and transmits no listing data anywhere.
- No `cookies`, no `tabs`, no `<all_urls>`: intentionally not requested.

## Reviewer notes

- A bundled demo page (`demo/demo.html`, 12 fictional listings) reproduces
  the full flow — extraction, badges, selection assist, CSV — without an
  eBay account. Load the extension, open the demo page, press
  "Run triage on this page". Expected: End candidate 4, Review 3, Keep 3,
  Protected 2.
- License verification is **not connected** in this build (no payment
  account exists yet). The popup states this plainly. In the development
  build, a key starting with `DEV-` unlocks Pro locally for testing;
  **test mode is disabled (`testMode: false` in `config/license-config.js`)
  in the submitted build** — verify this line before approving a release
  candidate.
- Screenshots for this listing must be taken from the demo page or a test
  account, never from a real seller's data.

## Category / language
Productivity · English
