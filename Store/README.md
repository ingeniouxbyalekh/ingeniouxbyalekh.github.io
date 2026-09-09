# INGENIOUX Shop

A standalone storefront for INGENIOUX — separate from the main portfolio
site. Sells research papers, books, guides, and templates, priced in
INR. Light, clean, checkout-style UI: rounded cards, soft shadows,
pill buttons.

## Files

- `index.html` — the catalog page: header, hero, category filters,
  product grid, cart drawer, checkout modal.
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
- `products.js` — merges the two Firebase product tables
  (`products-digital`, `products-physical`) into one
  `INGENIOUX_PRODUCTS` array, tagging each item's `type`, plus the
  category list (`INGENIOUX_CATEGORIES`). Edit products in admin.html,
  not this file.
- `cart.js` — shared by every shop page: cart state, the drawer, the
  checkout modal, toasts, and the Razorpay integration stub. Loads
  before any page-specific script.
- `auth.js` — the lightweight client-side session used by the header's
  account link. Shared by `index.html`, `product.html`, and
  `login.html`.
- `catalog.js` — catalog-page-only logic (category filtering, grid
  rendering, hero animation). Only used by `index.html`.
- `product.js` — product-page-only logic (populating the template from
  `?id=`, gallery thumbnails, quantity stepper, FAQ accordion, related
  items). Only used by `product.html`.

Because the cart lives in `localStorage` under one key, it stays in
sync as a shopper moves between the catalog, any product page, and
login.

## Running it

No build step. Open `index.html` directly in a browser, or serve the
folder with any static server, e.g.:

```
npx serve .
```

## How the cart works today

- Cart contents are stored in the browser via `localStorage`
  (key `ingenioux_shop_cart_v1`), so it persists across page reloads on
  the same device.
- "Add to cart" adds a line item; the drawer lets you adjust quantity or
  remove items — **except for digital products**, which are capped at
  quantity 1 (everyone buys exactly one copy). A digital line in the
  drawer shows a fixed "qty 1" instead of the +/− stepper; clicking
  "Add to cart" again just confirms it's already in there. Physical
  products keep the ordinary stepper and unlimited quantity.
- "Buy now" on a card or a product page skips the cart and opens
  checkout for that one item directly.
- "Checkout" collects a name and email, then calls
  `initiateRazorpayCheckout()` in `cart.js`.
- All of this is unchanged from before — only the visuals and the
  product-page routing changed.

## How login works today

- `login.html` has Log in and Sign up tabs. Submitting either just
  saves `{ name, email }` to `localStorage` (key
  `ingenioux_shop_user_v1`) — there's no password check or server yet.
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
`checkout.js` is loaded on `index.html` and `product.html` before
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
`ingenioux-receipt-<order-id>.pdf`. Since it's a real PDF file, opening
it and printing (Ctrl/Cmd+P) also prints correctly at A4. No backend
involved — it's generated entirely from the order data already in the
browser after checkout.

