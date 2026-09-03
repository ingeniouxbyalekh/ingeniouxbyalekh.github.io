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
  apiKey: "AIzaSyABB2Tl_3umwwx1eXKsTiakCPJ3L5TP-yQ",
  authDomain: "playlearn-cb8c1.firebaseapp.com",
  databaseURL: "https://playlearn-cb8c1-default-rtdb.firebaseio.com",
  projectId: "playlearn-cb8c1",
  storageBucket: "playlearn-cb8c1.firebasestorage.app",
  messagingSenderId: "196791573453",
  appId: "1:196791573453:web:429ca975f41f2af7a00284",
  measurementId: "G-YKQH3S3X7S",
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
   already tied to this project (playlearn-cb8c1), so nothing else
   needs to reference it here.
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
   Single-device login
   ---------------------------------------------------------------
   Every account type (shop customer, admin, executive) may only be
   logged in on one device at a time. "Device" here means one
   browser: the first time this code runs on a browser it mints a
   random id and keeps it in localStorage (PlayLearn_device_id),
   separate from any account.

   Each account type keeps a small "who's currently logged in"
   record in Firebase at sessions/<type>/<emailKey> = { deviceId,
   loginAt } — its own tree, so this never touches /users, /admin,
   or /executive.

   Login flow (see login.html, admin.html, executive.html): after
   the password (or Google) check succeeds, call
   resolveDeviceLogin(type, emailKey). It:
     - claims the session immediately and resolves true if nobody
       else is logged in, or the existing record already belongs to
       this device;
     - otherwise shows a "you're logged in elsewhere — continue
       here?" modal and only claims the session (which is what signs
       the other device out) if the person clicks through it,
       resolving true on confirm / false on cancel. The caller should
       abort the login attempt on false.

   Ongoing check: every page that has a local session for one of
   these account types calls verifyDeviceSession() once on load and
   watchDeviceSession() to keep watching live — if the Firebase
   record no longer names this device (because another device logged
   in), the page's own callback clears its local session and updates
   its UI. See the bottom of this file for the shop session's own
   use of this.
--------------------------------------------------------------- */
const SESSION_ROOT = "sessions"; // sessions/<type>/<emailKey>
const DEVICE_ID_KEY = "PlayLearn_device_id";

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("dev-" + Date.now() + "-" + Math.random().toString(16).slice(2));
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (err) {
    console.error("Could not read/create this device's id:", err);
    return "dev-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
}

// Reads the current "who's logged in" record for an account, or null
// if nobody is.
async function getDeviceSession(type, emailKey) {
  if (!db) throw new Error("Firebase isn't initialized — check the SDK <script> tags.");
  const snap = await db.ref(`${SESSION_ROOT}/${type}/${emailKey}`).once("value");
  return snap.exists() ? snap.val() : null;
}

// Overwrites the record with this device. This is the "log out
// there" step — whichever device this deviceId doesn't belong to
// loses its claim, and the next time it checks (verifyDeviceSession /
// watchDeviceSession) it gets signed out locally.
async function claimDeviceSession(type, emailKey, deviceId) {
  if (!db) throw new Error("Firebase isn't initialized — check the SDK <script> tags.");
  await db.ref(`${SESSION_ROOT}/${type}/${emailKey}`).set({ deviceId, loginAt: Date.now() });
}

// Call right after a successful login check, before setting the
// local session. Resolves true once it's safe to continue (the
// session is now claimed for this device), or false if the person
// cancelled at the "logged in elsewhere" modal — callers should abort
// the login attempt in that case.
function resolveDeviceLogin(type, emailKey) {
  return new Promise((resolve) => {
    const deviceId = getDeviceId();
    getDeviceSession(type, emailKey)
      .then((existing) => {
        if (!existing || existing.deviceId === deviceId) {
          return claimDeviceSession(type, emailKey, deviceId).then(() => resolve(true));
        }
        showDeviceConflictModal({
          onConfirm: () => claimDeviceSession(type, emailKey, deviceId).then(() => resolve(true)),
          onCancel: () => resolve(false),
        });
      })
      .catch((err) => {
        console.error(`Could not check for an existing ${type} session:`, err);
        // fail open — a transient read error shouldn't block login
        claimDeviceSession(type, emailKey, deviceId).catch(() => {}).then(() => resolve(true));
      });
  });
}

