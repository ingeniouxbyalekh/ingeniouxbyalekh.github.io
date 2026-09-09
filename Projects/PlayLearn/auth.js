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
    photoUrl: user.photoUrl || "",
    photoOriginalUrl: user.photoOriginalUrl || "",
    updatedAt: Date.now(),
  });
}

/* ---------------------------------------------------------------
   Cloudinary — profile photo upload (unsigned)
   ---------------------------------------------------------------
   Uploads go straight from the browser to Cloudinary using an
   unsigned upload preset, so no API secret ever needs to live in
   front-end code. Every time a profile photo is set (at signup) or
   changed (from profile.html) this uploads TWO images, each with its
   own "(n)" counter that increments on every upload so a later
   change can never overwrite an earlier one:
     - the circular-cropped version ("photoUrl") IS the profile
       picture, named after the account's EMAIL — "<email>(<n>)"
     - the original file exactly as chosen ("photoOriginalUrl") is
       named after the account holder's full NAME instead —
       "<name>(<n>)" — kept as a separate counter so it can't
       collide with the circular version's name
   The counters themselves live in Firebase at photoSeq/<emailKey>,
   incremented with a transaction so they stay correct even across
   devices/sessions. Nothing already on Cloudinary is ever deleted
   here — changing a photo just uploads new files under the next
   number and updates which URLs the profile record points to, so
   every earlier upload stays reachable at its existing URL.
--------------------------------------------------------------- */
const CLOUDINARY_CLOUD_NAME = "fygvclvm";
const CLOUDINARY_UPLOAD_PRESET = "PlayLearn";

// Cloudinary public IDs can't contain most punctuation, so turn a
// name or email into a safe, still-recognizable base, e.g.
// "a.sahoo@gmail.com" -> "a-sahoo-gmail-com", "Alekh Sahoo" -> "alekh-sahoo".
function toPublicIdBase(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
// Kept as an alias — some call sites still reference the old name.
const emailToPublicIdBase = toPublicIdBase;

// Atomically bumps and returns the next "(n)" number for this email
// + kind ("original" or "circular"), so two uploads — even from two
// tabs/devices at once — never end up with the same number.
async function nextPhotoSeq(emailKey, kind) {
  if (!db) return 1;
  const ref = db.ref(`photoSeq/${emailKey}/${kind}`);
  const result = await ref.transaction((current) => (current || 0) + 1);
  return result.snapshot.val();
}

// Guesses a file extension from a File/Blob's MIME type.
function extensionForType(type) {
  if (/png/i.test(type || "")) return "png";
  if (/webp/i.test(type || "")) return "webp";
  return "jpg";
}

// Uploads to Cloudinary via the unsigned preset. The asset's name on
// Cloudinary comes from `filename` — the preset here names uploads
// after the uploaded file's own filename rather than an explicitly
// passed "public_id" (an unsigned-preset restriction), so `filename`
// has to be a real, meaningful name or a cropped canvas Blob (which
// has no filename of its own) shows up in the media library as a
// bare "blob", and a phone photo keeps whatever name the camera gave
// it. `public_id` is still sent too, in case the preset is ever
// changed to honor it — harmless either way.
async function uploadToCloudinary(fileOrBlob, filename) {
  const form = new FormData();
  form.append("file", fileOrBlob, filename);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const dot = filename.lastIndexOf(".");
  form.append("public_id", dot > -1 ? filename.slice(0, dot) : filename);
  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: form,
    });
  } catch (networkErr) {
    // Mobile browsers throw a plain "Failed to fetch" here for things like
    // a dropped/slow mobile-data connection mid-upload — surface that
    // distinctly from a Cloudinary-side rejection below.
    throw new Error("Network error reaching Cloudinary: " + networkErr.message);
  }
  if (!res.ok) {
    // Cloudinary's actual reason (file too large, bad format, preset
    // misconfigured, etc.) — without this, every failure looked identical
    // ("Cloudinary upload failed (400)") no matter the real cause, which is
    // why the mobile-only failure couldn't be diagnosed from the toast alone.
    let detail = "";
    try {
      const errData = await res.json();
      detail = (errData && errData.error && errData.error.message) || "";
    } catch (_) {
      /* body wasn't JSON — ignore, we still have res.status */
    }
    throw new Error("Cloudinary upload failed (" + res.status + ")" + (detail ? ": " + detail : ""));
  }
  const data = await res.json();
  return data.secure_url;
}