The receipt header also carries the INGENIOUX logo. `cart.js` fetches
`ingenioux_round_logo.png` at receipt-build time and hands it to
jsPDF's `addImage()` — that's why the PNG needs to stay in the same
folder as `index.html` / `cart.js`, alongside the other assets. If the
fetch fails for any reason (e.g. the file's missing), the receipt
still generates, just without the logo.

## Account page (`profile.html`)

- **Personal info**, **Security**, **Digital purchases**, **Physical
  purchases**, **Raise a query**, and **Your queries** are each a
  collapsible section (native `<details>`/`<summary>`, styled to
  match the FAQ accordion on `product.html`) — click a heading to
  expand it. "Personal info" opens by default; the rest start
  collapsed. Log out sits at the very bottom, below all sections.
- **Personal info** — Name and Phone are editable and save straight to
  `/users/<emailKey>` in Firebase (via `.update()`, so the stored
  password is untouched). Email is shown read-only since it's the
  record's key.
- **Security** — a new-password + confirm form, also written to
  `/users/<emailKey>`. Like the rest of this stub auth, there's no
  current-password check yet.
- **Digital purchases** / **Physical purchases** — purchase history,
  split into two sections since one order can mix both kinds of item
  (they share a single cart). Each order shows up in whichever
  section(s) match the items it contains. Digital line items get an
  inline Download link, resolved against that product's own `link`
  field (`/products-digital/<id>/link` — set in `admin.html`'s
  Digital Products section); physical line items don't, since those
  ship instead.
- **Raise a query / Your queries** — a threaded support-ticket flow.
  Before the message box, the shopper first picks what it's about —
  **Profile**, **Orders**, or **Other** — which decides what shows up
  next: Profile asks for one of **Change email** / **Update details**
  / **Delete account** / **Other**; Orders asks the shopper to pick
  one of their own past orders from a dropdown (built from
  `/purchases/<emailKey>`, the same data "Digital/Physical purchases"
  reads). Submitting creates `/queries/<emailKey>/<queryId>` as
  `{ email, category, profileReason, orderId, status: "open",
  createdAt, updatedAt, messages: { <msgId>: { sender: "user", text,
  date } } }` — `profileReason`/`orderId` are only set when they
  apply, `null` otherwise. "Your queries" shows that subject as a
  one-line label at the top of each thread. Every later message —
  from either the shopper here or an admin in `admin.html` — is
  pushed into that same `messages` map, so a query can go back and
  forth any number of times. While a query is still `"open"`, "Your
  queries" shows the full thread plus a small reply box to add
  another message; once an admin marks it `"closed"`, the thread
  stays visible but read-only. "Your queries" lists everything under
  that key, newest-updated first.

## Admin panel (`admin.html`) — Digital Products / Physical Products

Two separate sections, each backed by its own Firebase table —
`products-digital` and `products-physical` — that `products.js`
merges into one catalog for `index.html`/`product.html` to read from,
tagging every item with `type`. Same Category/Title/Blurb/Price/
Format/Tag fields in both, with two differences:

- **Digital Products** also has a **Link** — the download URL a
  shopper reaches via the "Download" button on their profile page
  once an order's paid. This used to live in its own `/links/<id>`
  table (editable from `executive.html`); that table and its
  "Product links" section are gone now — the URL lives directly on
  the digital product record instead, so one edit in this table is
  all that's needed to update it everywhere. Physical products have
  no Link field — there's nothing to download, they ship instead.
- **Physical Products** also has a **Stock** — how many units are
  available. Every shopper buys exactly one of a digital item, so
  digital products don't carry a stock field at all (see "How the
  cart works today"); physical items are capped by whatever number is
  set here.
- Every shopper buys exactly one of a digital item — the cart caps
  its quantity at 1 (see "How the cart works today"). Physical items
  have ordinary quantity, up to whatever's in stock.

## Stock (physical products)

- Set on each row in **admin.html**'s Physical Products table (a
  plain number — units currently available). A physical product added
  before this field existed defaults its stock input to `0` on that
  table (so Save always writes a real number), but is otherwise
  treated as unlimited everywhere else in the shop until its stock is
  set explicitly — see `productStock()` in `cart.js`.
- **Out of stock** (stock at 0): the catalog card, and the product
  page's hero section, swap the add/buy controls for a single
  disabled "Out of stock" button instead.
- **Hitting the limit**: the catalog card's and cart drawer's "+"
  stepper, and the product page's quantity stepper, all stop at the
  remaining stock. Clicking "+" again — or clicking "Add to cart"/"Buy
  now" for more than what's left — shows a popup with the amount
  actually available and an OK button, rather than overselling.
  Implemented once in `cart.js` (`productStock()`,
  `showStockLimitPopup()`) and reused by `catalog.js` and `product.js`.
- **After a successful order**: each physical line item's stock drops
  by the quantity bought (`decrementStockForOrder()` in `cart.js`,
  called right after the order's marked successful, for both a
  Razorpay payment and a coupon that zeroes out the total). It uses a
  Firebase transaction rather than a plain read-then-write, so two
  shoppers checking out at the same time can't both read the same
  number and oversell it, and it never lets stock go below 0. Like the
  rest of the order bookkeeping, this is best-effort — a Firebase
  hiccup here doesn't undo or block the order itself, it just means
  that one write didn't land and the count in admin.html needs a
  manual correction.

An ID is scoped to its own table, so the same ID could in principle
exist in both `products-digital` and `products-physical` — the shop
doesn't currently guard against that, so it's worth keeping IDs
unique across both tables by convention.

## Admin panel (`admin.html`) — layout

Sales stays a plain, always-visible section. "Customers" and "Support
queries" are each collapsible (native `<details>`/`<summary>`, same
visual language as the accordions on `profile.html`/`product.html`) —
click a heading to expand or collapse it. Both start open.

## Admin panel (`admin.html`) — Support queries

A "Support queries" section lists every **open** query across every
shopper — flattened from `/queries/<emailKey>/<queryId>` — showing
the subject the shopper picked when raising it (Profile/Orders/Other,
plus whichever reason or order they chose — see "Raise a query /
Your queries" above) above the full message thread so far, plus a
reply textarea and two buttons: **Save reply** (appends your text to
the thread as a new `sender: "admin"` message; the query stays open
and stays in this list, so the shopper can reply again and the
back-and-forth continues) and **Mark as closed** (appends the
textarea's text too, if any, then sets `status: "closed"` and removes
the card from this list). Closed queries never come back here, but
the shopper still sees the whole thread — read-only — under "Your
queries" on their own profile page. In both places, the original
message from the shopper sits on the left and every admin reply sits
on the right, so the thread reads like a normal chat.

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
