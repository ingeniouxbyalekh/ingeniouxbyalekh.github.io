/**
 * Semester 4 subject catalog + Firebase links helper.
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

const SEMESTER_NUMBER = 4;

const SUBJECTS = [
  { code: "CS7602", name: "DISSERTATION (PHASE-II)" },
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
