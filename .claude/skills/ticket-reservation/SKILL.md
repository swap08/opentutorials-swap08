---
name: ticket-reservation
description: >-
  Build automation that reserves or purchases a competitive, time-gated slot on a
  website the instant it opens — first-come-first-served tickets, parking passes,
  concert/event seats, class enrollment, or any inventory that sells out in seconds
  at a fixed open time (예매/티켓팅/선착순). Use this whenever the user wants to
  auto-book, snipe, or grab a reservation at an exact moment, connect to a site at a
  scheduled time to buy something, or asks why their booking macro keeps missing.
  It carries the battle-tested Playwright architecture AND the non-obvious lessons
  that decide success — reverse-engineering the real API, image buttons, JSON list
  responses, session/login handling, and precise server-time firing. Reach for it
  even if the user only says "help me book X at midnight" without the word "skill".
---

# Competitive Ticket / Reservation Automation

This skill captures a **working, real-world-validated** approach to sniping a
first-come-first-served slot the moment it opens. It exists because the naive
approach ("open the page, click the button at 0:00") reliably **fails**, and the
reasons why are non-obvious. Read the lessons — they are the whole point.

A reference implementation (a Node + Playwright program for Korea's KNPARK parking
passes) lives in this repo's root and in `references/knpark-case-study.md`. Use it
as a concrete template; adapt the specifics per site.

## First: scope and ethics (non-negotiable)

- Build this only for the user's **own account**, for a slot **they will personally
  use**. This is a personal convenience helper, not a scalping/reselling tool.
- **Do not bypass CAPTCHA, bot-detection, or identity verification.** When a human
  step appears (phone auth, CAPTCHA, payment), the program **pauses and lets the
  person do it** in the visible browser. Automating those crosses a line and usually
  violates the site's terms.
- **Do not hammer the server.** Poll at a sane cadence and **back off when the server
  returns errors** — a bot that behaves worse than a human refreshing is both rude
  and more likely to get blocked. Refresh count does not improve queue position in a
  first-come system; only the successful request's arrival time matters.
- Say all of this to the user plainly. If the request is clearly for mass-buying or
  resale, decline.

## The core architecture

Use a **headed** (visible) Playwright browser with a **persistent profile** so the
login session and cookies survive. The flow, in order:

1. **Sync to the server's clock, not the local one.** Read the `Date` header from an
   HTTP response to the target host and compute the offset. Slots open on the
   *server's* second; being 2 seconds early or late loses. (This is what
   navyism-style "server time" sites do.)
2. **Log in early, manually, and confirm with Enter.** Phone auth / SSO can't be
   automated. Open the browser well before open time (~15-20 min), let the user log
   in **in the window the program opened** (not a separate browser), then have them
   press **Enter in the terminal** to confirm. Do **not** rely on auto-detecting the
   logged-in state — selectors for "logout" links are unreliable; an explicit Enter
   is robust. Keep the browser open until fire time; refresh periodically to keep the
   session alive.
3. **Pre-position** on the exact page/state where the buy control will appear.
4. **Wait to the millisecond** (busy-wait the final <500 ms) then **fire**.
5. **Retry with backoff**, time-bounded (e.g., up to 3 min), because the slot may
   open a few seconds late and the server is slow under load.
6. **Hand off** to the human for CAPTCHA/payment; keep the window open.

Optionally run **a few parallel tabs** racing to the first success (2-3, not more),
and — if you build a fast path — keep **one tab on the proven slow path as a safety
net**.

## The lessons that actually decide success

These are ranked by how much pain they caused. Internalize them before writing code.

### 1. Reverse-engineer the real network requests BEFORE trusting the DOM
The rendered page is a lie waiting to waste your time. Turn on request logging
(Playwright `page.on('request', ...)`, or have the user click the real button once
with DevTools Network open) and find:
- **How the list/inventory is actually fetched** — often a `POST` to an API endpoint
  returning **JSON**, not the HTML you see. Parsing the rendered table when the truth
  is a JSON API is the single biggest time-sink. Find the API, hit it directly.
- **What the buy action actually is** — usually a JS function (`fnBuy(id, code)`) or a
  `POST` with specific params. Capture the exact call.

Save captured requests to a file so you can study them. In the reference program,
`captureNetwork` writes every `season|buy|reserve|POST` request to
`reserve-requests.log`. That log is what cracked the case.

