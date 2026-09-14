/**
 * First-time dashboard tour (index.html)
 * ---------------------------------------------------------------
 * Walks a brand-new signee through the key parts of the classroom
 * home page: notification bell, profile, search, Schedule &
 * Classes, ClassNotes, Contact Us, and — mobile only, since it
 * doesn't exist on desktop (see .bottom-nav in style.css) — the
 * bottom nav's "More" utility trigger. Contact Us itself has two
 * entries (desktopOnly / mobileOnly) since it's a different link in
 * the sidebar vs. the bottom nav, but only one of them is ever
 * applicable on a given screen size.
 *
 * Each step draws a rectangular spotlight (border + dark backdrop
 * everywhere else) around the target element with a short tooltip
 * next to it, a "Skip tour" link, and a Next/Got it button. See the
 * .tour-* rules in style.css.
 *
 * Shown once per account **per semester**, ever, on any device:
 * finishing the last step or hitting "Skip tour" writes true to
 * /tour/dismissedBy/<semesterNumber>/<emailKey> in Firebase (same
 * dismissedBy shape notifications.js uses per-notification), and
 * startTour() checks that path before doing anything else. If
 * Firebase can't be reached, the tour is skipped rather than shown
 * on every load.
 *
 * Requires auth.js (db, getUser, emailToKey) to already be loaded —
 * see the <script> order in index.html. No-op if the user isn't
 * signed in.
 * ---------------------------------------------------------------
 */
