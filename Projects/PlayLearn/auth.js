/**
 * PlayLearn Shop — lightweight client-side session
 * ---------------------------------------------------------------
 * There's still no backend, so "logged in" continues to mean a
 * name/email/phone object saved in localStorage — that's what the
 * header's account link and the rest of the cart/checkout flow key
 * off of.
 *
 * The actual account data (name, email, phone, password) lives in
 * Firebase Realtime Database at /users/<emailKey>, keyed by email
 * (dots swapped for commas, since RTDB keys can't contain "."):
 *   - Sign up (login.html) WRITES a new record there.
 *   - Log in (login.html) READS the record for that email and checks
 *     the password client-side before calling setUser() — so the
 *     local session only updates on a successful match, and a toast
 *     fires otherwise. See login.html for that flow.
 * Storing the password in plain text in RTDB is fine for this stub
 * (no real backend exists yet) but isn't how real auth should work —
 * swap this whole file for Firebase Auth or your own server-side
 * auth once you're ready, and stop storing raw passwords at that
 * point.
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

/* ---------------------------------------------------------------
   Firebase Auth — Google sign-in
   ---------------------------------------------------------------
   Real Firebase Authentication, used only for the "Sign in with
   Google" button next to the existing email/password form. The
   password form above still reads/writes /users/<emailKey> in RTDB
   directly and is untouched by this. Requires the
   firebase-auth-compat <script> tag to also be loaded on the page,
   and Google to be enabled as a sign-in provider in the Firebase
   console (Authentication → Sign-in method) — the OAuth web client
   ID for that provider is 196791573453-7uu1l1rj2i4kjj4s9hplfq58vpaidn4m.apps.googleusercontent.com,
   already tied to this project, so nothing else needs to reference
   it here.
--------------------------------------------------------------- */
let auth = null;
let googleProvider = null;
try {
  if (typeof firebase !== "undefined" && firebase.auth) {
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
  } else {
    console.error("Firebase Auth SDK not loaded — add the firebase-auth-compat <script> tag before auth.js.");
  }
} catch (err) {
  console.error("Firebase Auth init failed:", err);
}

// Opens the Google popup and returns the signed-in Firebase user
// ({ email, displayName, ... }). Throws if Auth isn't set up, or if
// the popup is closed/blocked — callers should catch and toast.
async function signInWithGoogle() {
  if (!auth || !googleProvider) throw new Error("Firebase Auth isn't initialized — check the SDK <script> tags and that Google sign-in is enabled in the Firebase console.");
  const result = await auth.signInWithPopup(googleProvider);
  return result.user;
}

// Realtime Database keys can't contain ".", "#", "$", "[", or "]" —
// every email has at least one dot, so swap dots for commas.
function emailToKey(email) {
  return String(email).trim().toLowerCase().replace(/\./g, ",");
}

/* ---------------------------------------------------------------
   Login lockout — 5 wrong passwords locks that email out of the
   password form for 1 hour, then resets for another 5 attempts.
   ---------------------------------------------------------------
   Tracked server-side (Firebase, at <attemptsPath>/<emailKey>) so it
   survives a page reload or clearing localStorage — not bulletproof
   (no real backend/rules yet, same caveat as the rest of this stub
   auth), but stronger than a client-only counter. Three independent
   password forms share these helpers, each with its own path so
   locking out a shop login doesn't touch admin/executive:
     - shop / Classroom login → "loginAttempts"
     - admin.html             → "adminLoginAttempts"
     - executive.html         → "executiveLoginAttempts"
   Google sign-in bypasses all of this — there's no "wrong password"
   case for it, so it isn't rate-limited here.
--------------------------------------------------------------- */
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

// Call before checking a password. Returns { locked: false } if the
// email is free to try, or { locked: true, minutesLeft } if it's
// currently locked out. A lockout whose hour has already passed is
// cleared here (count reset to 0), so the next attempt starts a
// fresh set of 5.
async function checkLoginLockout(attemptsPath, emailKey) {
  if (!db) throw new Error("Firebase isn't initialized — check the SDK <script> tags.");
  const ref = db.ref(attemptsPath + "/" + emailKey);
  const snap = await ref.once("value");
  const record = snap.exists() ? snap.val() : null;
  if (record && record.lockedUntil) {
    const now = Date.now();
    if (now < record.lockedUntil) {
      return { locked: true, minutesLeft: Math.ceil((record.lockedUntil - now) / 60000) };
    }
    await ref.set({ count: 0, lockedUntil: null });
  }
  return { locked: false };
}

// Call after a wrong password. Increments the count; on the 5th
// failure, sets a 1-hour lockout and resets the count to 0 (so the
// next window, once the lockout clears, also starts at 0/5).
// Returns { locked: true } if this failure just triggered a lockout,
// or { locked: false, attemptsLeft } otherwise.
async function recordFailedLogin(attemptsPath, emailKey) {
  if (!db) return { locked: false, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1 };
  const ref = db.ref(attemptsPath + "/" + emailKey);
  const snap = await ref.once("value");
  const record = snap.exists() ? snap.val() : null;
  const count = (record && record.count ? record.count : 0) + 1;
  if (count >= MAX_LOGIN_ATTEMPTS) {
    await ref.set({ count: 0, lockedUntil: Date.now() + LOGIN_LOCKOUT_MS });
    return { locked: true };
  }
  await ref.set({ count, lockedUntil: null });
  return { locked: false, attemptsLeft: MAX_LOGIN_ATTEMPTS - count };
}

// Call after a successful password login, so a correct password
// always clears any attempts building up toward a lockout.
async function clearLoginAttempts(attemptsPath, emailKey) {
  if (!db) return;
  try {
    await db.ref(attemptsPath + "/" + emailKey).remove();
  } catch (err) {
    console.error("Could not clear login attempts:", err);
  }
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
   Local session (unchanged shape: { name, email, phone })
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
  syncAccountLink();
  if (typeof showToast === "function") showToast("logged out");
}

function syncAccountLink() {
  const el = document.getElementById("account-link");
  if (!el) return;
  const user = getUser();
  if (user && user.name) {
    const firstName = user.name.trim().split(" ")[0];
    el.textContent = firstName;
    el.href = "profile.html";
    el.onclick = null;
  } else {
    el.textContent = "log in";
    el.href = "login.html";
    el.onclick = null;
  }
}

syncAccountLink();

// Cross-tab sync: if the user signs in/out in another tab (this page,
// a Classroom page, anywhere on the same site), the `storage` event
// fires here too since they all share AUTH_KEY — so this tab's header
// updates immediately without needing a manual refresh.
window.addEventListener("storage", (e) => {
  if (e.key === AUTH_KEY) syncAccountLink();
});

/* ---------------------------------------------------------------
   Toast fallback — store.html/product.html define their own (richer)
   showToast in cart.js, which loads after this file and simply
   overrides this one. login.html/profile.html/index.html don't load
   cart.js, so this keeps toasts working there too.
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