### 2. The buy button is often an IMAGE, not text
A selector like `a:has-text('구매')` / `button:has-text('Buy')` silently matches
**nothing** if the button is `<a href="javascript:buy(...)"><img src="btn_buy.png"></a>`.
The program will look "alive" (retrying) while never seeing the button. Prefer
selectors tied to the **action**, not the label:
- `a[href*='<buyFunctionName>']`, `a:has(img[src*='btn_buy'])`, or the data from the
  JSON API. Verify against the real DOM — never assume.

### 3. Read identifiers from the API and call the site's own buy function
Once you have the JSON, you usually get the item id, a product/seat code, **and a
sell-status flag** per row. The fastest, most robust "fire" is to call the site's own
buy function with those args **inside the page context** (`page.evaluate`), because
it reuses the page's session and any CSRF/anti-forgery token. Firing a raw HTTP POST
yourself often fails on a missing token — and gains little.

### 4. Availability is a server-side state change; you MUST re-fetch
Before open time the buy control does not exist in the DOM. A page you pre-loaded
will **never** sprout the button on its own — the state flips server-side. So the
fire loop must **re-request** (reload, or better, re-POST the JSON API) each cycle.
The clean signal is a status field in the API (e.g., a flag that flips from "closed"
to "on-sale") — poll it and fire the instant it flips.

### 5. Full page reloads are brutally slow under load — poll the API instead
At open time the site is hammered; a full navigation can take many seconds. If you
found the JSON list API (lesson 1), poll **just that endpoint** (`page.evaluate` →
`fetch` with the right `Content-Type` and often `X-Requested-With: XMLHttpRequest`),
which is 10-30× lighter than reload → navigate → render. This is the difference
between ~1 attempt / 8 s and several attempts / second.

### 6. Lists reorder — auto-detect the item's page/location
Don't hard-code "it's on page 3." Month to month the list shifts. Query the API
across pages during warmup to find where the target actually is, and self-correct.

### 7. Instrument everything; a silent failure teaches nothing
When it fails at 0:00 you get **one** shot at the logs. Make the program dump: the
login state it believed, the response length + whether the target name / buy token
were present, and the raw response to a file on a miss. The reference program's
diagnostics (`fast-response.txt`, "포함=true/false" lines) are what turned three
failed runs into a root cause.

### 8. Rehearse against a currently-open equivalent
Most competitive sales have sibling items already on sale (e.g., a different region /
earlier day). Point the program at one of those to validate the **entire** path —
login, API poll, availability detection, buy-function call — reaching the payment
page **without paying**. This is how you confirm it works before the real 0:00.

### 9. Set honest expectations
A truly hot slot can sell out in ~1-2 seconds; no browser-based tool is guaranteed to
win, and if the server melts it melts for everyone. This automation reliably beats a
human mashing F5 (precise timing, no fumbling, instant fire), but promise effort, not
certainty.

## Workflow for a new site

1. **Interview + ethics check.** Confirm personal use, one account, the exact item,
   and the exact open time (and whether it's the user's local time or server time).
2. **Recon.** With the user logged in, capture the network traffic of: loading the
   list, paging, and clicking a real (already-open) buy button. Identify the list API
   (likely JSON), the buy function/endpoint, and the availability flag. See the
   discovery checklist in `references/knpark-case-study.md`.
3. **Build** on the reference architecture: server-time sync → persistent-profile
   browser → manual-login+Enter → auto-locate item → poll API → detect availability
   → call buy function → hand off for payment. Add backoff, diagnostics, optional
   parallel tabs + slow-path safety net.
4. **Rehearse** on an open sibling item; read the diagnostics; fix; repeat.
5. **Real run:** start ~15-20 min early, log in, confirm, leave it. Human does
   payment.

## Reference implementation

- `references/knpark-case-study.md` — the full KNPARK story: the exact endpoints and
  data shapes discovered, the discovery checklist, and how each lesson above showed
  up concretely. Read it when building for a new site — the *pattern* transfers even
  though the URLs won't.
- `scripts/server-time.js` — reusable, dependency-free server-clock sync via the
  `Date` header. Drop-in starting point.

The complete working program (config-driven, Playwright) is in the repository root
(`src/book.js`, `src/browser.js`, `src/serverTime.js`, `config.example.json`,
`GUIDE.md`). Reuse it as the skeleton and re-do recon per site.