// Uploads the original file and the cropped circular blob in
// parallel: the original is named after the account holder's full
// NAME, the circular crop after their EMAIL — each with its own
// "(n)" counter (see above) so a later change never overwrites an
// earlier upload. Returns { photoUrl, photoOriginalUrl }.
async function uploadProfilePhotos(originalFile, croppedBlob, { name, email }) {
  const emailKey = emailToKey(email);
  const nameBase = toPublicIdBase(name) || toPublicIdBase(email);
  const emailBase = toPublicIdBase(email);
  const [originalSeq, circularSeq] = await Promise.all([
    nextPhotoSeq(emailKey, "original"),
    nextPhotoSeq(emailKey, "circular"),
  ]);
  const [photoOriginalUrl, photoUrl] = await Promise.all([
    uploadToCloudinary(originalFile, `${nameBase}(${originalSeq}).${extensionForType(originalFile.type)}`),
    uploadToCloudinary(croppedBlob, `${emailBase}(${circularSeq}).${extensionForType(croppedBlob.type)}`),
  ]);
  return { photoUrl, photoOriginalUrl };
}

/* ---------------------------------------------------------------
   Profile photo step — a modal for picking + circle-cropping a
   profile photo. Used two ways:
     - mode: "signup" — shown once during shop sign-up (manual and
       Google), with a "Skip for now" option since a photo isn't
       required.
     - mode: "change" — shown from profile.html's "Change photo"
       control, with a "Cancel" option instead of skip.
   Cropping happens entirely client-side on a <canvas> (drag to pan,
   slider to zoom) — nothing is uploaded until "Use this photo" is
   clicked, at which point onComplete({ originalFile, croppedBlob })
   is called and the caller does the actual Cloudinary upload +
   Firebase write (this modal never touches either itself).
--------------------------------------------------------------- */
function ensureProfilePhotoModal() {
  let overlay = document.getElementById("profile-photo-modal");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "profile-photo-modal";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-body">
        <h3 id="ppm-title" style="margin:0 0 6px;">Add a profile photo</h3>
      <p id="ppm-sub" style="margin:0 0 14px; font-size:13px; color:var(--text-dim);">Optional, but upload to join our community.</p>
        <div class="ppm-picker" id="ppm-picker">
          <label class="ppm-picker-btn" for="ppm-file">Choose an image</label>
          <input type="file" id="ppm-file" accept="image/*" hidden />
        </div>
        <div class="ppm-crop-area" id="ppm-crop-area" style="display:none">
          <div class="ppm-crop-stage">
            <canvas id="ppm-canvas" width="280" height="280"></canvas>
            <div class="ppm-crop-ring"></div>
          </div>
          <label class="ppm-zoom-label">Zoom</label>
          <input type="range" id="ppm-zoom" />
          <button type="button" class="auth-form-foot-link" id="ppm-choose-different">Choose a different image</button>
        </div>
        <div class="ppm-actions">
          <button type="button" class="btn" id="ppm-skip">Skip for now</button>
          <button type="button" class="btn btn-primary" id="ppm-confirm" disabled>Use this photo</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function showProfilePhotoStep({ mode = "signup", onComplete, onSkip } = {}) {
  const overlay = ensureProfilePhotoModal();
  const titleEl = overlay.querySelector("#ppm-title");
  const subEl = overlay.querySelector("#ppm-sub");
  const pickerEl = overlay.querySelector("#ppm-picker");
  const fileInput = overlay.querySelector("#ppm-file");
  const cropArea = overlay.querySelector("#ppm-crop-area");
  const canvas = overlay.querySelector("#ppm-canvas");
  const ctx = canvas.getContext("2d");
  const zoomInput = overlay.querySelector("#ppm-zoom");
  const chooseDifferentBtn = overlay.querySelector("#ppm-choose-different");
  const skipBtn = overlay.querySelector("#ppm-skip");
  const confirmBtn = overlay.querySelector("#ppm-confirm");

  const isChange = mode === "change";
  titleEl.textContent = isChange ? "Change profile photo" : "Add a profile photo";
  skipBtn.textContent = isChange ? "Cancel" : "Skip for now";

  const CANVAS_SIZE = 280;
  const OUTPUT_SIZE = 512;
  let img = null;
  let imgFile = null;
  let scale = 1;
  let minScale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;

  function resetState() {
    img = null;
    imgFile = null;
    scale = 1;
    minScale = 1;
    offsetX = 0;
    offsetY = 0;
    cropArea.style.display = "none";
    pickerEl.style.display = "";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Use this photo";
    fileInput.value = "";
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, CANVAS_SIZE / 2 - w / 2 + offsetX, CANVAS_SIZE / 2 - h / 2 + offsetY, w, h);
    ctx.restore();
  }

  function clampOffsets() {
    const w = img.width * scale;
    const h = img.height * scale;
    const maxX = Math.max(0, (w - CANVAS_SIZE) / 2);
    const maxY = Math.max(0, (h - CANVAS_SIZE) / 2);
    offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
    offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
  }

  function loadFile(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      if (typeof showToast === "function") showToast("Please choose an image file");
      return;
    }
    imgFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        img = image;
        minScale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
        scale = minScale;
        offsetX = 0;
        offsetY = 0;
        zoomInput.min = String(minScale);
        zoomInput.max = String(minScale * 3);
        zoomInput.step = String(minScale / 200);
        zoomInput.value = String(minScale);
        pickerEl.style.display = "none";
        cropArea.style.display = "";
        confirmBtn.disabled = false;
        draw();
      };
      image.onerror = () => {
        if (typeof showToast === "function") showToast("Couldn't read that image — try another");
      };
      image.src = e.target.result;
    };
    reader.onerror = () => {
      if (typeof showToast === "function") showToast("Couldn't read that image — try another");
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange() {
    const file = fileInput.files && fileInput.files[0];
    if (file) loadFile(file);
  }
  function handleChooseDifferent() {
    resetState();
  }
  function handleZoom() {
    if (!img) return;
    scale = parseFloat(zoomInput.value);
    clampOffsets();
    draw();
  }
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }
  function handleDragStart(e) {
    if (!img) return;
    dragging = true;
    const p = pointerPos(e);
    dragStartX = p.x;
    dragStartY = p.y;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    e.preventDefault();
  }
  function handleDragMove(e) {
    if (!dragging) return;
    const p = pointerPos(e);
    offsetX = startOffsetX + (p.x - dragStartX);
    offsetY = startOffsetY + (p.y - dragStartY);
    clampOffsets();
    draw();
    e.preventDefault();
  }
  function handleDragEnd() {
    dragging = false;
  }

  function cropToBlob() {
    return new Promise((resolve) => {
      const out = document.createElement("canvas");
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const octx = out.getContext("2d");
      octx.save();
      octx.beginPath();
      octx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      octx.clip();
      const factor = OUTPUT_SIZE / CANVAS_SIZE;
      const w = img.width * scale * factor;
      const h = img.height * scale * factor;
      octx.drawImage(img, OUTPUT_SIZE / 2 - w / 2 + offsetX * factor, OUTPUT_SIZE / 2 - h / 2 + offsetY * factor, w, h);
      octx.restore();
      out.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  // Phone cameras commonly hand over multi-megabyte photos (often 4-12MB),
  // sometimes in HEIC/HEIF — a format Cloudinary's free/unsigned upload
  // path doesn't reliably accept. Desktop file pickers rarely produce
  // files that large or in that format, which is why this only breaks on
  // mobile. Since the browser already decoded the file into `img` to draw
  // the crop preview, re-encode it to a normal-sized JPEG from that same
  // decoded image whenever the original looks risky, instead of uploading
  // the raw file as-is.
  function prepareOriginalForUpload() {
    const MAX_BYTES = 4 * 1024 * 1024; // 4MB
    const MAX_DIM = 2000;
    const isWebSafeType = /^image\/(jpeg|png|webp)$/i.test(imgFile.type || "");
    const isSmallEnough = imgFile.size <= MAX_BYTES;
    const isWithinDims = img.width <= MAX_DIM && img.height <= MAX_DIM;
    if (isWebSafeType && isSmallEnough && isWithinDims) {
      return Promise.resolve(imgFile);
    }
    return new Promise((resolve) => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob((blob) => resolve(blob || imgFile), "image/jpeg", 0.85);
    });
  }

  function cleanup() {
    fileInput.removeEventListener("change", handleFileChange);
    chooseDifferentBtn.removeEventListener("click", handleChooseDifferent);
    zoomInput.removeEventListener("input", handleZoom);
    canvas.removeEventListener("mousedown", handleDragStart);
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    canvas.removeEventListener("touchstart", handleDragStart);
    canvas.removeEventListener("touchmove", handleDragMove);
    canvas.removeEventListener("touchend", handleDragEnd);
    skipBtn.removeEventListener("click", handleSkip);
    confirmBtn.removeEventListener("click", handleConfirm);
    overlay.classList.remove("is-open");
    resetState();
  }

  async function handleConfirm() {
    if (!img || !imgFile) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Uploading…";
    try {
      const croppedBlob = await cropToBlob();
      const originalForUpload = await prepareOriginalForUpload();
      if (onComplete) await onComplete({ originalFile: originalForUpload, croppedBlob });
      cleanup();
    } catch (err) {
      // err.message now carries the real reason (network vs. Cloudinary's
      // own rejection reason) — check the browser console on the phone
      // (or have it emailed/logged) next time this happens to confirm
      // which case it is.
      console.error("Could not save profile photo:", err);
      if (typeof showToast === "function") showToast("Couldn't upload photo — try again");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Use this photo";
    }
  }

  function handleSkip() {
    cleanup();
    if (onSkip) onSkip();
  }

  fileInput.addEventListener("change", handleFileChange);
  chooseDifferentBtn.addEventListener("click", handleChooseDifferent);
  zoomInput.addEventListener("input", handleZoom);
  canvas.addEventListener("mousedown", handleDragStart);
  window.addEventListener("mousemove", handleDragMove);
  window.addEventListener("mouseup", handleDragEnd);
  canvas.addEventListener("touchstart", handleDragStart, { passive: false });
  canvas.addEventListener("touchmove", handleDragMove, { passive: false });
  canvas.addEventListener("touchend", handleDragEnd);
  skipBtn.addEventListener("click", handleSkip);
  confirmBtn.addEventListener("click", handleConfirm);

  resetState();
  overlay.classList.add("is-open");
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
  if (user && user.email) logActivity(emailToKey(user.email), "logout");
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
   Activity log — private, never surfaced to the customer themselves
   ---------------------------------------------------------------
   Every signed-in shop customer's actions get written to Firebase at
   activity/<emailKey>/<pushId>: { type, page, ts, ...details }.
   Nothing here is read anywhere except executive.html's Activity
   tab — this is for the executive team, not the customer.
     type: "login" | "signup" | "logout" | "profile_update" |
           "pageview" | "click"
   A pageview's `from` field is the page the visitor was on right
   before this one — tracked per-tab via sessionStorage, falling back
   to document.referrer for the first page of a session — which is
   what reconstructs "clicked X on page A, landed on page B" chains
   without needing to intercept every navigating click itself.

   NOTE ON THIS FEATURE'S OWN TRUST MODEL: like the rest of this stub
   auth, nothing here is enforced server-side — anyone reading this
   file can see exactly what's logged and, in principle, write fake
   entries to /activity themselves. Treat this log the same way as
   /users: useful signal once Firebase rules lock the database down,
   not tamper-proof before that.
--------------------------------------------------------------- */
const ACTIVITY_LAST_PAGE_KEY = "PlayLearn_activity_last_page";

function currentPageName() {
  return window.location.pathname.split("/").pop() || "index.html";
}

// Fire-and-forget — a logging failure never blocks or breaks the
// page it happens on.
async function logActivity(emailKey, type, details) {
  if (!db || !emailKey) return;
  try {
    await db.ref("activity/" + emailKey).push({
      type,
      page: currentPageName(),
      ts: Date.now(),
      ...(details || {}),
    });
  } catch (err) {
    console.error("Could not log activity:", err);
  }
}

function trackPageView() {
  const user = getUser();
  if (!user || !user.email) return;
  let from = "";
  try {
    from = sessionStorage.getItem(ACTIVITY_LAST_PAGE_KEY) || "";
  } catch (_) { /* ignore */ }
  if (!from && document.referrer) {
    try {
      from = new URL(document.referrer).pathname.split("/").pop() || "";
    } catch (_) { /* ignore */ }
  }
  logActivity(emailToKey(user.email), "pageview", { from: from || "(direct)" });
  try {
    sessionStorage.setItem(ACTIVITY_LAST_PAGE_KEY, currentPageName());
  } catch (_) { /* ignore */ }
}

// Every click on a link or button, site-wide, while signed in. Best-
// effort: a click that immediately navigates to another page can
// lose the write mid-flight, but the destination page's own
// pageview record (with `from`) still captures that transition, so
// the "which link after which link" trail survives either way.
function trackClicks() {
  document.addEventListener("click", (e) => {
    const user = getUser();
    if (!user || !user.email) return;
    const el = e.target.closest("a, button");
    if (!el) return;
    const label = (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const href = el.tagName === "A" ? el.getAttribute("href") || "" : "";
    logActivity(emailToKey(user.email), "click", { tag: el.tagName.toLowerCase(), label, href });
  }, true);
}

trackPageView();
trackClicks();

/* ---------------------------------------------------------------
   Device info — automatically captured for every logged-in shop
   customer (not admin/executive accounts — see the calls at the
   bottom of this file; admin.html/executive.html deliberately don't
   call captureDeviceInfoOnce for their own sessions)
   ---------------------------------------------------------------
   Written to Firebase at UserDeviceInfo/<emailKey>/<pushId> — each
   new login or device change gets its OWN pushed record rather than
   overwriting a single one, so admin.html can show a customer's
   history of logins/devices, not just their most recent. Used by
   admin.html's "Devices" section.

   Gathers everything the browser will hand over without asking the
   visitor for any extra permission:
     - browser + OS (parsed from the UA string)
     - device model, via Chrome's User-Agent Client Hints
       (navigator.userAgentData.getHighEntropyValues) when available —
       this is the only reliable way to get a real model string like
       "SM-S918B", since plain UA strings are being frozen/genericized
       on modern Chrome/Android — falling back to a regex guess against
       the raw UA string on browsers that don't expose client hints
     - screen/viewport size, pixel ratio, color depth
     - CPU cores, RAM (where exposed), touch support
     - network type/speed (navigator.connection, Chrome/Android mostly)
     - battery level/charging (a handful of browsers still expose this)
     - public IP, ISP/org, and coarse geolocation (city/region/country)
       from a free, no-key, CORS-enabled IP lookup — this is the only
       piece that leaves the browser to a third party (ipwho.is)

   Every field here is best-effort: a browser that doesn't expose a
   given API (or a blocked/offline IP lookup) just omits that field
   rather than failing the whole capture — see collectDeviceInfo().
--------------------------------------------------------------- */
const DEVICE_INFO_ROOT = "UserDeviceInfo"; // UserDeviceInfo/<emailKey>
const DEVICE_INFO_SESSION_FLAG = "PlayLearn_device_info_captured";

// Lightweight UA parse — no full UA-parser library is loaded, so this
// covers the common desktop/mobile browsers with a short list of
// token/version patterns rather than pulling in a dependency for it.
function parseUserAgent(ua) {
  ua = ua || "";
  let browser = "Unknown";
  let browserVersion = "";
  const patterns = [
    ["Edg", "Edge"],
    ["OPR", "Opera"],
    ["SamsungBrowser", "Samsung Internet"],
    ["Firefox", "Firefox"],
    ["FxiOS", "Firefox (iOS)"],
    ["CriOS", "Chrome (iOS)"],
    ["Chrome", "Chrome"],
    ["Safari", "Safari"],
  ];
  for (const [token, name] of patterns) {
    const m = ua.match(new RegExp(token + "\\/([\\d.]+)"));
    if (m) {
      browser = name;
      browserVersion = m[1];
      break;
    }
  }
  let os = "Unknown";
  let osVersion = "";
  let m;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    os = "Windows";
    osVersion = m[1];
  } else if ((m = ua.match(/Mac OS X ([\d_.]+)/))) {
    os = "macOS";
    osVersion = m[1].replace(/_/g, ".");
  } else if ((m = ua.match(/Android ([\d.]+)/))) {
    os = "Android";
    osVersion = m[1];
  } else if ((m = ua.match(/iPad.*CPU OS ([\d_]+)/))) {
    os = "iPadOS";
    osVersion = m[1].replace(/_/g, ".");
  } else if ((m = ua.match(/iPhone OS ([\d_]+)/))) {
    os = "iOS";
    osVersion = m[1].replace(/_/g, ".");
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }
  return { browser, browserVersion, os, osVersion };
}

// Best-effort device-model guess straight from the UA string, for
// browsers that don't expose navigator.userAgentData (Firefox,
// Samsung Internet, etc. on Android). Matches the bit between
// "Android X.Y;" and "Build"/")" — e.g. "SM-S918B" out of
// "...Android 14; SM-S918B Build/UP1A...".
function guessDeviceModelFromUA(ua) {
  const m = String(ua || "").match(/Android [\d.]+;\s*([^;)]+?)\s*(Build|\))/i);
  return m ? m[1].trim() : "";
}

