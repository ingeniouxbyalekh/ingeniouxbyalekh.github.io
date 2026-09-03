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
 * category-> one of: cse | pyq | ebook | free
 */

const PlayLearn_PRODUCTS = [
  // ---- Category 1: CSE (Full course — Notes + PYQ + eBooks) ----
  {
    id: "cse-sem1",
    category: "cse",
    title: "CSE Semester 1 — Full Course",
    blurb: "Limited time free. offer valid till 30/09/2026.",
    price: 0,
    format: "ZIP",
    tag: "Full Course",
  },
  {
    id: "cse-sem2",
    category: "cse",
    title: "CSE Semester 2 — Full Course",
    blurb: "Complete bundle for CSE Semester 2: notes, previous year questions, and eBooks.",
    price: 99,
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

  // ---- Category 2: PYQs (Previous year questions only) ----
  {
    id: "pyq-sem1",
    category: "pyq",
    title: "PYQs — Semester 1",
    blurb: "Previous year questions only, for Semester 1.",
    price: 29,
    format: "PDF",
    tag: "PYQ",
  },
  {
    id: "pyq-sem2",
    category: "pyq",
    title: "PYQs — Semester 2",
    blurb: "Previous year questions only, for Semester 2.",
    price: 29,
    format: "PDF",
    tag: "PYQ",
  },
  {
    id: "pyq-sem3",
    category: "pyq",
    title: "PYQs — Semester 3",
    blurb: "Previous year questions only, for Semester 3.",
    price: 19,
    format: "PDF",
    tag: "PYQ",
  },


  // ---- Category 3: eBooks (eBooks only) ----
  {
    id: "ebook-sem1",
    category: "ebook",
    title: "eBooks — Semester 1",
    blurb: "eBooks only, for Semester 1.",
    price: 29,
    format: "PDF",
    tag: "eBook",
  },
  {
    id: "ebook-sem2",
    category: "ebook",
    title: "eBooks — Semester 2",
    blurb: "eBooks only, for Semester 2.",
    price: 29,
    format: "PDF",
    tag: "eBook",
  },
  {
    id: "ebook-sem3",
    category: "ebook",
    title: "eBooks — Semester 3",
    blurb: "eBooks only, for Semester 3.",
    price: 19,
    format: "PDF",
    tag: "eBook",
  },


  // ---- Free batches — price 0, still go through the normal cart /
  // checkout flow (NOT the separate Paid/Free toggle) ----
  {
    id: "free-sem1",
    category: "free",
    title: "Free Batch — Semester 1",
    blurb: "Free starter resources for Semester 1.",
    price: 0,
    format: "LIVE",
    tag: "Free",
  },
  {
    id: "free-sem2",
    category: "free",
    title: "Free Batch — Semester 2",
    blurb: "Free starter resources for Semester 2.",
    price: 0,
    format: "LIVE",
    tag: "Free",
  },
  {
    id: "free-sem3",
    category: "free",
    title: "Free Batch — Semester 3",
    blurb: "Free starter resources for Semester 3.",
    price: 0,
    format: "LIVE",
    tag: "Free",
  },
  {
    id: "free-sem4",
    category: "free",
    title: "Free Batch — Semester 4",
    blurb: "Free starter resources for Semester 3.",
    price: 0,
    format: "LIVE",
    tag: "Free",
  },
];

const PlayLearn_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "cse", label: "CSE" },
  { id: "pyq", label: "PYQs" },
  { id: "ebook", label: "eBooks" },
  { id: "free", label: "Free" },
];
