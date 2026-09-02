/**
 * Semester 1 subject catalog + Firebase links helper.
 * ---------------------------------------------------------------
 * This is the classroom-side twin of SUBJECTS_BY_SEMESTER in
 * ../../executive.html and ../../index.html — same codes/names, but
 * scoped to just this semester since every page in this folder only
 * ever needs its own semester's subjects.
 *
 * Download buttons on index.html / notes.html / ebooks.html /
 * pyqs.html don't hold a hardcoded URL anymore — they resolve
 * "<subjectCode>-<Notes|PYQs|eBooks>" against Firebase's /links
 * table at render time (the same table executive.html's "Product
 * links" panel writes to). A subject with no matching row just shows
 * "Not uploaded yet" instead of a dead link.
 * ---------------------------------------------------------------
 */

const SEMESTER_NUMBER = 1;

const SUBJECTS = [
  { code: "MS6403", name: "RESEARCH METHODOLOGY AND IPR" },
  { code: "BH6001", name: "ENGLISH FOR RESEARCH PAPER WRITING" },
  { code: "BH6401", name: "MATHEMATICAL METHODS IN ENGINEERING" },
  { code: "CS6101", name: "ADVANCED DATA STRUCTURES AND ALGORITHMS" },
  { code: "CS6103", name: "WIRELESS SENSOR NETWORKS" },
  { code: "CS6205", name: "DATA MINING" },
  { code: "CS6501", name: "ADVANCED DATA STRUCTURES AND ALGORITHMS LABORATORY" },
  { code: "CS6503", name: "COMPUTING LABORATORY-I" },
];

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fetches the whole /links table once. Returns {} (rather than
// throwing) if Firebase isn't reachable, so callers can still render
// the subject list with everything in the "not uploaded yet" state.
async function loadMaterialLinks() {
  if (typeof db === "undefined" || !db) {
    console.error("Firebase isn't initialized — check the SDK <script> tags before subjects.js.");
    return {};
  }
  try {
    const snap = await db.ref("links").once("value");
    return snap.exists() ? snap.val() : {};
  } catch (err) {
    console.error("Could not load /links:", err);
    return {};
  }
}