// Gathers as much device/browser/network info as the platform will
// give up without prompting the visitor for any extra permission.
// Every section is wrapped so one missing/throwing API (a browser
// that doesn't support it, an offline IP lookup, a refused client-
// hints call) never stops the rest of the fields from being collected.
async function collectDeviceInfo() {
  const ua = navigator.userAgent || "";
  const parsedUA = parseUserAgent(ua);

  const info = {
    userAgent: ua,
    browser: parsedUA.browser,
    browserVersion: parsedUA.browserVersion,
    os: parsedUA.os,
    osVersion: parsedUA.osVersion,
    platform: navigator.platform || "",
    vendor: navigator.vendor || "",
    language: navigator.language || "",
    languages: (navigator.languages || []).join(", "),
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      } catch (_) {
        return "";
      }
    })(),
    screenWidth: window.screen ? screen.width : null,
    screenHeight: window.screen ? screen.height : null,
    availWidth: window.screen ? screen.availWidth : null,
    availHeight: window.screen ? screen.availHeight : null,
    colorDepth: window.screen ? screen.colorDepth : null,
    pixelRatio: window.devicePixelRatio || 1,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    orientation: (screen.orientation && screen.orientation.type) || "",
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    isTouchDevice: (navigator.maxTouchPoints || 0) > 0,
    cookiesEnabled: navigator.cookieEnabled,
    deviceModel: guessDeviceModelFromUA(ua) || "",
  };

  const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
  if (conn) {
    info.networkType = conn.effectiveType || conn.type || "";
    info.downlinkMbps = conn.downlink != null ? conn.downlink : null;
    info.rttMs = conn.rtt != null ? conn.rtt : null;
    info.saveData = !!conn.saveData;
  }

  // Chrome's User-Agent Client Hints — the reliable way to get a real
  // device model string (e.g. "SM-S918B"), plus platform/arch details
  // that the plain UA string no longer reveals on modern Chrome.
  if (navigator.userAgentData) {
    info.uaPlatform = navigator.userAgentData.platform || "";
    info.uaMobile = !!navigator.userAgentData.mobile;
    info.uaBrands = (navigator.userAgentData.brands || []).map((b) => `${b.brand} ${b.version}`).join(", ");
    try {
      const hi = await navigator.userAgentData.getHighEntropyValues([
        "model",
        "platformVersion",
        "fullVersionList",
        "architecture",
        "bitness",
      ]);
      if (hi.model) info.deviceModel = hi.model;
      if (hi.platformVersion) info.platformVersion = hi.platformVersion;
      if (hi.architecture) info.architecture = hi.architecture;
      if (hi.bitness) info.bitness = hi.bitness;
      if (hi.fullVersionList && hi.fullVersionList.length) {
        info.fullBrowserVersion = hi.fullVersionList.map((b) => `${b.brand} ${b.version}`).join(", ");
      }
    } catch (_) {
      /* client-hints call can refuse/throw — not fatal, keep the UA-string fallback */
    }
  }

  // Battery — removed from most desktop browsers, but still present
  // on some Android WebViews, so it's worth trying best-effort.
  try {
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      info.batteryLevelPct = Math.round(battery.level * 100);
      info.batteryCharging = !!battery.charging;
    }
  } catch (_) {
    /* ignore */
  }

  // Public IP + ISP/org + coarse location, from a free, no-key,
  // CORS-enabled lookup. The only piece of this that's a third-party
  // network call — wrapped so a blocked/offline request just leaves
  // these fields off rather than failing the whole capture.
  try {
    const res = await fetch("https://ipwho.is/");
    if (res.ok) {
      const geo = await res.json();
      if (geo && geo.success !== false) {
        info.ip = geo.ip || "";
        info.isp = (geo.connection && (geo.connection.isp || geo.connection.org)) || "";
        info.asn = (geo.connection && geo.connection.asn) || "";
        info.city = geo.city || "";
        info.region = geo.region || "";
        info.country = geo.country || "";
        info.countryCode = geo.country_code || "";
        info.ipTimezone = (geo.timezone && geo.timezone.id) || "";
        info.latitude = geo.latitude != null ? geo.latitude : null;
        info.longitude = geo.longitude != null ? geo.longitude : null;
      }
    }
  } catch (err) {
    console.error("Could not look up IP/ISP info:", err);
  }

  return info;
}

