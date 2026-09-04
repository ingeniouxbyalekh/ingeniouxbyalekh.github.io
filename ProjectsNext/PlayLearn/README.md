# PlayLearn Shop

A standalone storefront for PlayLearn — separate from the main portfolio
site. Sells research papers, books, guides, and templates, priced in
INR. Light, clean, checkout-style UI: rounded cards, soft shadows,
pill buttons.

## Files

- `index.html` — **the site home**, and a shopper's personal
  dashboard: "Your study material," grouped by semester, with a
  Notes / PYQ / eBooks row for each and a Download button per row.
  Reads `/purchases/<emailKey>` and `/links` from Firebase (same
  shapes `profile.html` already reads) to decide which rows are
  unlocked and where each one downloads from — see the comment block
  in this file for the exact unlock rules. Doesn't load `cart.js`
  (there's nothing to add to cart or check out here).
  - Not logged in → prompts to log in.
  - Logged in, nothing purchased → "No study material available yet."
  - Logged in with purchases → one section per semester the shopper
    has *any* unlocked row in. Within a semester: buying the "Full
    Course" bundle (`cse-semN` in `products.js`) unlocks Notes, PYQ,
    *and* eBooks together; buying `pyq-semN` or `ebook-semN` on its
    own unlocks just that row. Everything else in that semester shows
    a disabled "Purchase this to download" button instead. A row
    whose product id isn't in `/links` (or has no `url`) shows a
    "Link not found" toast instead of downloading.
- `store.html` — the catalog page (this used to be `index.html`):
  header, hero, category filters, product grid, cart drawer, checkout
  modal.
- `login.html` — log in / sign up page. No backend yet — it just
  remembers a name + email in `localStorage` (see `auth.js`) so the
  header can greet you. Swap in real auth whenever a backend exists.
- `product.html` — a single template shared by **every** catalog
  item. Reads `?id=<product-id>` from the URL and renders that
  product's gallery, price, purchase controls, "what you get", FAQ,
  and related items straight from `products.js`. Add a new product to
  `products.js` and it gets a working detail page automatically —
  nothing else needs to change.
- `style.css` — all styling. Color/type tokens are CSS variables at
  the top of the file (`:root`) — change them there to retheme.
- `products.js` — the product catalog (`PlayLearn_PRODUCTS`) and
  category list (`PlayLearn_CATEGORIES`). Edit this to add, remove, or
  reprice items. `index.html`'s dashboard also reads it, to know which
  semester/category combinations exist and how to label each row —
  product ids are expected to look like `cse-semN` / `pyq-semN` /
  `ebook-semN` for a semester N to show up there.
- `cart.js` — shared by every shop page: cart state, the drawer, the
  checkout modal, toasts, and the Razorpay integration stub. Loads
  before any page-specific script. Not loaded on `index.html`.
- `auth.js` — the lightweight client-side session used by the header's
  account link. Shared by every page, including `index.html`.
- `catalog.js` — catalog-page-only logic (category filtering, grid
  rendering, hero animation). Only used by `store.html`.
- `product.js` — product-page-only logic (populating the template from
  `?id=`, gallery thumbnails, quantity stepper, FAQ accordion, related
  items). Only used by `product.html`.

Because the cart lives in `localStorage` under one key, it stays in
sync as a shopper moves between the catalog, any product page, and
login.

## Running it

No build step. Open `store.html` (the catalog) or `index.html` (the
dashboard) directly in a browser, or serve the folder with any static
server, e.g.:

```
npx serve .
```

## How the cart works today

- Cart contents are stored in the browser via `localStorage`
  (key `PlayLearn_shop_cart_v1`), so it persists across page reloads on
  the same device.
- "Add to cart" adds a line item; the drawer lets you adjust quantity or
  remove items.
- "Buy now" on a card or a product page skips the cart and opens
  checkout for that one item directly.
- "Checkout" collects a name and email, then calls
  `initiateRazorpayCheckout()` in `cart.js`.
- All of this is unchanged from before — only the visuals and the
  product-page routing changed.

## How login works today

- `login.html` has Log in and Sign up tabs. Submitting either just
  saves `{ name, email }` to `localStorage` (key
  `PlayLearn_shop_user_v1`) — there's no password check or server yet.
- The header's account link (`auth.js`) reflects that: "log in" when
  signed out, "<name> · log out" when signed in.
- "Continue as guest" skips straight back to the shop.
- This is intentionally a stub so the flow is testable end-to-end.
  Wiring up real auth (password hashing, sessions, etc.) needs a
  backend — happy to help build that when you're ready.

## Razorpay — current state

`initiateRazorpayCheckout()` in `cart.js` opens a real Razorpay
Checkout modal using the public `key_id` (currently a **test** key,
`rzp_test_...`, set as `RAZORPAY_KEY_ID` at the top of that section).
`checkout.js` is loaded on `store.html` and `product.html` before
`cart.js`.

**This is real Checkout, but it's missing the server side that makes
it trustworthy for real money:**

- There's no `order_id`. Razorpay lets Checkout run off just an
  amount, which is fine for testing but means nothing pins the
  charge to a specific order on your end.
- There's no signature verification after payment. The `handler`
  callback firing is treated as success, but a user with devtools
  open could in principle fake that callback — there's no server
  checking Razorpay's signature to confirm a payment actually
  happened.

**Before taking real payments**, add a small backend with two
endpoints:

1. **Create order** — using your `key_secret` (never put this in
   front-end code, ever — it's the credential that can move money),
   call Razorpay's Orders API server-side to mint an `order_id` for
   the order total, and return `{ order_id }` to the browser. Pass it
   into the `options.order_id` field in `initiateRazorpayCheckout()`.
2. **Verify payment** — after Checkout's `handler` fires, send the
   response to your server and verify the signature there
   (Razorpay's standard HMAC check) before treating the order as
   paid or sending the delivery email.

Everything else — cart, drawer, checkout form, success screen —
already expects this shape and won't need changes once a backend
exists.

**Key hygiene:** the `key_secret` that came with this key must never
be committed to this repo or referenced in any `.js` file that ships
to the browser. Keep it only in server-side environment config.

## Receipt PDF

The success screen has a "Download receipt (PDF)" button. It builds
an A4-sized PDF in the browser (via [jsPDF](https://github.com/parallax/jsPDF),
loaded from a CDN — see `downloadReceiptPDF()` in `cart.js`) listing
the order ID, date, the buyer's name / phone number / email address
as their own labeled lines, line items, and total, and saves it as
`PlayLearn-receipt-<order-id>.pdf`. Since it's a real PDF file, opening
it and printing (Ctrl/Cmd+P) also prints correctly at A4. No backend
involved — it's generated entirely from the order data already in the
browser after checkout.

The receipt header also carries the PlayLearn logo. `cart.js` fetches
`PlayLearn_round_logo.png` at receipt-build time and hands it to
jsPDF's `addImage()` — that's why the PNG needs to stay in the same
folder as `store.html` / `cart.js`, alongside the other assets. If the
fetch fails for any reason (e.g. the file's missing), the receipt
still generates, just without the logo.

## Account page (`profile.html`)

- **Personal info**, **Security**, **Order details**, **Raise a
  query**, and **Your queries** are each a collapsible section
  (native `<details>`/`<summary>`, styled to match the FAQ accordion
  on `product.html`) — click a heading to expand it. "Personal info"
  opens by default; the rest start collapsed. Log out sits at the
  very bottom, below all sections.
- **Personal info** — Name and Phone are editable and save straight to
  `/users/<emailKey>` in Firebase (via `.update()`, so the stored
  password is untouched). Email is shown read-only since it's the
  record's key.
- **Security** — a new-password + confirm form, also written to
  `/users/<emailKey>`. Like the rest of this stub auth, there's no
  current-password check yet.
- **Order details** — unchanged: purchase history with per-item
  Download links resolved against `/links`.
- **Raise a query / Your queries** — a threaded support-ticket flow.
  Submitting the textarea creates `/queries/<emailKey>/<queryId>` as
  `{ email, status: "open", createdAt, updatedAt, messages: { <msgId>:
  { sender: "user", text, date } } }`. Every later message — from
  either the shopper here or an admin in `admin.html` — is pushed into
  that same `messages` map, so a query can go back and forth any
  number of times. While a query is still `"open"`, "Your queries"
  shows the full thread plus a small reply box to add another
  message; once an admin marks it `"closed"`, the thread stays
  visible but read-only. "Your queries" lists everything under that
  key, newest-updated first.

## Admin panel (`admin.html`) — layout

Sales stays a plain, always-visible section. "Product links",
"Customers", and "Support queries" are each collapsible (native
`<details>`/`<summary>`, same visual language as the accordions on
`profile.html`/`product.html`) — click a heading to expand or
collapse it. All three start open.

## Admin panel (`admin.html`) — Support queries

A "Support queries" section lists every **open** query across every
shopper — flattened from `/queries/<emailKey>/<queryId>` — showing
the full message thread so far, plus a reply textarea and two
buttons: **Save reply** (appends your text to the thread as a new
`sender: "admin"` message; the query stays open and stays in this
list, so the shopper can reply again and the back-and-forth
continues) and **Mark as closed** (appends the textarea's text too,
if any, then sets `status: "closed"` and removes the card from this
list). Closed queries never come back here, but the shopper still
sees the whole thread — read-only — under "Your queries" on their
own profile page. In both places, the original message from the
shopper sits on the left and every admin reply sits on the right, so
the thread reads like a normal chat.

## Admin panel (`admin.html`) — Customers

A "Customers" section lists every account from `/users` in a table
with **Name**, **Phone**, and **Email** as editable inputs right in
the row. Editing Name/Phone and hitting **Save** just updates that
record in place.

Editing **Email** and hitting Save moves the *whole* account, in the
same shape everything was already stored in:

1. A new `/users/<newEmailKey>` row is written first, carrying over
   the existing password untouched.
2. Every order under `/purchases/<oldEmailKey>` is copied to
   `/purchases/<newEmailKey>`, with each order's own `email` field
   updated to match.
3. Every ticket under `/queries/<oldEmailKey>` is copied to
   `/queries/<newEmailKey>` the same way (message thread contents
   are untouched — only the top-level `email` field changes).
4. Any `/checkout/<orderId>` entry (the flat order-tracking mirror
   `cart.js` writes on every checkout attempt, keyed by order id
   rather than by account) that still carries the old email gets its
   `email` field updated too, so nothing under the old address is
   left behind anywhere.
5. Only after all of the above writes succeed are the old
   `/users/<oldEmailKey>`, `/purchases/<oldEmailKey>`, and
   `/queries/<oldEmailKey>` nodes removed — so a failed write never
   loses the original account or its history.

It refuses to save if the new email already belongs to a different
account. **Delete** removes an account entirely (its purchases and
queries are left in place under their existing key, since deleting a
customer isn't the same as merging their history elsewhere), after a
confirmation prompt.

Note this only moves data Firebase actually holds under
the account's email key — it can't reach into the shopper's own
browser, so if they're logged in on a device already, their local
session there still shows the old email until they log in again with
the new one.

## Admin panel (`admin.html`) — Sales

The "Items sold / Total revenue / Orders" stats stay as an all-time
total, same as before. Below that, a date picker (defaulting to
today) shows just that day's orders/items/revenue — change the date
to look at any other day.

## Admin panel (`admin.html`) — one admin only

Only one `/admin` record is ever allowed. If one already exists, the
"Sign up" tab and "Create one" link are hidden — the sign-in tab is
the only option — and the signup form itself re-checks before writing
(so this can't be bypassed by a stale page or a direct request). To
replace the admin account, delete the existing record under
`/admin` in the Firebase console first.

## Delivery of digital goods

There's no backend yet, so "delivery by email" is currently just a
promise shown on the success screen. Once Razorpay is live, the natural
next step is a small server endpoint that verifies the payment
signature and emails the purchased files — happy to help build that
when you're ready.
