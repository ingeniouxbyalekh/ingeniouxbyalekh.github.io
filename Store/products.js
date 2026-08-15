/**
 * INGENIOUX Shop — product catalog
 * ---------------------------------
 * The paid catalog (INGENIOUX_PRODUCTS) is no longer hardcoded here —
 * it's loaded from Firebase Realtime Database, so admin.html's
 * "Digital Products" / "Physical Products" sections can add/edit/delete
 * items without touching code. There are two separate tables:
 *
 *   /products-digital/<id>  -> delivered by download link/email. Every
 *                              shopper buys exactly one (see cart.js).
 *   /products-physical/<id> -> shipped. Ordinary quantity, no link.
 *
 * Both tables share the same underlying shape:
 *
 *   { id, category, title, blurb, price, format, tag, link?, stock? }
 *
 *   price    -> INR, integer rupees (no paise)
 *   format   -> short label shown on the card, e.g. "PDF", "APK", "Paperback"
 *   category -> one of: papers | projects | apk | others
 *   link     -> DIGITAL ONLY — download URL sent to a shopper once
 *               they've paid, set/edited on admin.html's Digital
 *               Products section, and read straight from here by
 *               profile.html's "Download" buttons. Physical products
 *               don't have this field.
 *   stock    -> PHYSICAL ONLY — units available, set/edited on
 *               admin.html's Physical Products section. Caps how much
 *               a shopper can add to cart or buy at once; hits 0 and
 *               the item shows as out of stock. See productStock() in
 *               cart.js (loaded after this file, before catalog.js/
 *               product.js) for how the rest of the app reads it —
 *               digital products don't have this field.
 *
 * This file fetches both tables and merges them into one
 * INGENIOUX_PRODUCTS array (so the catalog grid, category filters,
 * and product-detail template all keep working unchanged), tagging
 * every item with `type: "digital"` or `type: "physical"` so cart.js,
 * product.js, and profile.html can tell them apart — e.g. digital
 * items are capped at quantity 1, physical items aren't.
 *
 * Because the fetch is async, INGENIOUX_PRODUCTS starts out as an
 * empty array and only gets filled in once the Firebase read
 * resolves. Anything that reads it on page load (cart.js's initial
 * renderCart(), catalog.js's initial render, product.js's product
 * lookup) awaits INGENIOUX_PRODUCTS_READY first — see those files.
 * Code that only runs later, from a click, is unaffected since the
 * array is populated well before a shopper can interact.
 */

let INGENIOUX_PRODUCTS = [];

let _resolveProductsReady;
const INGENIOUX_PRODUCTS_READY = new Promise((resolve) => {
  _resolveProductsReady = resolve;
});

// products.js loads before the Firebase SDK <script> tags on every
// page (unchanged order), so `db` (set up in auth.js) doesn't exist
// yet the instant this file runs. Poll briefly rather than reorder
// script tags everywhere — by the time any async callback fires,
// every synchronous <script> on the page (including auth.js) has
// already run.
function waitForDb(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (typeof db !== "undefined" && db) return resolve(db);
      if (Date.now() - start > timeoutMs) return reject(new Error("Firebase never initialized"));
      setTimeout(poll, 50);
    })();
  });
}

// Loads one product table and tags every item with `type` (either
// "digital" or "physical") so the rest of the app can branch on it
// without a second lookup.
async function loadProductTable(tableName, type) {
  const snap = await db.ref(tableName).once("value");
  return snap.exists()
    ? Object.entries(snap.val()).map(([key, p]) => ({ ...p, id: p.id || key, type }))
    : [];
}

async function loadProductsFromCloud() {
  try {
    await waitForDb();
    const [digital, physical] = await Promise.all([
      loadProductTable("products-digital", "digital"),
      loadProductTable("products-physical", "physical"),
    ]);
    INGENIOUX_PRODUCTS = [...digital, ...physical];
  } catch (err) {
    console.error("Could not load products from Firebase:", err);
    INGENIOUX_PRODUCTS = [];
  } finally {
    _resolveProductsReady(INGENIOUX_PRODUCTS);
  }
}

loadProductsFromCloud();

const INGENIOUX_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "papers", label: "Research Papers" },
  { id: "apk", label: "Apk Files" },
  { id: "others", label: "Others" },
];