// Collects + pushes a new device-info record for this browser to
// UserDeviceInfo/<emailKey>/<pushId>. Each capture becomes its own
// record (not an overwrite) so admin.html can show the customer's
// history of logins/devices, not just the most recent one. `extra`
// (e.g. { name, email }) is merged in so admin.html doesn't need a
// second lookup against /users just to show whose device this is.
// Fire-and-forget — a failure here never blocks or breaks the page
// it happens on.
async function saveDeviceInfo(accountType, emailKey, extra) {
  if (!db || !emailKey) return;
  try {
    const info = await collectDeviceInfo();
    info.accountType = accountType;
    info.deviceId = getDeviceId();
    info.lastPage = currentPageName();
    info.updatedAt = Date.now();
    if (extra) Object.assign(info, extra);
    await db.ref(`${DEVICE_INFO_ROOT}/${emailKey}`).push(info);
  } catch (err) {
    console.error("Could not save device info:", err);
  }
}

// Runs saveDeviceInfo at most once per browser tab session (per
// account), so navigating between pages while signed in doesn't
// re-run the IP lookup and re-write Firebase on every single page —
// still "automatic" (no user action needed) without hammering either.
function captureDeviceInfoOnce(accountType, emailKey, extra) {
  if (!emailKey) return;
  const flagKey = `${DEVICE_INFO_SESSION_FLAG}:${accountType}:${emailKey}`;
  try {
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, "1");
  } catch (_) {
    /* sessionStorage unavailable — fall through and just capture anyway */
  }
  saveDeviceInfo(accountType, emailKey, extra);
}

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
  captureDeviceInfoOnce("shop", emailKey, { name: user.name || "", email: user.email });
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