// Call on page load whenever a local session for this account type
// exists. Fires onInvalidated() if this device no longer owns the
// Firebase session record (another device has since logged in).
async function verifyDeviceSession(type, emailKey, onInvalidated) {
  if (!db) return; // can't verify without Firebase — fail open
  try {
    const existing = await getDeviceSession(type, emailKey);
    if (!existing || existing.deviceId !== getDeviceId()) {
      if (onInvalidated) onInvalidated();
    }
  } catch (err) {
    console.error(`Could not verify ${type} session:`, err);
  }
}

// Same check, but live — fires onInvalidated() the moment another
// device claims the session, without needing a reload. Returns an
// unsubscribe function; safe to call even if Firebase isn't ready
// (returns a no-op unsubscribe).
function watchDeviceSession(type, emailKey, onInvalidated) {
  if (!db) return () => {};
  const ref = db.ref(`${SESSION_ROOT}/${type}/${emailKey}`);
  const deviceId = getDeviceId();
  const handler = (snap) => {
    const record = snap.exists() ? snap.val() : null;
    if (!record || record.deviceId !== deviceId) {
      if (onInvalidated) onInvalidated();
    }
  };
  ref.on("value", handler);
  return () => ref.off("value", handler);
}

// Call on manual logout so this device's claim doesn't linger. Only
// removes the record if it's still this device's — never clobbers a
// session another device has since claimed (which would incorrectly
// sign that device out).
async function releaseDeviceSession(type, emailKey) {
  if (!db) return;
  try {
    const ref = db.ref(`${SESSION_ROOT}/${type}/${emailKey}`);
    const snap = await ref.once("value");
    const record = snap.exists() ? snap.val() : null;
    if (record && record.deviceId === getDeviceId()) {
      await ref.remove();
    }
  } catch (err) {
    console.error(`Could not release ${type} session:`, err);
  }
}

