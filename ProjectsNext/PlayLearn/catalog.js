/**
 * PlayLearn Shop — catalog page logic
 * ---------------------------------------------------------------
 * Only used on store.html. Cart state and the drawer/checkout are
 * handled by cart.js, loaded before this file.
 *
 * There used to be a separate Paid/Free mode toggle with its own
 * direct-download catalog (PlayLearn_FREE_PRODUCTS, now removed from
 * products.js). Free batches now live in PlayLearn_PRODUCTS as ₹0 items that go through the normal
 * cart/checkout flow instead, filterable via the "Free" category chip
 * like everything else — so that toggle and its separate render path
 * are gone.
 * ---------------------------------------------------------------
 */

let activeCategory = "all";

const catalogEl = document.getElementById("catalog-grid");
const catalogCountEl = document.getElementById("catalog-count");
const categoryBarEl = document.getElementById("category-bar");

function categoryLabel(id) {
  const match = PlayLearn_CATEGORIES.find((c) => c.id === id);
  return match ? match.label : id;
}

function renderCategoryChips() {
  categoryBarEl.innerHTML = "";
  PlayLearn_CATEGORIES.forEach((cat) => {
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
  const inCart = Boolean(cart[p.id]);
  const href = `product.html?id=${p.id}`;
  const coverInner = `
        <div class="card-cover" aria-hidden="true">
          <span class="stamp">${categoryLabel(p.category).charAt(0)}</span>
          <span class="fmt">${p.format}</span>
        </div>`;

  return `
    <article class="card" data-id="${p.id}">
      <a class="card-cover-link" href="${href}" aria-label="View ${p.title}">${coverInner}</a>
      <span class="card-tag">${p.tag}</span>
      <h3><a href="${href}">${p.title}</a></h3>
      <p>${p.blurb}</p>
      <div class="card-footer">
        <span class="price">${p.price === 0 ? "Free" : p.price.toLocaleString("en-IN")}</span>
        <div class="card-buttons">
          <button class="btn add-btn" type="button" data-id="${p.id}">
            ${inCart ? "Remove from cart" : "Add to cart"}
          </button>
          <button class="btn btn-primary buy-btn" type="button" data-id="${p.id}">Buy now</button>
        </div>
      </div>
    </article>
  `;
}

function renderCatalog() {
  const items =
    activeCategory === "all"
      ? PlayLearn_PRODUCTS
      : PlayLearn_PRODUCTS.filter((p) => p.category === activeCategory);

  catalogCountEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

  if (items.length === 0) {
    catalogEl.innerHTML = `<div class="empty-state">→ No items in this category yet.</div>`;
    return;
  }

  catalogEl.innerHTML = items.map(productCardHTML).join("");
}

/* ---------------------------------------------------------------
   Init
--------------------------------------------------------------- */
renderCategoryChips();
renderCatalog();
