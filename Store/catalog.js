/**
 * INGENIOUX Shop — catalog page logic
 * ---------------------------------------------------------------
 * Only used on index.html. Cart state and the drawer/checkout are
 * handled by cart.js, loaded before this file.
 * ---------------------------------------------------------------
 */

let activeCategory = "all";

const catalogEl = document.getElementById("catalog-grid");
const catalogCountEl = document.getElementById("catalog-count");
const categoryBarEl = document.getElementById("category-bar");

function categoryLabel(id) {
  const match = INGENIOUX_CATEGORIES.find((c) => c.id === id);
  return match ? match.label : id;
}

function renderCategoryChips() {
  categoryBarEl.innerHTML = "";
  INGENIOUX_CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = cat.label;
    btn.setAttribute("aria-pressed", String(cat.id === activeCategory));
    btn.addEventListener("click", () => {
      activeCategory = cat.id;
      renderCategoryChips();
      renderCatalog();
    });
    categoryBarEl.appendChild(btn);
  });
}

function productCardHTML(p) {
  const qtyInCart = cart[p.id] || 0;
  const href = `product.html?id=${p.id}`;
  const coverInner = `
        <div class="card-cover" aria-hidden="true">
          <span class="stamp">${categoryLabel(p.category).charAt(0)}</span>
          <span class="fmt">${p.format}</span>
        </div>`;
  // Physical items with nothing left in stock (see products-physical/
  // <id>.stock, set on admin.html) show a single disabled "Out of
  // stock" control instead of the usual add/buy pair — see
  // isOutOfStock() in cart.js.
  const outOfStock = typeof isOutOfStock === "function" && isOutOfStock(p);

  // Digital items only ever hold qty 1 — the button just toggles
  // between "Add to cart" and "Remove from cart" rather than showing
  // a count. Physical items aren't capped at 1 — once one is in the
  // cart, the card shows a real "− N +" stepper (same qty-control
  // markup/behavior as the cart drawer, handled by cart.js's existing
  // delegated click listener, which also stops the "+" once stock
  // runs out and shows a popup) instead of a plain "In cart · N"
  // button, so the quantity can go up or down straight from the
  // catalog.
  const addControlHTML = outOfStock
    ? ""
    : p.type === "digital"
      ? `<button class="btn add-btn" type="button" data-id="${p.id}">
           ${qtyInCart > 0 ? "Remove from cart" : "Add to cart"}
         </button>`
      : qtyInCart > 0
      ? `<div class="qty-control">
           <button type="button" data-action="dec" data-id="${p.id}" aria-label="Decrease quantity">−</button>
           <span>${qtyInCart}</span>
           <button type="button" data-action="inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
         </div>`
      : `<button class="btn add-btn" type="button" data-id="${p.id}">Add to cart</button>`;

  const buyControlHTML = outOfStock
    ? `<button class="btn out-of-stock-btn" type="button" disabled>Out of stock</button>`
    : `<button class="btn btn-primary buy-btn" type="button" data-id="${p.id}">Buy now</button>`;

  return `
    <article class="card${outOfStock ? " is-out-of-stock" : ""}" data-id="${p.id}">
      <a class="card-cover-link" href="${href}" aria-label="View ${p.title}">${coverInner}</a>
      <span class="card-tag">${p.tag}</span>
      <h3><a href="${href}">${p.title}</a></h3>
      <p>${p.blurb}</p>
      <div class="card-footer">
        <span class="price">${p.price.toLocaleString("en-IN")}</span>
        <div class="card-buttons">
          ${addControlHTML}
          ${buyControlHTML}
        </div>
      </div>
    </article>
  `;
}

function renderCatalog() {
  const items =
    activeCategory === "all"
      ? INGENIOUX_PRODUCTS
      : INGENIOUX_PRODUCTS.filter((p) => p.category === activeCategory);

  catalogCountEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

  if (items.length === 0) {
    catalogEl.innerHTML = `<div class="empty-state">→ No items in this category yet.</div>`;
    return;
  }

  catalogEl.innerHTML = items.map(productCardHTML).join("");
}

/* ---------------------------------------------------------------
   Init
   ---------------------------------------------------------------
   INGENIOUX_PRODUCTS now loads asynchronously from Firebase (see
   products.js) — wait for it before the first render.
--------------------------------------------------------------- */
INGENIOUX_PRODUCTS_READY.then(() => {
  renderCategoryChips();
  renderCatalog();
});
