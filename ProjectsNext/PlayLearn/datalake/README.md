# PlayLearn data lake (Cloud Firestore)

Everything users do on the site is recorded in the **new Cloud Firestore**
database of the `playlearn-cb8c1` project, so it can be used later to train an
AI. The Realtime Database the site already uses is untouched — it keeps working
exactly as before, and Firestore is a second, write-only copy of the activity.

**No UI, structure or function was changed.** The recorder (`datalake.js`) only
listens passively; every piece is wrapped in `try/catch`, so if Firestore is
down, blocked or the rules aren't deployed yet, the site behaves exactly the same.

## One-time setup

1. Firebase console → **Firestore Database** → make sure the new database exists.
2. **Rules** tab → paste `datalake/firestore.rules` → Publish.
   (Until you do this, the browser's writes are rejected and silently dropped.)
3. Open the site, click around, and check Firestore for `ai_events`, `ai_sessions`, …

## What is recorded

| Collection | One document per | What's inside |
|---|---|---|
| `ai_sessions` | browsing session | device, screen, browser, language, timezone, connection, landing page, referrer, UTM, visit count, new/returning visitor |
| `ai_events` | user action / page signal | see event types below |
| `ai_db_mutations` | every Realtime-Database write (set / update / push / remove / transaction) | path, operation, full cleaned payload, `domain`, touched paths, which DB project |
| `ai_db_reads` | Realtime-Database read / listener | path, domain, whether it existed, child count (never the data itself) |

Every record carries: `sessionId`, `visitorId` (anonymous, per browser), `pageviewId`,
`seq` (order inside the session, across pages), `clientTs` / `clientIso` (when it happened),
`uploadedAt` (server time), `page` (`path`, `name`, `area` = shop / classroom / community / admin / executive,
`semester`, `query`), and `userKey` + `user` (email key, name, semester, reg. no. when logged in).

### `ai_events` types

* **Navigation** — `page_view`, `page_leave` (active time, visible time, max scroll, click count), `page_hidden`, `page_visible`, `page_heartbeat`, `route_change`
* **Interaction** — `click` (element id/class/text/href/data-*, section context, position, downloads), `form_submit` (every field value — passwords redacted), `field_change`, `search_input` (what was searched), `scroll_depth`, `copy` / `cut` / `paste`, `media`, `impression` (cards / rows the user actually saw)
* **Feedback** — `ui_toast` (every on-screen message: "Logged in", "Incorrect email or password…", "added x to cart"…), `ui_alert`, `ui_confirm` (with the answer)
* **Commerce** — `catalog_view`, `product_view`, `cart_add`, `cart_remove`, `checkout_open`, `checkout_submit`, `payment_started`, `payment_success`, `payment_failed`, `payment_dismissed`, `receipt_download`
* **Auth / state** — `auth_state` (session_set / logout), `local_state` (cart & preference snapshots from localStorage)
* **Technical** — `js_error`, `resource_error`, `unhandled_rejection`, `api_call` (method / host / status / duration, never bodies), `network_status`

### `ai_db_mutations` domains

`account`, `security`, `commerce`, `catalog`, `support`, `activity`, `staff`, `chat`, `social`,
`social_graph`, `stories`, `groups`, `notifications`, `safety`, `calls`, `other` — this covers
orders, support tickets and replies, product links, profile edits, community posts / comments / chat
messages / reactions / stories / friend requests, admin and executive actions, and login attempts.
High-frequency noise (typing indicators, presence, WebRTC candidates) is skipped on purpose.

### Never stored

Passwords, OTPs, card numbers, tokens, API keys and secrets (any field whose name matches is
replaced by `[REDACTED]`), and the bytes of images / data-URLs (replaced by a size marker).

## Getting the data out for training

```
cd datalake
npm i firebase-admin
node export_training_data.js --key serviceAccount.json --out ./export --sequences
node export_training_data.js --key serviceAccount.json --anonymize      # hashed emails / names
```

This writes JSON-Lines files (`ai_events.jsonl`, …). With `--sequences` it also writes
`sessions.jsonl` — one line per session containing every action and database write in time
order, the natural shape for next-action / recommendation / assistant models.
(Or use Firebase's built-in Firestore → BigQuery export extension for large-scale analysis.)

## Privacy & cost notes

* The data includes personal information (names, emails, phone numbers, support messages, chat
  messages). Add a line to your privacy policy saying activity is recorded to improve the service,
  and use `--anonymize` before sharing a dataset with anyone.
* A user can opt out in their own browser with `localStorage.setItem("PL_DL_OPTOUT","1")`.
  If you want a visible opt-out, wire a button to that.
* Firestore bills per write. Records are batched (up to 400 per request), but a busy site
  produces many small documents — watch usage in the console, and set a budget alert.

## Files

* `datalake.js` — the recorder (identical copies live next to each set of pages: site root,
  `Classroom/Semester1-4/`, `Community/js/`, `Community/Community/js/` — edit one, copy to the rest)
* `datalake/firestore.rules` — security rules (append-only from the browser)
* `datalake/export_training_data.js` — export to JSONL
* Small named hooks (`PLDL.track(...)`) were added in `cart.js`, `product.js`, `catalog.js`, and every
  `auth.js`; the two `Community/**/chat.html` files route their writes through tiny wrappers so those
  are recorded too.
