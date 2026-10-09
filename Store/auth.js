/**
 * INGENIOUX Shop — lightweight client-side session
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

const AUTH_KEY = "ingenioux_shop_user_v1";

/* ---------------------------------------------------------------
   Firebase — Realtime Database only (no Auth yet)
--------------------------------------------------------------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD46YZ8nq-cdEtzxCHJQ3X2-v0f6ztp9L4",
  authDomain: "ingenioux-store.firebaseapp.com",
  // TODO: confirm this — your snippet didn't include databaseURL (it only
  // set up Analytics). This is the default US-central RTDB URL guessed from
  // your projectId; if your Realtime Database is in a different region,
  // grab the real URL from Firebase Console → Realtime Database → top of
  // the data view, and paste it in here.
  databaseURL: "https://ingenioux-store-default-rtdb.firebaseio.com",
  projectId: "ingenioux-store",
  storageBucket: "ingenioux-store.firebasestorage.app",
  messagingSenderId: "948997240472",
  appId: "1:948997240472:web:e4b29bedc53e9f6d3fc2ed",
  measurementId: "G-HWS82YP8EP",
};

let db = null;
let fbAuth = null;
try {
  if (typeof firebase !== "undefined") {
    const app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database(app);
    if (firebase.auth) {
      fbAuth = firebase.auth(app);
    } else {
      console.error("Firebase Auth SDK not loaded — add the firebase-auth-compat <script> tag before auth.js.");
    }
  } else {
    console.error("Firebase SDK not loaded — add the firebase-app-compat / firebase-database-compat <script> tags before auth.js.");
  }
} catch (err) {
  console.error("Firebase init failed:", err);
}

/* ---------------------------------------------------------------
   Firebase Email/Password Auth
   ---------------------------------------------------------------
   Layered on top of the traditional RTDB-record login above, not a
   replacement for it — every page keeps working exactly as before
   for accounts that only ever exist as a plain /users, /admin, or
   /executive(-temp) record.

   New signups (login.html, admin.html, executive.html) now do BOTH:
     1. Create a real Firebase Auth account with createUserWithEmail-
        AndPassword — a real, securely-hashed password, checked
        server-side by Firebase rather than compared in the browser.
     2. Still write the existing RTDB profile record (name/phone/
        email/password) the rest of the app already reads from, so
        nothing else has to change.

   Login tries Firebase Auth first (signInWithEmailAndPassword) and,
   if that account doesn't exist there (e.g. it predates this
   feature, or the Auth call failed at signup time for some reason),
   falls back to the original RTDB password check. Either path is
   accepted — this is what "keep the traditional option too" means
   here: nobody with a working traditional account gets locked out.
--------------------------------------------------------------- */

// Throws on failure (e.g. "email already in use", weak password) so
// the caller can decide how to handle it — see login.html/admin.html/
// executive.html signup handlers, which treat this as best-effort and
// fall back to the RTDB-only record if it fails.
async function fbAuthSignUp(email, password) {
  if (!fbAuth) throw new Error("Firebase Auth isn't initialized — check the SDK <script> tags.");
  return fbAuth.createUserWithEmailAndPassword(email, password);
}

// Throws (auth/user-not-found, auth/wrong-password, etc.) if this
// email/password pair has no Firebase Auth account or doesn't match —
// callers should catch that and fall back to the traditional RTDB
// check rather than surfacing the raw Firebase error.
async function fbAuthLogIn(email, password) {
  if (!fbAuth) throw new Error("Firebase Auth isn't initialized — check the SDK <script> tags.");
  return fbAuth.signInWithEmailAndPassword(email, password);
}

// Sends Firebase's built-in verification email to whichever account
// just signed up/in. Used by admin.html/executive.html only — shop
// shoppers (login.html) never need to verify.
async function fbAuthSendVerification(user) {
  if (user && typeof user.sendEmailVerification === "function") {
    await user.sendEmailVerification();
  }
}

/* ---------------------------------------------------------------
   Google Sign-In (Firebase Auth, "Continue with Google")
   ---------------------------------------------------------------
   One button, used for both log in AND sign up on login.html,
   admin.html, and executive.html — signInWithPopup() transparently
   creates a brand-new Firebase Auth account the first time a given
   Google account is used, and signs straight into the existing one
   on every visit after that, so callers don't need to branch on
   "is this a new user" before calling it.

   Google-verified emails come back with credential.user.emailVerified
   already true — callers on admin.html/executive.html can treat that
   as satisfying their email-verification requirement without sending
   a separate Firebase verification email.

   Throws on failure (popup closed, blocked, network error, etc.) —
   callers should catch it and show a toast rather than let it bubble.
--------------------------------------------------------------- */
async function fbAuthGoogleSignIn() {
  if (!fbAuth) throw new Error("Firebase Auth isn't initialized — check the SDK <script> tags.");
  const provider = new firebase.auth.GoogleAuthProvider();
  return fbAuth.signInWithPopup(provider);
}

async function fbAuthSignOut() {
  if (fbAuth) await fbAuth.signOut();
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

/* ---------------------------------------------------------------
   Toast fallback — index.html/product.html define their own (richer)
   showToast in cart.js, which loads after this file and simply
   overrides this one. login.html/profile.html don't load cart.js, so
   this keeps toasts working there too.
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
