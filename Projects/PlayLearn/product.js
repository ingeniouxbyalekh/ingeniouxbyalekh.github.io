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

// pulls "Semester N" out of ids like "cse-sem1" / "pyq-sem3" / "ebook-sem2";
// falls back to the tag when an id doesn't follow that pattern
function semesterLabel(p) {
  const match = /sem(\d+)/i.exec(p.id);
  return match ? `Sem ${match[1]}` : p.tag;
}

// which of the three class components a given product line unlocks —
// mirrors the unlock rules in index.html's dashboard
function includedModules(p) {
  const all = ["Notes", "PYQ", "eBooks"];
  if (/^cse-sem/.test(p.id)) return all;
  if (/^pyq-sem/.test(p.id)) return ["PYQ"];
  if (/^ebook-sem/.test(p.id)) return ["eBooks"];
  return all;
}

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

  const modules = includedModules(p);

  document.getElementById("mock-eyebrow").textContent = `${catLabel.toLowerCase()} / ${p.tag.toLowerCase()}`;
  document.getElementById("mock-badge").textContent = semesterLabel(p);
  document.getElementById("mock-title").textContent = p.title;
  document.getElementById("mock-modules").innerHTML = modules
    .map((m) => `<div class="class-module"><span class="tick">✓</span>${m}</div>`)
    .join("");
  document.getElementById("mock-footer").textContent = "PlayLearn — Instant Dashboard Access";

  document.getElementById("info-eyebrow").textContent = `// ${catLabel.toLowerCase()}`;
  document.getElementById("info-title").textContent = p.title;
  document.getElementById("info-blurb").textContent = p.blurb;
  document.getElementById("info-price").textContent = p.price === 0 ? "Free" : p.price.toLocaleString("en-IN");
  document.getElementById("info-format").textContent = p.format;
  document.getElementById("mobile-price").textContent = p.price === 0 ? "Free" : p.price.toLocaleString("en-IN");

  document.getElementById("hero-add-btn").dataset.id = p.id;
  document.getElementById("hero-buy-btn").dataset.id = p.id;

  document.getElementById("highlight-row").innerHTML = `
    <div class="highlight"><span class="dot">●</span> Unlocks in your dashboard instantly</div>
    <div class="highlight"><span class="dot">●</span> ${modules.join(" + ")}</div>
    <div class="highlight"><span class="dot">●</span> ${semesterLabel(p)} · ${catLabel}</div>
    <div class="highlight"><span class="dot">●</span> Free updates for this edition</div>
  `;

  const moduleDesc = {
    Notes: "Chapter-wise class notes, ready to read or print.",
    PYQ: "Previous-year question papers, sorted by subject.",
    eBooks: "Reference eBooks for the full semester.",
  };
  document.getElementById("whats-inside-list").innerHTML = modules
    .map(
      (m) =>
        `<li><span class="chapter-num">✓</span><span><span class="chapter-title">${m}</span><span class="chapter-desc">${moduleDesc[m]}</span></span></li>`
    )
    .join("") +
    `<li><span class="chapter-num">→</span><span><span class="chapter-title">Yours to keep</span><span class="chapter-desc">One-time purchase. No subscription, no expiry.</span></span></li>
    <li><span class="chapter-num">→</span><span><span class="chapter-title">Free minor updates</span><span class="chapter-desc">If this edition gets revised, you'll get the update at no extra cost.</span></span></li>`;

  document.getElementById("about-heading").textContent = `About this course`;
  document.getElementById("about-block").innerHTML = `
    <p>${p.blurb}</p>
    <p>Part of the PlayLearn ${catLabel} classes — the same independent study material used for the main course, packaged as a one-time bundle so you can keep it, print it, or study offline.</p>
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
  const modules = includedModules(p);

  const views = {
    overview: {
      eyebrow: `${catLabel} / ${p.tag.toLowerCase()}`,
      modules: modules.map((m) => `<div class="class-module"><span class="tick">✓</span>${m}</div>`).join(""),
      footer: "PlayLearn — Instant Dashboard Access",
    },
    included: {
      eyebrow: "what's inside this bundle",
      modules: modules
        .map((m) => `<div class="class-module"><span class="tick">✓</span>${m} included</div>`)
        .join(""),
      footer: "Everything above comes in one purchase",
    },
    dashboard: {
      eyebrow: "after you buy",
      modules: `<div class="class-module"><span class="tick">→</span>Appears in "My downloads"</div><div class="class-module"><span class="tick">→</span>No email wait — it's instant</div>`,
      footer: "Log in to see it land in your dashboard",
    },
  };

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      thumbs.forEach((t) => t.setAttribute("aria-pressed", "false"));
      thumb.setAttribute("aria-pressed", "true");
      const view = views[thumb.dataset.view] || views.overview;
      document.getElementById("mock-eyebrow").textContent = view.eyebrow;
      document.getElementById("mock-modules").innerHTML = view.modules;
      document.getElementById("mock-footer").textContent = view.footer;
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
