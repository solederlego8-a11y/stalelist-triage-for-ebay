# StaleList Triage for eBay — MVP (v0.1.0)

A **read-only** Chrome extension (Manifest V3) that triages stale listings on
eBay Seller Hub's Active listings page. It helps the seller *decide* what to
end — it never ends, relists, or edits anything itself.

> Position: "triage for the decision, not automation of the deletion."

## What it does

- Reads the listing rows already rendered on the page the user opened and
  badges each row: **End candidate / Review / Keep / Protected**, with a
  staleness score (Pro).
- Rules (pure functions in `lib/rules.js`):
  - Presets from measured seller vocabulary: **Standard 90-day** (judge from
    30 days, End candidate from 90) and **Gentle 180-day** (Pro). Custom rules
    are Pro.
  - **Protection rules (always on)**: listings with sales are Protected;
    auctions with bids are Protected; listings below the user's price floor
    are Protected; listings with watchers are capped at Review (never End
    candidate); multi-quantity listings get a warning badge.
  - **Staleness score 0–100** = age (up to 50, saturating at 180 days) +
    views (0 views = 30, ≤ maxViews = 20, ≤ 3×maxViews = 10) + watchers
    (0 = 20, 1–2 = 5). Protected listings show no score.
- **Selection assist**: one click checks the page's own checkboxes for all
  End candidates. It does **not** press any End/Relist button — the seller
  reviews and uses eBay's own UI.
- **Cross-page selection (Pro)**: selections can be saved locally
  (`chrome.storage.local`) across pages the user opens manually, with a count
  summary. No automatic page traversal.
- **CSV export (Pro)**: item ID, title, metrics, verdict, score.
- **Self-diagnostics**: the panel shows page count vs detected count. If the
  detection rate is **below 80%**, verdict output is halted with an explicit
  warning instead of silently producing wrong results.

## What it deliberately does NOT do

No automatic ending / relisting / Sell Similar execution. No automatic page
crawling. No background/scheduled runs. No requests to hidden endpoints. No
sending listing data to any server. The only network use in the design is
license verification — and that is **not connected** in this build (below).

## Free / Pro

Free: Standard preset, current page only, up to 25 flags, no CSV.
Pro adds: Gentle preset + custom rules, cross-page selection, CSV export,
rule saving, staleness scores.
**Free features will never be moved behind the paywall** (also stated in
`store-listing.md`).

## License verification — NOT CONNECTED (honest status)

The payment account (Lemon Squeezy) does not exist yet, so
`config/license-config.js` has `connected: false` and no endpoint. The popup
and panel say so plainly. Nothing pretends to verify against a server.

**Test mode**: `config/license-config.js` → `testMode: true` lets any key
starting with `DEV-` unlock Pro *locally* for development.
**>>> Before submitting to the Chrome Web Store: set `testMode: false`. <<<**
Pre-submission checklist: (1) testMode false, (2) connect the real endpoint
or remove the key field, (3) confirm host patterns against a live Seller Hub
account, (4) re-run the unit tests.

## Layout

```
manifest.json            MV3 manifest (permissions: storage, downloads only)
background.js            intentionally minimal service worker (no background work)
config/license-config.js connected flag / endpoint / test-mode switch
lib/rules.js             pure rule engine (verdicts, protection, score, guard, CSV)
lib/license.js           license stub (honest not-connected state, test mode)
content/content.js       extraction (generic table mapping + fallbacks), badges, panel
content/panel.css        panel styling
popup/                   toolbar popup: how-to + license key entry
demo/demo.html           Seller Hub-style sample page, 12 fictional listings
tests/rules.test.js      node:test unit tests for the engine (no dependencies)
icons/                   16/48/128 icons
store-listing.md         Chrome Web Store listing copy + permission justifications
privacy-policy.md        privacy policy text (collects nothing; key only)
```

## Load it (developer mode)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open Seller Hub → Active listings, or open `demo/demo.html` directly in
   Chrome (the demo page loads the same scripts itself, so it works even
   without the extension being matched to file URLs).

## Demo mode

`demo/demo.html` contains 12 fictional listings covering every verdict:
expected result with the Standard preset is **End candidate 4, Review 3,
Keep 3, Protected 2** (verified against the engine). Watchers-cap,
multi-quantity warnings and protection rules are all represented.

## Tests

```
node --test tests/rules.test.js
```
16 tests cover: End candidate basics, watcher cap, sales/bids/price-floor
protection, multi-quantity warning, young→Keep, Gentle preset boundaries,
score cap, the 80% detection guard, the free-plan 25-flag cap, free/Pro
limits, CSV quoting, and summary counts. All passing as of this build.

## Known unverified items (do not ship blind)

- **Seller Hub's real DOM is unverified.** Development had no seller
  account. Extraction is therefore generic (table-header mapping first,
  multiple fallbacks) and guarded, but column names/order and row markup
  must be confirmed on a live account before release.
- **Current Seller Hub URL patterns are unverified.** `manifest.json` uses
  `https://www.ebay.com/sh/*`, `/sell/*`, plus `.co.uk` / `.de` `/sh/*`.
  Confirm and narrow against the real account's URLs.
- View counts on the real page may be lifetime totals; judging "recent"
  movement may need adjustment after live inspection.
- AslWipe (free, filter+select) exists and is maintained — this product's
  differentiation is the triage verdict + protection rules + cross-page
  selection + CSV report, not filtering alone.