// The "logged in elsewhere" confirm modal — built once, reused for
// every account type on whichever page needs it (shop login, admin
// login, executive login). Uses the same .modal-overlay/.modal
// classes as the checkout modal in cart.js's markup, defined in
// style.css, which every page already loads.
function ensureDeviceConflictModal() {
  let overlay = document.getElementById("device-conflict-modal");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "device-conflict-modal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-body">
        <h3 style="margin:0 0 10px;">Already logged in elsewhere</h3>
        <p style="margin:0 0 20px; color:var(--text-dim); font-size:13px; line-height:1.6;">
          This account is already logged in on another device. Continuing here will log that device out.
        </p>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" class="btn" id="device-conflict-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="device-conflict-ok">Okay, continue here</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function showDeviceConflictModal({ onConfirm, onCancel } = {}) {
  const overlay = ensureDeviceConflictModal();
  const okBtn = overlay.querySelector("#device-conflict-ok");
  const cancelBtn = overlay.querySelector("#device-conflict-cancel");
  okBtn.disabled = false;
  okBtn.textContent = "Okay, continue here";
  overlay.classList.add("is-open");

  function close() {
    overlay.classList.remove("is-open");
  }
  okBtn.addEventListener(
    "click",
    async function handleOk() {
      okBtn.disabled = true;
      okBtn.textContent = "Logging in…";
      try {
        if (onConfirm) await onConfirm();
      } finally {
        close();
      }
    },
    { once: true }
  );
  cancelBtn.addEventListener(
    "click",
    function handleCancel() {
      close();
      if (onCancel) onCancel();
    },
    { once: true }
  );
}

/* ---------------------------------------------------------------
   Finish-signup modal for first-time Google sign-in
   ---------------------------------------------------------------
   Google sign-in gives us a name + email but nothing else, and the
   admin/executive accounts still need a password (there's no
   Firebase Auth check on the login form — see the file header), so
   a brand-new account can't just be created straight from the
   Google popup. Used by admin.html and executive.html: when the
   signed-in Google email has no existing record, show this modal to
   collect a password (and, for executive, a phone number) before
   the caller writes anything to Firebase. Built once, reused by
   whichever page needs it, same pattern as the device-conflict modal
   above.
--------------------------------------------------------------- */
function ensureGoogleDetailsModal() {
  let overlay = document.getElementById("google-details-modal");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "google-details-modal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-body">
        <h3 style="margin:0 0 6px;">Finish creating your account</h3>
        <p style="margin:0 0 20px; color:var(--text-dim); font-size:13px; line-height:1.6;">
          Signed in as <strong id="google-details-email"></strong>. A few more details are needed to finish setting up your account.
        </p>
        <form id="google-details-form">
          <div class="field">
            <label for="google-details-name">Name</label>
            <input id="google-details-name" type="text" required autocomplete="name" />
          </div>
          <div class="field" id="google-details-phone-field" style="display:none">
            <label for="google-details-phone">Phone number</label>
            <input id="google-details-phone" type="tel" autocomplete="tel" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" placeholder="10-digit mobile number" />
          </div>
          <div class="field">
            <label for="google-details-password">Password</label>
            <input id="google-details-password" type="password" required autocomplete="new-password" minlength="4" placeholder="At least 4 characters" />
          </div>
          <div class="field">
            <label for="google-details-confirm-password">Confirm password</label>
            <input id="google-details-confirm-password" type="password" required autocomplete="new-password" minlength="4" placeholder="Re-enter password" />
          </div>
          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:6px;">
            <button type="button" class="btn" id="google-details-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="google-details-submit">Finish sign up</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

// email/name come from the Google account (name is editable, in case
// the display name isn't what they want on file; email is shown as
// plain text, not editable, since it's the record's key). requirePhone
// shows/requires the phone field (executive signup needs one, admin
// signup doesn't). onSubmit({ name, phone, password }) does the actual
// Firebase write and session setup — this modal never touches the DB
// itself, and only closes once onSubmit resolves without throwing.
// onCancel fires if the person backs out; callers should sign the
// Firebase Auth popup session back out there so they aren't left
// half signed-in with no account record.
function showGoogleDetailsModal({ email, name, requirePhone, onSubmit, onCancel } = {}) {
  const overlay = ensureGoogleDetailsModal();
  const form = overlay.querySelector("#google-details-form");
  const emailEl = overlay.querySelector("#google-details-email");
  const nameInput = overlay.querySelector("#google-details-name");
  const phoneField = overlay.querySelector("#google-details-phone-field");
  const phoneInput = overlay.querySelector("#google-details-phone");
  const passwordInput = overlay.querySelector("#google-details-password");
  const confirmInput = overlay.querySelector("#google-details-confirm-password");
  const cancelBtn = overlay.querySelector("#google-details-cancel");
  const submitBtn = overlay.querySelector("#google-details-submit");

  emailEl.textContent = email || "";
  nameInput.value = name || "";
  phoneField.style.display = requirePhone ? "" : "none";
  phoneInput.required = !!requirePhone;
  phoneInput.value = "";
  passwordInput.value = "";
  confirmInput.value = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "Finish sign up";
  overlay.classList.add("is-open");

  function close() {
    overlay.classList.remove("is-open");
    form.removeEventListener("submit", handleSubmit);
    cancelBtn.removeEventListener("click", handleCancel);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (passwordInput.value !== confirmInput.value) {
      if (typeof showToast === "function") showToast("Passwords don't match");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";
    try {
      if (onSubmit) {
        await onSubmit({
          name: nameInput.value.trim(),
          phone: requirePhone ? phoneInput.value.trim() : "",
          password: passwordInput.value,
        });
      }
      close();
    } catch (err) {
      console.error("Could not finish Google signup:", err);
      if (typeof showToast === "function") showToast("Couldn't create the account — try again");
      submitBtn.disabled = false;
      submitBtn.textContent = "Finish sign up";
    }
  }

  function handleCancel() {
    close();
    if (onCancel) onCancel();
  }

  form.addEventListener("submit", handleSubmit);
  cancelBtn.addEventListener("click", handleCancel);
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
  const user = getUser();
  localStorage.removeItem(AUTH_KEY);
  syncAccountLink();
  if (typeof showToast === "function") showToast("logged out");
  if (user && user.email) releaseDeviceSession("shop", emailToKey(user.email));
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
   Guard this device's claim on the shop session — see "Single-
   device login" above. Runs once on load, then keeps watching live
   for the rest of the page's lifetime.
--------------------------------------------------------------- */
(function guardShopSession() {
  const user = getUser();
  if (!user || !user.email) return;
  const emailKey = emailToKey(user.email);
  function invalidate() {
    if (!getUser()) return; // already handled
    localStorage.removeItem(AUTH_KEY);
    syncAccountLink();
    if (typeof showToast === "function") showToast("Logged out — this account signed in on another device");
  }
  verifyDeviceSession("shop", emailKey, invalidate);
  watchDeviceSession("shop", emailKey, invalidate);
})();

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
