/**
 * Classroom notifications — bell icon popup.
 * ---------------------------------------------------------------
 * Reads /notifications/<pushId> from Firebase (written by
 * executive.html's "Notifications" panel):
 *   { semester, email, regdNo, message, imageUrl, link, createdAt,
 *     dismissedBy }
 * imageUrl and link are both optional — a tile shows its image (if
 * any) above the message text, and a "Proceed to link" button (if a
 * link was set) below it.
 *
 * A notification is relevant to the signed-in student when every
 * filter the executive actually set matches:
 *   - semester: "all" matches every classroom, otherwise it must
 *     equal this folder's SEMESTER_NUMBER (from subjects.js) — not
 *     the student's own stored semester, so a notification always
 *     shows up on the classroom page it was actually aimed at.
 *   - email / regdNo: blank means "everyone" for that field; set
 *     means it must match the signed-in student's own email / regNo.
 *
 * Clicking "OK" on a tile doesn't delete the notification record —
 * the same broadcast can still be pending for other students. It
 * only writes this student's own key under
 * /notifications/<pushId>/dismissedBy/<emailKey>, which is enough to
 * hide it for them from then on (checked here, and it's harmless if
 * an executive later deletes the whole record anyway).
 *
 * Requires auth.js (db, getUser, emailToKey) and subjects.js
 * (SEMESTER_NUMBER, escapeHTML) to already be loaded on the page —
 * see the <script> order in index.html.
 * ---------------------------------------------------------------
 */
(function () {
  const bellIcon = document.getElementById("notifBellIcon");
  const dot = document.getElementById("notifDot");
  const overlay = document.getElementById("notifModalOverlay");
  const listEl = document.getElementById("notifList");
  const closeBtn = document.getElementById("notifModalClose");
  const counterEl = document.getElementById("notifCounter");

  // No-op on any page that doesn't have this markup (only index.html
  // does), or if Firebase/auth helpers aren't available.
  if (!bellIcon || !overlay || !listEl || !closeBtn) return;

  // Notifications currently loaded into the modal, and which one is
  // on screen. The modal shows one tile at a time; "OK" dismisses it
  // and advances to the next (see renderCurrent / the click handler
  // below). counterEl shows "n/total" whenever there's more than one.
  let currentItems = [];
  let currentIndex = 0;

  function matchesUser(n, user) {
    const semester = String(n.semester || "all");
    if (semester !== "all" && Number(semester) !== SEMESTER_NUMBER) return false;
    if (n.email && String(n.email).trim().toLowerCase() !== String(user.email || "").trim().toLowerCase()) return false;
    if (n.regdNo && String(n.regdNo).trim().toLowerCase() !== String(user.regNo || "").trim().toLowerCase()) return false;
    return true;
  }

  function isDismissed(n, emailKey) {
    return !!(n.dismissedBy && n.dismissedBy[emailKey]);
  }

  // Returns this student's still-relevant, not-yet-dismissed
  // notifications, newest first. [] (never throws) if signed out or
  // Firebase isn't reachable.
  async function fetchRelevantNotifications() {
    const user = typeof getUser === "function" ? getUser() : null;
    if (!user || !user.email || typeof db === "undefined" || !db) return [];

    const emailKey = emailToKey(user.email);
    try {
      const snap = await db.ref("notifications").once("value");
      if (!snap.exists()) return [];
      return Object.entries(snap.val())
        .map(([id, n]) => ({ id, ...(n || {}) }))
        .filter((n) => matchesUser(n, user) && !isDismissed(n, emailKey))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      console.error("Could not load notifications:", err);
      return [];
    }
  }

  function notifTileHTML(n) {
    const date = n.createdAt ? new Date(n.createdAt).toLocaleString("en-IN") : "";
    const imageHTML = n.imageUrl
      ? `<img class="notif-tile-image" src="${escapeHTML(n.imageUrl)}" alt="" />`
      : "";
    const linkHTML = n.link
      ? `<a class="btn btn-small btn-primary btn-block notif-tile-link" href="${escapeHTML(n.link)}" target="_blank" rel="noopener noreferrer">Proceed to link →</a>`
      : "";
    return `
      <div class="notif-tile" data-id="${n.id}">
        ${imageHTML}
        <p class="notif-tile-text">${escapeHTML(n.message || "")}</p>
        ${linkHTML}
        <div class="notif-tile-foot">
          <span class="notif-tile-date">${date}</span>
          <button type="button" class="btn btn-small notif-ok-btn" data-id="${n.id}">OK</button>
        </div>
      </div>`;
  }

  // Shows/hides the red dot. Called on load and after every dismiss.
  async function refreshBell() {
    const items = await fetchRelevantNotifications();
    dot.style.display = items.length ? "block" : "none";
  }

  // Renders whichever tile currentIndex points to (clamped in range),
  // or the empty state if currentItems is now empty, and keeps the
  // "n/total" counter in sync.
  function renderCurrent() {
    if (!currentItems.length) {
      listEl.innerHTML = `<p class="notif-empty">No notifications.</p>`;
      if (counterEl) counterEl.textContent = "";
      return;
    }
    if (currentIndex >= currentItems.length) currentIndex = currentItems.length - 1;
    if (currentIndex < 0) currentIndex = 0;
    listEl.innerHTML = notifTileHTML(currentItems[currentIndex]);
    if (counterEl) counterEl.textContent = currentItems.length > 1 ? `${currentIndex + 1}/${currentItems.length}` : "";
  }

  async function openModal() {
    overlay.classList.add("is-open");
    listEl.innerHTML = `<p class="notif-empty">Loading…</p>`;
    if (counterEl) counterEl.textContent = "";
    currentItems = await fetchRelevantNotifications();
    currentIndex = 0;
    if (!currentItems.length) {
      listEl.innerHTML = `<p class="notif-empty">No notifications.</p>`;
      dot.style.display = "none";
      return;
    }
    renderCurrent();
  }

  function closeModal() {
    overlay.classList.remove("is-open");
  }

  bellIcon.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  listEl.addEventListener("click", async (e) => {
    const okBtn = e.target.closest(".notif-ok-btn");
    if (!okBtn) return;

    const user = typeof getUser === "function" ? getUser() : null;
    if (!user || !user.email || typeof db === "undefined" || !db) return;

    okBtn.disabled = true;
    try {
      const emailKey = emailToKey(user.email);
      await db.ref(`notifications/${okBtn.dataset.id}/dismissedBy/${emailKey}`).set(true);
      currentItems.splice(currentIndex, 1);
      renderCurrent();
      refreshBell();
    } catch (err) {
      console.error("Could not dismiss notification:", err);
      if (typeof showToast === "function") showToast("Couldn't dismiss — try again");
      okBtn.disabled = false;
    }
  });

  refreshBell();
})();
