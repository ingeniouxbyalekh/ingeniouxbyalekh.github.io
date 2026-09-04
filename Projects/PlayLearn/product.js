/**
 * PlayLearn Shop — product detail page logic
 * ---------------------------------------------------------------
 * product.html is a single template shared by every catalog item.
 * This file reads ?id=<product-id> from the URL, looks it up in
 * PlayLearn_PRODUCTS (products.js), and fills in the page. Adding a
 * new product to products.js automatically gets a working detail
 * page — nothing here needs to change.
 *
 * Add to cart / buy reuse addToCart() and openCheckout() from
 * cart.js, reading the quantity from the stepper first.
 * ---------------------------------------------------------------
 */

function categoryLabel(id) {
  const match = PlayLearn_CATEGORIES.find((c) => c.id === id);
  return match ? match.label : id;
}

// short binary-ish glyph per category, purely decorative
const CATEGORY_GLYPH = {
  papers: "01110000",
  projects: "01110010",
  apk: "01100001",
  others: "01111000",
};

const params = new URLSearchParams(window.location.search);
const PRODUCT_ID = params.get("id");
const PRODUCT = typeof findProduct === "function" ? findProduct(PRODUCT_ID) : null;

/* ---------------------------------------------------------------
   Not found — bail out to the catalog rather than show a blank page
--------------------------------------------------------------- */
if (!PRODUCT) {
  window.location.href = "store.html";
}

/* ---------------------------------------------------------------
   Populate the page from PRODUCT
--------------------------------------------------------------- */
function renderProductPage() {
  const p = PRODUCT;
  const catLabel = categoryLabel(p.category);

  document.getElementById("page-title").textContent = `${p.title} — PlayLearn Shop`;
  document.getElementById("page-description").setAttribute("content", `${p.blurb} ${p.format}, ₹${p.price}.`);

  document.getElementById("breadcrumb").innerHTML =
    `<a href="store.html">Shop</a> / <a href="store.html">${catLabel}</a> / ${p.title}`;

  document.getElementById("mock-eyebrow").textContent = `${catLabel.toLowerCase()} / ${p.tag.toLowerCase()}`;
  document.getElementById("mock-title").textContent = p.title;
  document.getElementById("mock-glyph").textContent = CATEGORY_GLYPH[p.category] || "01001110";

  document.getElementById("info-eyebrow").textContent = `// ${catLabel.toLowerCase()}`;
  document.getElementById("info-title").textContent = p.title;
  document.getElementById("info-blurb").textContent = p.blurb;
  document.getElementById("info-price").textContent = p.price === 0 ? "Free" : p.price.toLocaleString("en-IN");
  document.getElementById("info-format").textContent = p.format;
  document.getElementById("mobile-price").textContent = p.price === 0 ? "Free" : p.price.toLocaleString("en-IN");

  document.getElementById("hero-add-btn").dataset.id = p.id;
  document.getElementById("hero-buy-btn").dataset.id = p.id;

  document.getElementById("highlight-row").innerHTML = `
    <div class="highlight"><span class="dot">●</span> Instant download after checkout</div>
    <div class="highlight"><span class="dot">●</span> Format: ${p.format}</div>
    <div class="highlight"><span class="dot">●</span> ${p.tag}</div>
    <div class="highlight"><span class="dot">●</span> Personalized Dashboard</div>
  `;

  document.getElementById("whats-inside-list").innerHTML = `
    <li><span class="chapter-num">→</span><span><span class="chapter-title">Delivered as ${p.format}</span><span class="chapter-desc">Download the file(s) directly — no reader lock-in.</span></span></li>
    <li><span class="chapter-num">→</span><span><span class="chapter-title">Yours to keep</span><span class="chapter-desc">One-time purchase. No subscription, no expiry.</span></span></li>
    <li><span class="chapter-num">→</span><span><span class="chapter-title">Free minor updates</span><span class="chapter-desc">If this edition gets revised, you'll get the update at no extra cost.</span></span></li>
  `;

  document.getElementById("about-heading").textContent = `About this ${catLabel.toLowerCase().replace(/s$/, "")}`;
  document.getElementById("about-block").innerHTML = `
    <p>${p.blurb}</p>
    <p>Part of the PlayLearn ${catLabel.toLowerCase()} collection — independent research work, written and maintained the same way it's produced for the main site, just packaged to keep, print, or build on.</p>
  `;

  document.getElementById("faq-delivery").textContent =
    "You can get everything in your dashboard instantly once checkout is confirmed.";

  renderRelated(p);
}

