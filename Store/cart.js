/**
 * INGENIOUX Shop — shared cart module
 * ---------------------------------------------------------------
 * Cart state, drawer, checkout modal, toast, and the Razorpay stub.
 * Loaded on every shop page (catalog, product pages) so the cart
 * persists across them via localStorage. Requires products.js to
 * be loaded first.
 *
 * Page-specific scripts (catalog.js, product.js) can call
 * addToCart(id), openCheckout(id|null), and read `cart` directly —
 * this file re-renders the drawer and, if present on the page,
 * the catalog grid too.
 * ---------------------------------------------------------------
 */

const CART_KEY = "ingenioux_shop_cart_v1";
const INR = (n) => "₹" + n.toLocaleString("en-IN");

/* ---------------------------------------------------------------
   State
--------------------------------------------------------------- */
let cart = loadCart();

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Could not read cart from storage:", err);
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (err) {
    console.error("Could not save cart to storage:", err);
  }
}

function findProduct(id) {
  return INGENIOUX_PRODUCTS.find((p) => p.id === id);
}

/* ---------------------------------------------------------------
   Stock (physical products only)
   ---------------------------------------------------------------
   `stock` lives on a products-physical/<id> record (set on
   admin.html) and caps how many of that item a shopper can hold.
   Digital items don't carry a stock field — they're already capped
   at qty 1 elsewhere — and a physical product with no `stock` field
   set (pre-existing data from before this field existed) is treated
   as unlimited so it doesn't suddenly become unbuyable.
--------------------------------------------------------------- */
function productStock(product) {
  if (!product || product.type !== "physical") return Infinity;
  const n = Number(product.stock);
  return Number.isFinite(n) ? n : Infinity;
}

function isOutOfStock(product) {
  return !!product && product.type === "physical" && productStock(product) <= 0;
}

/* ---------------------------------------------------------------
   Stock limit popup — shown whenever a shopper's quantity request
   (a card/cart "+" tap, an "Add to cart", or a "Buy now" quantity)
   would exceed what's left. See callers below.
--------------------------------------------------------------- */
const stockModalOverlay = document.getElementById("stock-modal-overlay");
const stockModalMessageEl = document.getElementById("stock-modal-message");

function showStockLimitPopup(product) {
  if (!stockModalOverlay || !stockModalMessageEl || !product) return;
  const max = productStock(product);
  stockModalMessageEl.textContent =
    max > 0
      ? `Only ${max} of "${product.title}" available right now.`
      : `"${product.title}" is currently out of stock.`;
  stockModalOverlay.classList.add("is-open");
}

function closeStockLimitPopup() {
  if (stockModalOverlay) stockModalOverlay.classList.remove("is-open");
}

if (stockModalOverlay) {
  const stockModalOkBtn = document.getElementById("stock-modal-ok-btn");
  const stockModalCloseBtn = document.getElementById("close-stock-modal-btn");
  if (stockModalOkBtn) stockModalOkBtn.addEventListener("click", closeStockLimitPopup);
  if (stockModalCloseBtn) stockModalCloseBtn.addEventListener("click", closeStockLimitPopup);
  stockModalOverlay.addEventListener("click", (e) => {
    if (e.target === stockModalOverlay) closeStockLimitPopup();
  });
}

function cartLines() {
  return Object.entries(cart)
    .map(([id, qty]) => ({ product: findProduct(id), qty }))
    .filter((line) => line.product && line.qty > 0);
}

function cartCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

function cartTotal() {
  return cartLines().reduce((sum, line) => sum + line.product.price * line.qty, 0);
}

/* ---------------------------------------------------------------
   Rendering: cart drawer
--------------------------------------------------------------- */
const drawerEl = document.getElementById("cart-drawer");
const overlayEl = document.getElementById("cart-overlay");
const cartItemsEl = document.getElementById("cart-items");
const cartEmptyEl = document.getElementById("cart-empty");
const cartCountBadge = document.getElementById("cart-count-badge");
const cartSubtotalEl = document.getElementById("cart-subtotal");
const checkoutBtn = document.getElementById("checkout-btn");