(function () {
  const STEPS = [
    {
      selector: "#notifBellWrap",
      title: "Notifications",
      text: "Updates & alerts land here.",
    },
    {
      selector: "#profileToggle",
      title: "Your profile",
      text: "Manage your profile, password, and queries.",
    },
    {
      selector: ".search-container",
      title: "Search",
      text: "Coming soon!",
    },
    {
      selector: ".schedule-section",
      title: "Schedule",
      text: "Browse your daily classes.",
    },
    {
      selector: ".study-list",
      title: "ClassNotes",
      text: "All your notes, in one place.",
    },
    {
      selector: "#academicsTrigger",
      title: "More",
      text: "Ebooks, PYQs, syllabus & timetable.",
      mobileOnly: true,
    },
    {
      selector: 'nav.sidebar a[href="../../contacts.html"]',
      title: "Contact Us",
      text: "Meet the people behind it.",
      desktopOnly: true,
    },
    {
      selector: 'nav.bottom-nav a[href="../../contacts.html"]',
      title: "Contact Us",
      text: "Meet the people behind it.",
      mobileOnly: true,
    },
  ];
  

  const MOBILE_QUERY = "(max-width: 768px)";
  const WAIT_TIMEOUT_MS = 4000;
  const WAIT_POLL_MS = 150;

  let overlayEl, boxEl, tipEl;
  let steps = [];
  let index = 0;

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function applicableSteps() {
    const mobile = isMobile();
    return STEPS.filter((s) => {
      if (s.mobileOnly && !mobile) return false;
      if (s.desktopOnly && mobile) return false;
      return true;
    });
  }

  // A step target only counts as "ready" once it exists AND is
  // actually visible (offsetParent is null for display:none elements
  // — e.g. #academicsTrigger before the mobile media query kicks in).
  function readySteps() {
    return applicableSteps().filter((s) => {
      const el = document.querySelector(s.selector);
      return !!(el && el.offsetParent !== null);
    });
  }

  // The dashboard's own scripts fill in the ClassNotes cards and
  // profile dropdown asynchronously, so their targets may not exist
  // yet on DOMContentLoaded. Poll briefly for every applicable step
  // to become ready, and start with whatever's ready if the timeout
  // is hit first rather than waiting forever.
  function waitForTargets(callback) {
    const started = Date.now();
    const want = applicableSteps().length;
    (function check() {
      const ready = readySteps();
      if (ready.length >= want || Date.now() - started > WAIT_TIMEOUT_MS) {
        callback(ready);
        return;
      }
      setTimeout(check, WAIT_POLL_MS);
    })();
  }

  function buildDOM() {
    overlayEl = document.createElement("div");
    overlayEl.className = "tour-overlay";

    boxEl = document.createElement("div");
    boxEl.className = "tour-highlight";

    tipEl = document.createElement("div");
    tipEl.className = "tour-tooltip";
    tipEl.innerHTML = `
      <div class="tour-tip-count" id="tourCount"></div>
      <h4 class="tour-tip-title" id="tourTitle"></h4>
      <p class="tour-tip-text" id="tourText"></p>
      <div class="tour-tip-actions">
        <button type="button" class="tour-skip-btn" id="tourSkipBtn">Skip tour</button>
        <button type="button" class="tour-next-btn" id="tourNextBtn">Next</button>
      </div>`;

    document.body.appendChild(overlayEl);
    document.body.appendChild(boxEl);
    document.body.appendChild(tipEl);

    tipEl.querySelector("#tourSkipBtn").addEventListener("click", endTour);
    tipEl.querySelector("#tourNextBtn").addEventListener("click", nextStep);
    window.addEventListener("resize", positionCurrent);
    window.addEventListener("scroll", positionCurrent, true);
  }

  function teardownDOM() {
    if (overlayEl) overlayEl.remove();
    if (boxEl) boxEl.remove();
    if (tipEl) tipEl.remove();
    window.removeEventListener("resize", positionCurrent);
    window.removeEventListener("scroll", positionCurrent, true);
  }

  function positionCurrent() {
    if (!steps.length) return;
    const step = steps[index];
    const el = document.querySelector(step.selector);
    if (!el) {
      nextStep();
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;

    boxEl.style.top = `${rect.top - pad}px`;
    boxEl.style.left = `${rect.left - pad}px`;
    boxEl.style.width = `${rect.width + pad * 2}px`;
    boxEl.style.height = `${rect.height + pad * 2}px`;

    // Prefer placing the tooltip below the highlighted box; flip
    // above it if there isn't room below, then clamp both axes so it
    // never runs off the edge of small screens.
    const tipRect = tipEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - (rect.bottom + pad);
    let top = spaceBelow >= tipRect.height + 20
      ? rect.bottom + pad + 12
      : rect.top - pad - tipRect.height - 12;
    top = Math.max(12, Math.min(top, window.innerHeight - tipRect.height - 12));

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tipRect.width - 12));

    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
  }

  function renderStep() {
    document.getElementById("tourTitle").textContent = steps[index].title || "";
    document.getElementById("tourText").textContent = steps[index].text;
    document.getElementById("tourCount").textContent = `${index + 1} / ${steps.length}`;
    document.getElementById("tourNextBtn").textContent = index === steps.length - 1 ? "Got it" : "Next";
    // Let the new text reflow the tooltip's size before measuring it.
    requestAnimationFrame(positionCurrent);
  }

  function nextStep() {
    index += 1;
    if (index >= steps.length) {
      endTour();
      return;
    }
    renderStep();
  }

  // Falls back to "all" if this page somehow loads before subjects.js
  // (which is what normally defines SEMESTER_NUMBER) — keeps this
  // file safe to reuse across every semester's Classroom folder,
  // tracking "seen it" separately per semester per account.
  function tourPath() {
    const sem = typeof SEMESTER_NUMBER !== "undefined" ? SEMESTER_NUMBER : "all";
    const user = typeof getUser === "function" ? getUser() : null;
    return `tour/dismissedBy/${sem}/${emailToKey(user.email)}`;
  }

  async function markDismissed() {
    const user = typeof getUser === "function" ? getUser() : null;
    if (!user || !user.email || typeof db === "undefined" || !db) return;
    try {
      await db.ref(tourPath()).set(true);
    } catch (err) {
      console.error("Could not save tour dismissal:", err);
    }
  }

  function endTour() {
    teardownDOM();
    markDismissed();
  }

  async function hasSeenTour() {
    if (typeof db === "undefined" || !db) return true; // can't check — fail closed, don't show it
    try {
      const snap = await db.ref(tourPath()).once("value");
      return snap.exists();
    } catch (err) {
      console.error("Could not check tour status:", err);
      return true;
    }
  }

  async function startTour() {
    const user = typeof getUser === "function" ? getUser() : null;
    if (!user || !user.email) return;
    if (await hasSeenTour()) return;

    waitForTargets((ready) => {
      if (!ready.length) return;
      steps = ready;
      index = 0;
      buildDOM();
      renderStep();
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    startTour();
  } else {
    window.addEventListener("DOMContentLoaded", startTour);
  }
})();
