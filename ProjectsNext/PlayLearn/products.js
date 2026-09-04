/**
 * PlayLearn Shop — product catalog
 * ---------------------------------
 * Edit this list to add, remove, or reprice items. Nothing else in the
 * codebase needs to change — store.html reads this file and renders
 * the grid, cart, and checkout summary from it. index.html (the
 * "your study material" dashboard) also reads it, to know which
 * semesters/categories exist and to label each download row.
 *
 * price   -> INR, integer rupees (no paise). 0 = free item, still goes
 *            through the normal cart/checkout flow (see note in README
 *            about Razorpay and ₹0 orders).
 * format  -> short label shown on the card, e.g. "PDF", "ZIP"
 * category-> used only to label each card (see PlayLearn_CATEGORIES
 *            below) — currently just "cse". There's no category filter
 *            on the store anymore, so this no longer needs to match a
 *            filter option.
 */

const PlayLearn_PRODUCTS = [
  // ---- Category 1: CSE (Full course — Notes + PYQ + eBooks) ----
  {
    id: "cse-sem1",
    category: "cse",
    title: "CSE Semester 1 — Full Course",
    blurb: "Welcome Gift from our side.",
    price: 0,
    format: "ZIP",
    tag: "Full Course",
  },
  {
    id: "cse-sem2",
    category: "cse",
    title: "CSE Semester 2 — Full Course",
    blurb: "Complete bundle for CSE Semester 2: notes, previous year questions, and eBooks.",
    price: 49,
    format: "ZIP",
    tag: "Full Course",
  },
  {
    id: "cse-sem3",
    category: "cse",
    title: "CSE Semester 3 — Full Course",
    blurb: "Complete bundle for CSE Semester 3: notes, previous year questions, and eBooks.",
    price: 49,
    format: "ZIP",
    tag: "Full Course",
  },
    {
    id: "cse-sem4",
    category: "cse",
    title: "CSE Semester 4 — Full Course",
    blurb: "Complete bundle for CSE Semester 3: notes, previous year questions, and eBooks.",
    price: 49,
    format: "ZIP",
    tag: "Full Course",
  },
];

const PlayLearn_CATEGORIES = [
  { id: "cse", label: "CSE" },
];