function relatedCardHTML(p) {
  const catLabel = categoryLabel(p.category);
  return `
    <article class="card" data-id="${p.id}">
      <a class="card-cover-link" href="product.html?id=${p.id}" aria-label="View ${p.title}">
        <div class="card-cover" aria-hidden="true">
          <span class="stamp">${catLabel.charAt(0)}</span>
          <span class="fmt">${p.format}</span>
        </div>
      </a>
      <span class="card-tag">${p.tag}</span>
      <h3><a href="product.html?id=${p.id}">${p.title}</a></h3>
      <p>${p.blurb}</p>
      <div class="card-footer">
        <span class="price">${p.price === 0 ? "Free" : p.price.toLocaleString("en-IN")}</span>
        <div class="card-buttons">
          <button class="btn add-btn" type="button" data-id="${p.id}">Add to cart</button>
          <button class="btn btn-primary buy-btn" type="button" data-id="${p.id}">Buy now</button>
        </div>
      </div>
    </article>`;
}

function renderRelated(p) {
  const sameCategory = PlayLearn_PRODUCTS.filter((x) => x.id !== p.id && x.category === p.category);
  const others = PlayLearn_PRODUCTS.filter((x) => x.id !== p.id && x.category !== p.category);
  const related = [...sameCategory, ...others].slice(0, 3);
  document.getElementById("related-grid").innerHTML = related.map(relatedCardHTML).join("");
}

/* ---------------------------------------------------------------
   Gallery thumbnails (decorative view switcher)
--------------------------------------------------------------- */
function wireGallery() {
  const thumbs = document.querySelectorAll(".gallery-thumb");
  const mock = document.getElementById("item-mock");
  if (!thumbs.length || !mock) return;

  const p = PRODUCT;
  const catLabel = categoryLabel(p.category).toLowerCase();
  const views = {
    cover: { eyebrow: `${catLabel} / ${p.tag.toLowerCase()}`, glyph: CATEGORY_GLYPH[p.category] || "01001110" },
    spine: { eyebrow: `${p.format.toLowerCase()}`, glyph: "01100101" },
    spread: { eyebrow: "sample view", glyph: "01111000" },
  };

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      thumbs.forEach((t) => t.setAttribute("aria-pressed", "false"));
      thumb.setAttribute("aria-pressed", "true");
      const view = views[thumb.dataset.view] || views.cover;
      document.getElementById("mock-eyebrow").textContent = view.eyebrow;
      document.getElementById("mock-glyph").textContent = view.glyph;
    });
  });
}

/* ---------------------------------------------------------------
   Hero add-to-cart / buy-now — override the generic cart.js
   delegated handler just for these two buttons. Add/remove toggles
   a single unit of this product; buy-now always checks out exactly
   one unit.
--------------------------------------------------------------- */
function wireHeroButtons() {
  const addBtn = document.getElementById("hero-add-btn");
  const buyBtn = document.getElementById("hero-buy-btn");
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cart[PRODUCT_ID]) {
        removeFromCart(PRODUCT_ID);
      } else {
        addToCart(PRODUCT_ID);
      }
    });
  }
  if (buyBtn) {
    buyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCheckout(PRODUCT_ID);
    });
  }
}

// cart.js calls this after every render so the hero button label
// can reflect whether this item is already in the cart
function syncProductPageButtons() {
  const addBtn = document.getElementById("hero-add-btn");
  if (!addBtn || typeof cart === "undefined") return;
  addBtn.textContent = cart[PRODUCT_ID] ? "Remove from cart" : "Add to cart";
}

/* ---------------------------------------------------------------
   FAQ accordion
--------------------------------------------------------------- */
function wireAccordion() {
  document.querySelectorAll(".accordion-item").forEach((item) => {
    const trigger = item.querySelector(".accordion-trigger");
    trigger.addEventListener("click", () => {
      const isOpen = item.dataset.open === "true";
      item.dataset.open = String(!isOpen);
    });
  });
}

/* ---------------------------------------------------------------
   Init
--------------------------------------------------------------- */
if (PRODUCT) {
  renderProductPage();
  wireGallery();
  wireHeroButtons();
  wireAccordion();
  syncProductPageButtons();
}
