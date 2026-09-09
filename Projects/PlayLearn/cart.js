/**
 * PlayLearn Shop — shared cart module
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

const CART_KEY = "PlayLearn_shop_cart_v1";
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
  return PlayLearn_PRODUCTS.find((p) => p.id === id);
}

function cartLines() {
  return Object.keys(cart)
    .map((id) => ({ product: findProduct(id) }))
    .filter((line) => line.product);
}

function cartCount() {
  return Object.keys(cart).length;
}

function cartTotal() {
  return cartLines().reduce((sum, line) => sum + line.product.price, 0);
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
  const { product } = line;
  return `
    <div class="cart-item" data-id="${product.id}">
      <div class="cart-item-title">${product.title}</div>
      <button class="cart-item-remove" type="button" data-id="${product.id}">remove</button>
      <div class="cart-item-meta">
        <span class="price">${product.price === 0 ? "Free" : product.price.toLocaleString("en-IN")}</span>
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
function addToCart(id) {
  cart[id] = 1;
  saveCart();
  renderCart();
  const product = findProduct(id);
  if (product) showToast(`added ${product.id} to cart`);
}

function removeFromCart(id) {
  delete cart[id];
  saveCart();
  renderCart();
  showToast(`removed ${id} from cart`);
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

// Set once a payment succeeds; the receipt PDF is built from this.
let lastCompletedOrder = null;

function openCheckout(singleItemId) {
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
  // bypassing the cart, for a one-item checkout — always exactly one
  // unit of that item.
  const lines = singleItemId
    ? [{ product: findProduct(singleItemId) }]
    : cartLines();

  if (lines.length === 0) return;

  checkoutForm.dataset.singleItem = singleItemId || "";

  document.getElementById("checkout-name").value = user.name || "";
  document.getElementById("checkout-phone").value = user.phone || "";
  document.getElementById("checkout-email").value = user.email || "";

  const orderTotal = lines.reduce((s, l) => s + l.product.price, 0);
  checkoutSummaryEl.innerHTML =
    lines
      .map(
        (line) => `
      <div class="row">
        <span>${line.product.title}</span>
        <span>${line.product.price === 0 ? "Free" : INR(line.product.price)}</span>
      </div>`
      )
      .join("") +
    `<div class="row total"><span>Total</span><span>${orderTotal === 0 ? "Free" : INR(orderTotal)}</span></div>`;

  const payBtn = checkoutForm.querySelector("button[type=submit]");
  if (payBtn) payBtn.textContent = orderTotal === 0 ? "Get for free" : "Pay with Razorpay";

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

checkoutForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const singleItemId = checkoutForm.dataset.singleItem;
  const lines = singleItemId
    ? [{ product: findProduct(singleItemId) }]
    : cartLines();

  const total = lines.reduce((s, l) => s + l.product.price, 0);

  const order = {
    id: "ord_" + Date.now().toString(36),
    date: new Date().toISOString(),
    name: document.getElementById("checkout-name").value.trim(),
    phone: document.getElementById("checkout-phone").value.trim(),
    email: document.getElementById("checkout-email").value.trim(),
    items: lines.map((l) => ({ id: l.product.id, title: l.product.title, qty: 1, price: l.product.price })),
    total,
    currency: "INR",
  };

  // Record the attempt before the payment popup even opens.
  saveCheckoutRecord(order, "initiated");

  // ₹0 orders (the catalog's free batches) skip Razorpay entirely —
  // a live key_id can't process a zero-amount charge, and there's
  // nothing to actually pay for. Complete the order immediately
  // instead of opening the payment modal.
  if (order.total === 0) {
    updateCheckoutStatus(order.id, "successful");
    const completedOrder = { ...order, razorpay: null };
    savePurchaseRecord(completedOrder);

    if (!singleItemId) {
      cart = {};
      saveCart();
      renderCart();
    }
    lastCompletedOrder = completedOrder;
    checkoutStepForm.style.display = "none";
    checkoutStepSuccess.style.display = "block";
    return;
  }

  // Hand off to payment; see the Razorpay integration section below.
  initiateRazorpayCheckout(order, {
    onSuccess: (completedOrder) => {
      updateCheckoutStatus(order.id, "successful", {
        razorpayPaymentId: (completedOrder.razorpay && completedOrder.razorpay.razorpay_payment_id) || "",
      });
      savePurchaseRecord(completedOrder);

      if (!singleItemId) {
        cart = {};
        saveCart();
        renderCart();
      }
      lastCompletedOrder = completedOrder;
      checkoutStepForm.style.display = "none";
      checkoutStepSuccess.style.display = "block";
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
    name: "PlayLearn",
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
  doc.text("PlayLearn", titleX, y);
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
    "Digital invoice. No signature required",
    marginX,
    pageHeight - 20
  );
  doc.text("PlayLearn by Alekh", marginX, pageHeight - 14);

  doc.save(`invoice.pdf`);
}

/* ---------------------------------------------------------------
   Event wiring shared by every page
--------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".add-btn");
  if (addBtn) {
    const id = addBtn.dataset.id;
    if (cart[id]) {
      removeFromCart(id);
    } else {
      addToCart(id);
    }
    return;
  }
  const buyBtn = e.target.closest(".buy-btn");
  if (buyBtn) {
    openCheckout(buyBtn.dataset.id);
    return;
  }
  const removeBtn = e.target.closest(".cart-item-remove");
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.id);
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
  }
});

/* ---------------------------------------------------------------
   Init
--------------------------------------------------------------- */
renderCart();