function cartItemHTML(line) {
  const { product, qty } = line;
  // Digital items are capped at qty 1 (see addToCart) — no +/- stepper,
  // just "remove" to take it back out. Physical items keep the stepper.
  const qtyControl =
    product.type === "digital"
      ? `<span class="qty-fixed">qty 1</span>`
      : `
        <div class="qty-control">
          <button type="button" data-action="dec" data-id="${product.id}" aria-label="Decrease quantity">−</button>
          <span>${qty}</span>
          <button type="button" data-action="inc" data-id="${product.id}" aria-label="Increase quantity">+</button>
        </div>`;
  return `
    <div class="cart-item" data-id="${product.id}">
      <div class="cart-item-title">${product.title}</div>
      <button class="cart-item-remove" type="button" data-id="${product.id}">remove</button>
      <div class="cart-item-meta">
        ${qtyControl}
        <span class="price">${(product.price * qty).toLocaleString("en-IN")}</span>
      </div>
    </div>
  `;
}

function renderCart() {
  const lines = cartLines();
  const count = cartCount();

  if (cartCountBadge) {
    cartCountBadge.textContent = count;
    cartCountBadge.style.display = count > 0 ? "inline-flex" : "none";
  }

  if (cartItemsEl && cartEmptyEl && checkoutBtn) {
    if (lines.length === 0) {
      cartItemsEl.innerHTML = "";
      cartEmptyEl.style.display = "block";
      checkoutBtn.disabled = true;
    } else {
      cartEmptyEl.style.display = "none";
      cartItemsEl.innerHTML = lines.map(cartItemHTML).join("");
      checkoutBtn.disabled = false;
    }
  }

  if (cartSubtotalEl) cartSubtotalEl.textContent = cartTotal().toLocaleString("en-IN");

  // keep any on-page product buttons ("Add to cart" -> "In cart · N") in sync;
  // these functions only exist on pages that define them (catalog.js, product.js)
  if (typeof renderCatalog === "function") renderCatalog();
  if (typeof renderCategoryChips === "function") renderCategoryChips();
  if (typeof syncProductPageButtons === "function") syncProductPageButtons();
}

function openDrawer() {
  drawerEl.classList.add("is-open");
  overlayEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  drawerEl.classList.remove("is-open");
  overlayEl.classList.remove("is-open");
  drawerEl.setAttribute("aria-hidden", "true");
}

/* ---------------------------------------------------------------
   Cart mutations
--------------------------------------------------------------- */
function addToCart(id, qty = 1) {
  const product = findProduct(id);

  // Digital items are one-per-shopper — clicking "Add to cart" again
  // just confirms it's already in there rather than stacking quantity.
  if (product && product.type === "digital") {
    if (cart[id]) {
      showToast(`${product.id} is already in your cart`);
      return;
    }
    cart[id] = 1;
  } else {
    // Physical items are capped by admin-set stock — never let a cart
    // line grow past what's actually available.
    const max = productStock(product);
    const current = cart[id] || 0;
    if (current >= max) {
      showStockLimitPopup(product);
      return;
    }
    const desired = current + qty;
    cart[id] = Math.min(desired, max);
    saveCart();
    renderCart();
    if (desired > max) {
      showStockLimitPopup(product);
    } else if (product) {
      showToast(`added ${product.id} to cart`);
    }
    return;
  }

  saveCart();
  renderCart();
  if (product) showToast(`added ${product.id} to cart`);
}

function setQty(id, qty) {
  if (qty <= 0) {
    delete cart[id];
  } else {
    cart[id] = qty;
  }
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  renderCart();
  showToast(`removed ${id} from cart`);
}

// Used by the catalog card / product hero "Add to cart" button.
// Digital items are one-per-shopper, so that same button toggles
// between adding and removing rather than stacking quantity — physical
// items just add (removal there happens from the cart drawer instead).
function handleAddButtonClick(id) {
  const product = findProduct(id);
  if (product && product.type === "digital" && cart[id]) {
    removeFromCart(id);
  } else {
    addToCart(id);
  }
}

