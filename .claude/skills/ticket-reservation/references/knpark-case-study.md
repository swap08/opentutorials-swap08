# Case study: KNPARK (knpark.com) monthly parking-pass sniping

A concrete walkthrough of building the reference program, including the exact things
discovered and every wrong turn. The **URLs won't transfer** to another site, but the
**shape of the problem and the debugging path will**. Read this to internalize the
discovery checklist below.

## The target

- **Site:** `www.knpark.com` — 코레일네트웍스 KNPARK, sells monthly train-station
  parking passes (정기권) first-come-first-served at a fixed time each month
  (수도권 20th 00:00, 비수도권 21st 00:00 KST).
- **Goal:** grab "대전역 선상" (a specific lot) at 00:00 on the 21st.
- **Login:** ID/PW **plus phone identity verification** → cannot be automated.

## What we discovered (the payload of this case study)

- **List page:** `GET /season/seasonBuy.do` renders a paginated table, but the rows
  are actually loaded by an **AJAX POST** to:
  - `POST /season/getSeasonTicketList.do`
    body: `pageNo=3&selector=1&selectornm=`
    → returns **JSON** (this was the key realization — we wasted runs parsing HTML).
- **JSON shape** (`resultList[]`), the fields that matter per row:
  - `pttl` — lot name (e.g., `"대전역 선상"`), match this **exactly** (beware
    `"서대전역 선상"` containing `"대전역 선상"` as a substring — use cell/exact match).
  - `pluNo` — lot id (e.g., `"180443"`).
  - `fv` — the product/season code (e.g., `"FT18044325050801"`).
  - `ompSellYn` — **availability flag**: `"C"` before open, flips to `"Y"` when
    on-sale. This is the signal to fire.
  - `pageVO.finalPageNo` — total pages, used to auto-locate the item.
- **Buy action:** the (image) button is
  `<a href="javascript:getSeasonBuyDetail('180443','FT18044325050801')"><img src="/resources/images/btn_buy.png"></a>`
  → i.e. `getSeasonBuyDetail(pluNo, fv)`, which `POST`s to
  `/season/seasonBuyDetail_pInfo.do` (params sent as POST, so no query string in the
  URL). We call the JS function directly via `page.evaluate` so its CSRF token/session
  are reused.

So the winning "fast mode" is: poll `getSeasonTicketList.do` (JSON) → find `pttl`
row → when `ompSellYn === 'Y'`, call `getSeasonBuyDetail(pluNo, fv)` in the page →
human pays.

## The debugging path (why the lessons exist)

1. **Run 1 failed:** target time was correct, but login wasn't complete in the short
   window → proceeded logged-out → list/buttons don't render for guests. *Lesson:* log
   in early, confirm with Enter, keep the window open.
2. **Runs 2-3 failed** with "row found but never clicked." Diagnostics showed
   `btn_buy.png` loading repeatedly → **the buy button is an image**, and the
   text selector `a:has-text('구매')` matched nothing. *Lesson #2.* Fixed the selector
   to `a[href*='getSeasonBuyDetail'], img[src*='btn_buy']` → list mode then worked
   (reached the buy page on a live sibling item).
3. **Fast mode first cut failed:** it POSTed the list API fine but the HTML parser
   found nothing. Diagnostics dumped the response → it was **JSON, not HTML**.
   *Lesson #1 and #7.* Rewrote to parse JSON + `ompSellYn`.
4. **Validated** on a live sibling ("능곡역", `ompSellYn:"Y"`): polled JSON → detected
   `Y` → called `getSeasonBuyDetail('110179','FT11017926033101')` → reached the buy
   page on cycle 1. *Lesson #8.*
5. Added **auto page-detection** (`finalPageNo` scan) so a month's list reshuffle
   doesn't break it. *Lesson #6.*

## Discovery checklist for ANY new site

Do this recon **with the user logged in**, before writing the fire loop:

1. **Open DevTools → Network** (or attach Playwright request logging). Reload the
   list, page through it, and click a real **already-open** buy button.
2. **Find the list source.** Is the table server-rendered HTML, or fetched by an
   XHR/fetch? If XHR: note the **method, URL, request body, and whether the response
   is JSON or HTML fragment**. Prefer hitting this directly.
3. **Find the availability signal.** Compare a closed row vs an open row in the
   response. What field/marker differs? (A status code like `Y/C`, a present-vs-absent
   button, a quantity.) That's your fire trigger.
4. **Find the buy call.** Copy the buy control's `onclick`/`href`. Is it a JS function
   (`fn(id, code)`) or a direct link/POST? Capture the exact params and, from the
   Network tab, the **request the click actually sends**.
5. **Find the identifiers** for the target item (id, product code) and confirm they
   appear in the list response so you can read them live at open time (they often
   can't be known in advance and change per sale).
6. **Confirm the open time and clock.** Exactly when does it flip, and in whose time
   (server vs local)? Sync to the server `Date` header.
7. **Note the human steps** (CAPTCHA, phone auth, payment) and design explicit pauses
   for them.

## Config knobs the reference program exposes (map these to a new site)

`targetTimeKST`, `warmupSeconds`, `fireLeadMs`, `reservationUrl`, `listApi`,
`pageNo` (auto-corrected), `itemText` (matched to the API's name field),
`sellField`/`sellValue` (the availability flag + its on-sale value), the buy selector,
`fastMode`, `parallelTabs`, `maxTrySeconds`/`clickIntervalMs`/`maxBackoffSeconds`,
`captureNetwork`. See `config.example.json` in the repo root.
