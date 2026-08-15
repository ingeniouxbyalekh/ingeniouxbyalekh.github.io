/**
 * OUTR MTech E-Classroom — lightweight client-side session
 * ---------------------------------------------------------------
 * There's no backend, so "logged in" means a name/email/phone/
 * regNo/semester object saved in localStorage — that's what the
 * dashboard header (greeting + profile icon) and login/profile
 * pages key off of.
 *
 * The actual account data (name, email, phone, regNo, semester,
 * password) lives in Firebase Realtime Database at
 * /users/<emailKey>, keyed by email (dots swapped for commas,
 * since RTDB keys can't contain "."):
 *   - Sign up (login.html) WRITES a new record there.
 *   - Log in (login.html) READS the record for that email and
 *     checks the password client-side before calling setUser() —
 *     so the local session only updates on a successful match, and
 *     a toast fires otherwise.
 * Storing the password in plain text in RTDB is fine for this stub
 * (no real backend exists yet) but isn't how real auth should
 * work — swap this whole file for Firebase Auth or your own
 * server-side auth once you're ready, and stop storing raw
 * passwords at that point.
 * ---------------------------------------------------------------
 */

const AUTH_KEY = "PlayLearn_user_v1"; // shared across the whole site (root + Classroom) so one sign-in/sign-out applies everywhere

/* ---------------------------------------------------------------
   Firebase — Realtime Database only (no Auth yet)
--------------------------------------------------------------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAht34mfVdGRbNk1NxjfpVfzm9ziIPxe2E",
  authDomain: "outr-83e1b.firebaseapp.com",
  databaseURL: "https://outr-83e1b-default-rtdb.firebaseio.com",
  projectId: "outr-83e1b",
  storageBucket: "outr-83e1b.firebasestorage.app",
  messagingSenderId: "358057392716",
  appId: "1:358057392716:web:f67c6b3d05274c7f5712e9",
  measurementId: "G-9LN68551TX",
};

let db = null;
try {
  if (typeof firebase !== "undefined") {
    const app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database(app);
  } else {
    console.error("Firebase SDK not loaded — add the firebase-app-compat / firebase-database-compat <script> tags before auth.js.");
  }
} catch (err) {
  console.error("Firebase init failed:", err);
}

// Realtime Database keys can't contain ".", "#", "$", "[", or "]" —
// every email has at least one dot, so swap dots for commas.
function emailToKey(email) {
  return String(email).trim().toLowerCase().replace(/\./g, ",");
}

// Writes a profile to Firebase. Throws on failure so the caller
// (signup form) can show an error and NOT treat the account as
// created — the local session is only updated after this succeeds.
async function saveUserToCloud(user) {
  if (!db) throw new Error("Firebase isn't initialized — check the SDK <script> tags.");
  if (!user || !user.email) throw new Error("Missing email.");
  await db.ref("users/" + emailToKey(user.email)).set({
    name: user.name || "",
    email: user.email,
    phone: user.phone || "",
    regNo: user.regNo || "",
    semester: user.semester || "",
    password: user.password || "",
    updatedAt: Date.now(),
  });
}

// Looks up a previously-saved profile by email. Returns null if
// there's no record yet. Throws if the DB itself isn't reachable, so
// the caller (login form) can tell "wrong password" apart from
// "couldn't reach the server".
async function fetchUserFromCloud(email) {
  if (!db) throw new Error("Firebase isn't initialized — check the SDK <script> tags.");
  if (!email) return null;
  const snap = await db.ref("users/" + emailToKey(email)).once("value");
  return snap.exists() ? snap.val() : null;
}

/* ---------------------------------------------------------------
   Local session (shape: { name, email, phone, regNo, semester })
--------------------------------------------------------------- */
function getUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Could not read session:", err);
    return null;
  }
}

function setUser(user) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } catch (err) {
    console.error("Could not save session:", err);
  }
}

function logoutUser() {
  localStorage.removeItem(AUTH_KEY);
  syncHeader();
  if (typeof showToast === "function") showToast("logged out");
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function greetingWord() {
  // Time-of-day greeting, IST — matches the rest of the dashboard's
  // "Asia/Kolkata" date logic in script.js.
  const hourStr = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date());
  const hour = parseInt(hourStr, 10);
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/* ---------------------------------------------------------------
   Dashboard header — greeting text + profile icon/dropdown.
   Safe to call on any page: every lookup checks the element exists
   first, so this is a no-op on pages (like login.html) that don't
   have this header markup.
--------------------------------------------------------------- */
function syncHeader() {
  const user = getUser();

  const welcomeEl = document.querySelector(".welcome-text");
  if (welcomeEl) {
    const firstName = user && user.name ? user.name.trim().split(" ")[0] : "";
    welcomeEl.textContent = firstName ? `${greetingWord()}, ${firstName}` : `${greetingWord()},`;
  }

  const badgeEl = document.getElementById("profileBadge");
  if (badgeEl) {
    badgeEl.textContent = user && user.name ? initials(user.name) : "";
    badgeEl.innerHTML = user && user.name ? initials(user.name) : '<i class="fas fa-user"></i>';
  }

  const menuEl = document.getElementById("branchMenu");
  if (menuEl) {
    if (user && user.name) {
      menuEl.innerHTML = `
        <div class="dropdown-header">${user.name.split(" ")[0]}</div>
        <a href="profile.html"><i class="fas fa-user-circle"></i> My Profile</a>
        <a href="#" id="header-logout-link"><i class="fas fa-right-from-bracket"></i> Log out</a>`;
    } else {
      menuEl.innerHTML = `
        <div class="dropdown-header">Account</div>
        <a href="login.html"><i class="fas fa-right-to-bracket"></i> Log in / Sign up</a>`;
    }
  }
}

// Delegated so it keeps working after syncHeader() rewrites #branchMenu.
document.addEventListener("click", (e) => {
  const logoutLink = e.target.closest("#header-logout-link");
  if (!logoutLink) return;
  e.preventDefault();
  logoutUser();
  window.location.href = "index.html";
});

syncHeader();

// Cross-tab sync: if the user signs in/out in another tab (this
// semester, another semester, or the main site), the `storage` event
// fires here too since they all share AUTH_KEY — so this tab's
// header updates immediately without needing a manual refresh.
window.addEventListener("storage", (e) => {
  if (e.key === AUTH_KEY) syncHeader();
});

/* ---------------------------------------------------------------
   Toast fallback — pages that want a fancier toast can define their
   own showToast before this file loads (this only defines one if
   none exists yet).
--------------------------------------------------------------- */
if (typeof window.showToast !== "function") {
  window.showToast = function (message) {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;
    clearTimeout(window.__authToastTimer);
    toastEl.innerHTML = `<span class="prompt">$</span>${message}`;
    toastEl.classList.add("is-visible");
    window.__authToastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  };
}

/* ---------------------------------------------------------------
   Locked / premium features — Notes, Ebooks, PYQs and the per-
   subject download buttons are inactive on the Free plan. Clicking
   any of them just prompts the user to purchase a plan instead of
   navigating or downloading.
--------------------------------------------------------------- */
if (typeof window.showPurchasePrompt !== "function") {
  window.showPurchasePrompt = function () {
    if (typeof window.showToast === "function") {
      window.showToast("\ud83d\udd12 Purchase a plan to unlock this");
    }
  };
}