/* ---------------------------------------------------------------
   Toast (terminal-style log line)
--------------------------------------------------------------- */
const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span class="prompt">$</span>${message}`;
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

/* ---------------------------------------------------------------
   Checkout modal
--------------------------------------------------------------- */
const checkoutOverlay = document.getElementById("checkout-overlay");
const checkoutForm = document.getElementById("checkout-form");
const checkoutSummaryEl = document.getElementById("checkout-summary");
const checkoutStepForm = document.getElementById("checkout-step-form");
const checkoutStepSuccess = document.getElementById("checkout-step-success");
const downloadReceiptBtn = document.getElementById("download-receipt-btn");
const checkoutSubmitBtn = document.getElementById("checkout-submit-btn");
const couponInputEl = document.getElementById("coupon-input");
const couponApplyBtn = document.getElementById("coupon-apply-btn");
const couponFeedbackEl = document.getElementById("coupon-feedback");

// Set once a payment succeeds; the receipt PDF is built from this.
let lastCompletedOrder = null;

/* ---------------------------------------------------------------
   Coupons
   ---------------------------------------------------------------
   `checkoutLines` is whatever's being bought this checkout (either
   the whole cart, or a single "Buy now" item) — set once in
   openCheckout() and read from here on so the coupon math and the
   final submit agree on the same line items.
   `appliedCoupon`, when set, is { code, discountPercent,
   maxDiscount, amount } — `amount` is the actual ₹ knocked off,
   already worked out against the current subtotal so it never
   needs recomputing on submit.
--------------------------------------------------------------- */
let checkoutLines = [];
let appliedCoupon = null;

function checkoutRawTotal() {
  return checkoutLines.reduce((s, l) => s + l.product.price * l.qty, 0);
}

function checkoutFinalTotal() {
  const raw = checkoutRawTotal();
  return appliedCoupon ? Math.max(0, raw - appliedCoupon.amount) : raw;
}

function resetCoupon() {
  appliedCoupon = null;
  if (couponInputEl) couponInputEl.value = "";
  if (couponFeedbackEl) {
    couponFeedbackEl.textContent = "";
    couponFeedbackEl.className = "coupon-feedback";
  }
}

function renderCheckoutSummary() {
  const rawTotal = checkoutRawTotal();
  let html = checkoutLines
    .map(
      (line) => `
      <div class="row">
        <span>${line.product.title} × ${line.qty}</span>
        <span>${INR(line.product.price * line.qty)}</span>
      </div>`
    )
    .join("");

  if (appliedCoupon) {
    html += `
      <div class="row coupon-applied-row">
        <span>Coupon (${appliedCoupon.code})</span>
        <span>−${INR(appliedCoupon.amount)}</span>
      </div>`;
  }

  html += `<div class="row total"><span>Total</span><span>${INR(checkoutFinalTotal())}</span></div>`;
  checkoutSummaryEl.innerHTML = html;

  if (checkoutSubmitBtn) {
    checkoutSubmitBtn.textContent = checkoutFinalTotal() === 0 ? "Complete order" : "Pay with Razorpay";
  }
}

if (couponApplyBtn) {
  couponApplyBtn.addEventListener("click", async () => {
    const codeRaw = (couponInputEl.value || "").trim();
    if (!codeRaw) {
      couponFeedbackEl.textContent = "Enter a coupon code";
      couponFeedbackEl.className = "coupon-feedback is-error";
      return;
    }
    const code = codeRaw.toUpperCase();

    if (!db) {
      couponFeedbackEl.textContent = "Couldn't reach the server — try again";
      couponFeedbackEl.className = "coupon-feedback is-error";
      return;
    }

    couponApplyBtn.disabled = true;
    couponApplyBtn.textContent = "Checking…";
    try {
      const snap = await db.ref("coupon/" + code).once("value");
      if (!snap.exists()) {
        appliedCoupon = null;
        couponFeedbackEl.textContent = "Invalid coupon code";
        couponFeedbackEl.className = "coupon-feedback is-error";
        renderCheckoutSummary();
        return;
      }

      const c = snap.val();
      const rawTotal = checkoutRawTotal();
      const percent = Number(c.discountPercent) || 0;
      const maxDiscount = Number(c.maxDiscount) || 0;
      const amount = Math.min(Math.round((rawTotal * percent) / 100), maxDiscount, rawTotal);

      appliedCoupon = { code, discountPercent: percent, maxDiscount, amount };
      couponFeedbackEl.innerHTML = `Coupon applied — you saved ${INR(amount)} <button type="button" class="coupon-remove-btn" id="coupon-remove-btn">remove</button>`;
      couponFeedbackEl.className = "coupon-feedback is-success";
      renderCheckoutSummary();
    } catch (err) {
      console.error("Coupon check failed:", err);
      couponFeedbackEl.textContent = "Couldn't check that code — try again";
      couponFeedbackEl.className = "coupon-feedback is-error";
    } finally {
      couponApplyBtn.disabled = false;
      couponApplyBtn.textContent = "Apply";
    }
  });
}

// "remove" link is injected dynamically into couponFeedbackEl above,
// so it's wired via delegation rather than a direct listener.
if (couponFeedbackEl) {
  couponFeedbackEl.addEventListener("click", (e) => {
    if (!e.target.closest("#coupon-remove-btn")) return;
    resetCoupon();
    renderCheckoutSummary();
  });
}

function openCheckout(singleItemId, singleItemQty) {
  // Guests get sent to log in first — checkout details are filled
  // from the logged-in profile, not typed fresh each time. `next`
  // brings them back to whatever page they were buying from.
  const user = typeof getUser === "function" ? getUser() : null;
  if (!user || !user.email) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `login.html?next=${next}`;
    return;
  }

  // singleItemId is set when the shopper clicked "Buy now" directly,
  // bypassing the cart, for a one-item checkout.
  const lines = singleItemId
    ? [{ product: findProduct(singleItemId), qty: singleItemQty || 1 }]
    : cartLines();

  if (lines.length === 0) return;

  // Physical items are capped by admin-set stock — a quantity that
  // exceeds what's left (whether from "Buy now" or a stale cart line)
  // shouldn't be allowed through to checkout.
  for (const line of lines) {
    const max = productStock(line.product);
    if (line.qty > max) {
      showStockLimitPopup(line.product);
      return;
    }
  }

  checkoutForm.dataset.singleItem = singleItemId || "";
  checkoutForm.dataset.singleItemQty = singleItemQty || 1;

  document.getElementById("checkout-name").value = user.name || "";
  document.getElementById("checkout-phone").value = user.phone || "";
  document.getElementById("checkout-email").value = user.email || "";

  checkoutLines = lines;
  resetCoupon();
  renderCheckoutSummary();

  checkoutStepForm.style.display = "block";
  checkoutStepSuccess.style.display = "none";
  checkoutOverlay.classList.add("is-open");
  closeDrawer();
}

function closeCheckout() {
  checkoutOverlay.classList.remove("is-open");
}

/* ---------------------------------------------------------------
   Firebase — order tracking
   ---------------------------------------------------------------
   /checkout/<orderId>            one record per checkout attempt,
                                   status: "initiated" -> "successful"
                                   or "failed". Written the moment
                                   "Pay with Razorpay" is clicked, then
                                   updated once Razorpay responds.
   /purchases/<emailKey>/<orderId> mirrored here only once a payment
                                   actually succeeds, so a shopper's
                                   node lists every completed order —
                                   this is what profile.html reads.
   Both are best-effort: a Firebase hiccup here never blocks the
   actual payment flow, it just means that one record didn't save.
--------------------------------------------------------------- */
async function saveCheckoutRecord(order, status) {
  if (!db) return;
  try {
    await db.ref("checkout/" + order.id).set({
      id: order.id,
      date: order.date,
      name: order.name,
      phone: order.phone,
      email: order.email,
      items: order.items,
      subtotal: order.subtotal != null ? order.subtotal : order.total,
      discount: order.discount || 0,
      coupon: order.coupon || null,
      total: order.total,
      currency: order.currency,
      status,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Could not save checkout record:", err);
  }
}

async function updateCheckoutStatus(orderId, status, extra = {}) {
  if (!db) return;
  try {
    await db.ref("checkout/" + orderId).update({
      status,
      ...extra,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Could not update checkout status:", err);
  }
}

async function savePurchaseRecord(order) {
  if (!db || !order.email) return;
  try {
    await db.ref("purchases/" + emailToKey(order.email) + "/" + order.id).set({
      id: order.id,
      date: order.date,
      name: order.name,
      phone: order.phone,
      email: order.email,
      items: order.items,
      subtotal: order.subtotal != null ? order.subtotal : order.total,
      discount: order.discount || 0,
      coupon: order.coupon || null,
      total: order.total,
      currency: order.currency,
      status: "successful",
      razorpayPaymentId: (order.razorpay && order.razorpay.razorpay_payment_id) || "",
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Could not save purchase record:", err);
  }
}

/* ---------------------------------------------------------------
   Stock decrement — once an order actually goes through, every
   physical line item's stock drops by the quantity bought (digital
   items don't carry a stock field, so they're skipped). Uses a
   Firebase transaction rather than a plain read-then-write, so two
   shoppers checking out around the same time can't both read the
   same number and oversell it — it also never lets stock go below 0
   even if more was somehow ordered than was left. Best-effort like
   the other order bookkeeping on this page: a Firebase hiccup here
   never undoes or blocks the order itself.
--------------------------------------------------------------- */
async function decrementStockForOrder(order) {
  if (!db || !order || !Array.isArray(order.items)) return;
  const physicalItems = order.items.filter((item) => item.type === "physical" && item.qty > 0);
  if (physicalItems.length === 0) return;

  await Promise.all(
    physicalItems.map(async (item) => {
      try {
        const ref = db.ref("products-physical/" + item.id + "/stock");
        const result = await ref.transaction((current) => {
          const n = Number(current);
          const currentStock = Number.isFinite(n) ? n : 0;
          return Math.max(0, currentStock - item.qty);
        });
        // Keep the in-memory catalog in sync so the catalog/product
        // page reflects the reduced stock right away, without waiting
        // on a full reload from Firebase.
        if (result && result.committed && result.snapshot) {
          const product = findProduct(item.id);
          if (product) product.stock = result.snapshot.val();
        }
      } catch (err) {
        console.error(`Could not decrement stock for ${item.id}:`, err);
      }
    })
  );

  // Re-render so any out-of-stock button / capped "+" stepper on
  // screen reflects the new numbers immediately.
  renderCart();
}

checkoutForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const singleItemId = checkoutForm.dataset.singleItem;
  // checkoutLines was set (and kept current) by openCheckout()/the
  // coupon-apply handler — reuse it rather than recomputing, so the
  // items charged here always match what the summary showed.
  const lines = checkoutLines;

  const subtotal = checkoutRawTotal();
  const discount = appliedCoupon ? appliedCoupon.amount : 0;
  const total = checkoutFinalTotal();

  const order = {
    id: "ord_" + Date.now().toString(36),
    date: new Date().toISOString(),
    name: document.getElementById("checkout-name").value.trim(),
    phone: document.getElementById("checkout-phone").value.trim(),
    email: document.getElementById("checkout-email").value.trim(),
    items: lines.map((l) => ({ id: l.product.id, title: l.product.title, qty: l.qty, price: l.product.price, type: l.product.type })),
    subtotal,
    discount,
    coupon: appliedCoupon ? appliedCoupon.code : null,
    total,
    currency: "INR",
  };

  // Record the attempt before the payment popup even opens (or, for
  // a coupon that covers the whole order, before it's marked paid).
  saveCheckoutRecord(order, "initiated");

  function completeOrder(completedOrder) {
    if (!singleItemId) {
      cart = {};
      saveCart();
      renderCart();
    }
    lastCompletedOrder = completedOrder;
    checkoutStepForm.style.display = "none";
    checkoutStepSuccess.style.display = "block";
  }

  // A coupon can knock the total all the way to ₹0 — nothing to
  // charge, so skip Razorpay entirely and confirm the order directly.
  if (total === 0) {
    updateCheckoutStatus(order.id, "successful", { note: "free order — coupon covered the full amount" });
    savePurchaseRecord(order);
    decrementStockForOrder(order);
    showToast("order confirmed");
    completeOrder(order);
    return;
  }

  // Hand off to payment; see the Razorpay integration section below.
  initiateRazorpayCheckout(order, {
    onSuccess: (completedOrder) => {
      updateCheckoutStatus(order.id, "successful", {
        razorpayPaymentId: (completedOrder.razorpay && completedOrder.razorpay.razorpay_payment_id) || "",
      });
      savePurchaseRecord(completedOrder);
      decrementStockForOrder(completedOrder);
      completeOrder(completedOrder);
    },
    onFailure: (err) => {
      console.error("Payment failed:", err);
      updateCheckoutStatus(order.id, "failed", { failureReason: String(err && err.description ? err.description : err) });
      showToast("payment failed — try again");
    },
  });
});

/* ---------------------------------------------------------------
   Razorpay integration
   ---------------------------------------------------------------
   Live, but backend-less: opens the real Razorpay Checkout using
   only the public key_id below (never put a key_secret here — it
   would be readable by anyone who views this file in the browser).

   Because there's no backend yet, this does NOT create a real
   Razorpay order_id and does NOT verify the payment signature
   afterward. That means:
     - Real payments do go through (this is not a simulation).
     - Nothing server-side confirms the amount charged actually
       matches this order, or that "success" wasn't spoofed by
       someone poking at devtools before the modal opened.
   That's an acceptable gap for testing with a test-mode key, but
   NOT something to rely on for real transactions. To close it:
     1. Add a small server endpoint that, using your key_secret
        (kept server-side only, never in this repo), calls
        Razorpay's Orders API to mint an order_id for the order
        total, and returns { order_id } to the browser.
     2. Pass that order_id into the options below.
     3. Add a second server endpoint that verifies the payment
        signature Razorpay sends to the handler callback before
        you treat the order as paid / trigger delivery email.
   Until then, treat this as "works, but trust the money side only
   as much as you'd trust any unverified client-side flow."
--------------------------------------------------------------- */
const RAZORPAY_KEY_ID = "rzp_live_TOsCHwGP3tNy9c";

/* ---------------------------------------------------------------
   Normalize a shopper-typed phone number into the format Razorpay's
   prefill.contact expects: "+91" followed by the 10-digit number.
   Strips spaces/dashes and any accidentally-typed "+91"/"91"/"0"
   prefix, so it doesn't matter exactly how the shopper typed it.
--------------------------------------------------------------- */
function toRazorpayContact(rawPhone) {
  if (!rawPhone) return undefined;
  let digits = String(rawPhone).replace(/\D/g, ""); // strip anything non-numeric
  if (digits.length > 10) digits = digits.slice(-10); // drop any leading country code/zero
  if (digits.length !== 10) return undefined; // not a usable number — leave contact unset
  return `+91${digits}`;
}

function initiateRazorpayCheckout(order, callbacks) {
  if (typeof Razorpay === "undefined") {
    console.error("Razorpay Checkout.js did not load.");
    showToast("payment unavailable — try again later");
    callbacks.onFailure("checkout.js not loaded");
    return;
  }

  const options = {
    key: RAZORPAY_KEY_ID,
    amount: order.total * 100, // paise
    currency: order.currency || "INR",
    name: "INGENIOUX",
    description: order.items.map((i) => `${i.id} × ${i.qty}`).join(", "),
    // order_id: <from your backend, once one exists — see note above>
    prefill: {
      name: order.name,
      email: order.email,
      contact: toRazorpayContact(order.phone),
    },
    notes: { order_id: order.id },
    theme: { color: "#111111" },
    handler: (response) => {
      console.log("Razorpay payment response:", response);
      callbacks.onSuccess({ ...order, razorpay: response });
    },
    modal: {
      ondismiss: () => callbacks.onFailure("dismissed"),
    },
  };

  const rzp = new Razorpay(options);
  console.log("Razorpay prefill sent:", options.prefill); // TEMP — remove once phone prefill is confirmed working
  rzp.on("payment.failed", (response) => {
    console.error("Razorpay payment failed:", response.error);
    callbacks.onFailure(response.error);
  });
  rzp.open();
}

/* ---------------------------------------------------------------
   Receipt PDF (A4)
   ---------------------------------------------------------------
   Built entirely in the browser with jsPDF (no backend needed for
   this part — it's just formatting data the browser already has).
   Triggered from the "Download receipt" button on the success
   screen, using whatever order last completed (lastCompletedOrder).
--------------------------------------------------------------- */
const RECEIPT_LOGO_URL = "logo.png";
let cachedReceiptLogoDataUrl = null;

// Fetches the shop logo once and caches it as a data URL so jsPDF's
// addImage() (which needs base64/data-URL input, not a plain path)
// can draw it. Resolves to null on any failure so the receipt still
// generates without the logo rather than breaking entirely.
function loadReceiptLogoDataURL() {
  if (cachedReceiptLogoDataUrl) return Promise.resolve(cachedReceiptLogoDataUrl);
  return fetch(RECEIPT_LOGO_URL)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            cachedReceiptLogoDataUrl = reader.result;
            resolve(cachedReceiptLogoDataUrl);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    )
    .catch((err) => {
      console.error("Could not load receipt logo:", err);
      return null;
    });
}

async function downloadReceiptPDF(order) {
  if (!order) return;
  if (typeof window.jspdf === "undefined") {
    console.error("jsPDF did not load.");
    showToast("couldn't build the receipt — try again");
    return;
  }

  const logoDataUrl = await loadReceiptLogoDataURL();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" }); // 210 × 297mm
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 20;
  let y = 24;

  // Header — logo (if it loaded) sits left of the wordmark
  const logoSize = 14;
  let titleX = marginX;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", marginX, y - 10, logoSize, logoSize);
    titleX = marginX + logoSize + 4;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("INGENIOUX", titleX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text("Receipt", pageWidth - marginX, y, { align: "right" });
  doc.setTextColor(0);

  y += 6;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 10;

  // Order meta — name, phone, and email each get their own labeled
  // row (rather than one combined "Billed to" line) so the buyer's
  // contact details are unambiguous on the receipt.
  const purchaseDate = new Date(order.date || Date.now());
  doc.setFontSize(10);
  const valueX = marginX + 40;
  const metaRows = [
    ["Order ID", order.id],
    ["Date", purchaseDate.toLocaleString("en-IN")],
    ["Name", order.name],
    ["Phone Number", toRazorpayContact(order.phone) || order.phone],
    ["Email Address", order.email],
  ];
  if (order.razorpay && order.razorpay.razorpay_payment_id) {
    metaRows.push(["Payment ID", order.razorpay.razorpay_payment_id]);
  }
  metaRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value), valueX, y);
    y += 6;
  });

  y += 6;

  // Line items table (drawn by hand — no autotable plugin loaded)
  const colTitle = marginX;
  const colQty = pageWidth - marginX - 62;
  const colPrice = pageWidth - marginX - 34;
  const colLineTotal = pageWidth - marginX;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("ITEM", colTitle, y);
  doc.text("QTY", colQty, y, { align: "right" });
  doc.text("PRICE", colPrice, y, { align: "right" });
  doc.text("TOTAL", colLineTotal, y, { align: "right" });
  doc.setTextColor(0);
  y += 3;
  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  order.items.forEach((item) => {
    const lineTotal = item.price * item.qty;
    const titleLines = doc.splitTextToSize(item.title, colQty - colTitle - 6);
    doc.text(titleLines, colTitle, y);
    doc.text(String(item.qty), colQty, y, { align: "right" });
    doc.text(`Rs. ${item.price.toLocaleString("en-IN")}`, colPrice, y, { align: "right" });
    doc.text(`Rs. ${lineTotal.toLocaleString("en-IN")}`, colLineTotal, y, { align: "right" });
    y += 6 * titleLines.length + 2;
  });

  y += 4;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 10;

  if (order.discount) {
    const subtotal = order.subtotal != null ? order.subtotal : order.total + order.discount;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Subtotal", colPrice, y, { align: "right" });
    doc.text(`Rs. ${subtotal.toLocaleString("en-IN")}`, colLineTotal, y, { align: "right" });
    y += 6;
    doc.text(order.coupon ? `Coupon (${order.coupon})` : "Coupon discount", colPrice, y, { align: "right" });
    doc.text(`- Rs. ${order.discount.toLocaleString("en-IN")}`, colLineTotal, y, { align: "right" });
    y += 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", colPrice, y, { align: "right" });
  doc.text(`Rs. ${order.total.toLocaleString("en-IN")}`, colLineTotal, y, { align: "right" });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Digital goods, delivered by email. Questions: business.ingenioux@gmail.com",
    marginX,
    pageHeight - 20
  );
  doc.text("INGENIOUX by Alekh", marginX, pageHeight - 14);

  doc.save(`invoice.pdf`);
}

/* ---------------------------------------------------------------
   Event wiring shared by every page
--------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".add-btn");
  if (addBtn) {
    handleAddButtonClick(addBtn.dataset.id);
    return;
  }
  const buyBtn = e.target.closest(".buy-btn");
  if (buyBtn) {
    // Digital items are always qty 1, so this stays 1 for them either
    // way. Physical items aren't capped at 1 anymore (see catalog.js's
    // "− N +" stepper) — if this item already has a quantity selected
    // in the cart, "Buy now" should check out that quantity instead of
    // silently resetting it to 1.
    const id = buyBtn.dataset.id;
    const product = findProduct(id);
    if (isOutOfStock(product)) {
      showStockLimitPopup(product);
      return;
    }
    const qty = product && product.type === "physical" && cart[id] ? cart[id] : 1;
    openCheckout(id, qty);
    return;
  }
  const removeBtn = e.target.closest(".cart-item-remove");
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.id);
    return;
  }
  const qtyBtn = e.target.closest(".qty-control button");
  if (qtyBtn) {
    const id = qtyBtn.dataset.id;
    const current = cart[id] || 0;
    if (qtyBtn.dataset.action === "inc") {
      const product = findProduct(id);
      const max = productStock(product);
      if (current >= max) {
        showStockLimitPopup(product);
        return;
      }
      setQty(id, current + 1);
    } else {
      setQty(id, current - 1);
    }
    return;
  }
});

document.getElementById("open-cart-btn").addEventListener("click", openDrawer);
document.getElementById("close-cart-btn").addEventListener("click", closeDrawer);
overlayEl.addEventListener("click", closeDrawer);

checkoutBtn.addEventListener("click", () => openCheckout(null));
document.getElementById("close-checkout-btn").addEventListener("click", closeCheckout);
checkoutOverlay.addEventListener("click", (e) => {
  if (e.target === checkoutOverlay) closeCheckout();
});
document.getElementById("checkout-done-btn").addEventListener("click", closeCheckout);
if (downloadReceiptBtn) {
  downloadReceiptBtn.addEventListener("click", () => downloadReceiptPDF(lastCompletedOrder));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDrawer();
    closeCheckout();
    closeStockLimitPopup();
  }
});

/* ---------------------------------------------------------------
   Init
   ---------------------------------------------------------------
   INGENIOUX_PRODUCTS now loads asynchronously from Firebase (see
   products.js) — wait for it before the first render so cart lines
   can actually resolve to a product.
--------------------------------------------------------------- */
INGENIOUX_PRODUCTS_READY.then(() => {
  renderCart();
});
