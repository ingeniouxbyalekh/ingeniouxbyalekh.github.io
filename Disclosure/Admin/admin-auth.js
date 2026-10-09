/* admin-auth.js
   Admin authentication, fully isolated from the public site's user login.

   The admin runs on its OWN named Firebase app ("admin-panel"), so its Auth
   session is stored under a different key than the site's default app.
   A visitor signing in with Google (or signing out) on the site can never
   change, replace or be mistaken for the admin session, and the reverse.
   Firestore is created from the same admin app, so every admin request
   carries the admin token only. */
import { auth as siteAuth } from "../firebase-init.js";   // used only to reuse the project config
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const adminApp = getApps().find(a => a.name === "admin-panel") || initializeApp(siteAuth.app.options, "admin-panel");
export const auth = getAuth(adminApp);
export const db = getFirestore(adminApp);

// Internal admin login id (not a real inbox). Must match firestore.rules.
const ADMIN_EMAIL = "admin@ingenioux.in";

const $ = id => document.getElementById(id);

/* ---------------- toast ---------------- */
let tt;
const toast = (t, err) => { const el = $("toast"); el.textContent = t; el.className = "show" + (err ? " err" : ""); clearTimeout(tt); tt = setTimeout(() => el.className = err ? "err" : "", 3800); };
const say = t => { const m = $("lmsg"); m.textContent = t || ""; m.className = "lmsg" + (t ? " on" : ""); };

/* ---------------- auth ---------------- */
/* Rules:
   1. One device at a time. The live session is config/adminSession {sid, device, at}.
      A new login that finds a fresh session asks first; OK signs the old device out.
   2. 3 wrong passwords lock this browser for 24 hours (kept in localStorage + a cookie). */
const SID_KEY = "adm_sid", LOCK_KEY = "adm_lock";
const MAX_FAILS = 3, LOCK_MS = 24 * 3600 * 1000;
const HEARTBEAT_MS = 60 * 1000, STALE_MS = 5 * 60 * 1000;   // a session silent for 5 min is treated as closed
const sessRef = doc(db, "config", "adminSession");
let mySid = null, unsubSess = null, hb = null, gate = 0, lockT = null;

/* ---- 24h browser lock ---- */
function readLock() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); } catch {}
  const c = document.cookie.match(/(?:^|; )adm_lock=([^;]*)/);
  if (c) { try { const w = JSON.parse(decodeURIComponent(c[1])); if (!v || (w.until || 0) > (v.until || 0) || (w.fails || 0) > (v.fails || 0)) v = w; } catch {} }
  return v || { fails: 0, until: 0 };
}
function writeLock(v) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch {}
  const age = v.until > Date.now() ? Math.ceil((v.until - Date.now()) / 1000) : 30 * 86400;
  document.cookie = "adm_lock=" + encodeURIComponent(JSON.stringify(v)) + "; max-age=" + age + "; path=/; SameSite=Strict";
}
function clearLock() {
  try { localStorage.removeItem(LOCK_KEY); } catch {}
  document.cookie = "adm_lock=; max-age=0; path=/";
}
const isLocked = () => (readLock().until || 0) > Date.now();
const fmtLeft = ms => { const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h + "h " + String(m).padStart(2, "0") + "m " + String(s).padStart(2, "0") + "s"; };
function applyLock() {
  clearInterval(lockT);
  const tick = () => {
    const l = readLock(), left = (l.until || 0) - Date.now();
    if (left <= 0) {
      clearInterval(lockT);
      if (l.until) { clearLock(); showEntry(); say(); }
      return false;
    }
    $("setup").hidden = true; $("lform").hidden = true;
    $("ltitle").textContent = "Login locked";
    $("lsub").textContent = "";
    say("Too many incorrect passwords. This browser is locked for 24 hours. Try again in " + fmtLeft(left) + ".");
    return true;
  };
  if (tick()) lockT = setInterval(tick, 1000);
}

/* ---- CAPTCHA (admin login) ---- */
let capCode = "";
function newCaptcha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  capCode = Array.from({ length: 5 }, () => chars[rnd(chars.length)]).join("");
  const cv = $("capCv"), c = cv.getContext("2d"), W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#EEF2FF"); g.addColorStop(1, "#FDF2F8");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {            // noise lines
    c.strokeStyle = `hsla(${rnd(360)},55%,45%,.45)`; c.lineWidth = 1 + rnd(2);
    c.beginPath(); c.moveTo(rnd(W), rnd(H)); c.bezierCurveTo(rnd(W), rnd(H), rnd(W), rnd(H), rnd(W), rnd(H)); c.stroke();
  }
  for (let i = 0; i < 45; i++) {           // noise dots
    c.fillStyle = `hsla(${rnd(360)},50%,40%,.5)`;
    c.beginPath(); c.arc(rnd(W), rnd(H), 1 + rnd(2), 0, 7); c.fill();
  }
  c.textBaseline = "middle";
  const step = (W - 24) / capCode.length;
  [...capCode].forEach((ch, i) => {        // distorted characters
    c.save();
    c.translate(16 + i * step + step / 2, H / 2 + (rnd(10) - 5));
    c.rotate((rnd(50) - 25) * Math.PI / 180);
    c.font = `800 ${28 + rnd(8)}px "Courier New", monospace`;
    c.fillStyle = `hsl(${rnd(360)},60%,28%)`;
    c.textAlign = "center"; c.fillText(ch, 0, 0);
    c.restore();
  });
  for (let i = 0; i < 2; i++) {            // strike-through lines over the text
    c.strokeStyle = "rgba(15,23,42,.55)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, rnd(H)); c.lineTo(W, rnd(H)); c.stroke();
  }
  $("capIn").value = "";
}
$("capNew").onclick = () => { newCaptcha(); $("capIn").focus(); };

/* ---- entry screen ---- */
async function showEntry(forceLogin) {
  let exists = true;
  try { exists = (await getDoc(doc(db, "config", "admin"))).exists(); } catch {}
  const setup = !exists && !forceLogin;
  $("setup").hidden = !setup; $("lform").hidden = setup;
  if (!setup) newCaptcha();
  $("ltitle").textContent = setup ? "Create admin password" : "Admin login";
  $("lsub").textContent = setup ? "First visit: choose a password. You will use it to log in from now on." : "";
  if (isLocked()) applyLock();
}

/* ---- single-device session ---- */
const deviceName = () => {
  const u = navigator.userAgent;
  const b = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "a browser";
  const o = /Windows/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Mac OS/.test(u) ? "macOS" : /Linux/.test(u) ? "Linux" : "an unknown system";
  return b + " on " + o;
};
const ago = ms => ms < 90000 ? "just now" : Math.round(ms / 60000) + " min ago";
const newSid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));

function ask(text) {
  return new Promise(res => {
    $("dlgp").textContent = text; $("dlg").hidden = false; $("dlgOk").focus();
    const done = v => { $("dlg").hidden = true; $("dlgNo").onclick = $("dlgOk").onclick = null; res(v); };
    $("dlgNo").onclick = () => done(false);
    $("dlgOk").onclick = () => done(true);
  });
}
function stopSession() {
  if (unsubSess) { unsubSess(); unsubSess = null; }
  clearInterval(hb); hb = null;
}
// true = this device now owns the session, false = user cancelled
async function claimSession(my) {
  const mine = localStorage.getItem(SID_KEY);
  let d = null;
  try { const s = await getDoc(sessRef); d = s.exists() ? s.data() : null; }
  catch (err) { toast("Single-device check unavailable (" + (err.code || err.message) + "). Update Firestore rules for config/adminSession.", true); mySid = mine || newSid(); return true; }
  const age = d && d.at && d.at.toMillis ? Date.now() - d.at.toMillis() : 0;
  const other = d && d.sid && d.sid !== mine && age < STALE_MS;
  if (other) {
    $("login").hidden = false; $("app").hidden = true;
    const go = await ask("This admin account is already signed in on another device (" + (d.device || "unknown device") + ", active " + ago(age) + "). Continue here to sign that device out, or cancel to stay signed out here.");
    if (my !== gate) return false;
    if (!go) return false;
  }
  mySid = (d && d.sid === mine && mine) ? mine : newSid();
  try { localStorage.setItem(SID_KEY, mySid); } catch {}
  try { await setDoc(sessRef, { sid: mySid, device: deviceName(), at: serverTimestamp() }); }
  catch (err) { toast("Could not register this login (" + (err.code || err.message) + ").", true); }
  return true;
}
function watchSession() {
  stopSession();
  unsubSess = onSnapshot(sessRef, s => {
    if (s.metadata.hasPendingWrites || !s.exists()) return;
    if (s.data().sid !== mySid) kickedOut();
  }, () => {});
  hb = setInterval(() => updateDoc(sessRef, { at: serverTimestamp() }).catch(() => {}), HEARTBEAT_MS);
}
async function kickedOut() {
  stopSession(); mySid = null;
  try { localStorage.removeItem(SID_KEY); } catch {}
  await signOut(auth);
  say("You were signed out because this admin account was opened on another device.");
}

/* ---- auth state (admin app only) ---- */
export function startAdminAuth({ onEnter, onLeave }) {
  onAuthStateChanged(auth, async u => {
    const my = ++gate;
    const ok = u && (u.email || "").toLowerCase() === ADMIN_EMAIL;
    onLeave(); stopSession();
    if (!ok) {
      $("login").hidden = false; $("app").hidden = true;
      await showEntry(); if (u) say("This account is not an admin.");
      return;
    }
    $("login").hidden = true; $("app").hidden = true;
    const owned = await claimSession(my);
    if (my !== gate) return;
    if (!owned) { await signOut(auth); return; }
    $("login").hidden = true; $("app").hidden = false;
    onEnter();
    watchSession();
  });
}

$("out").onclick = async () => {
  const sid = mySid;
  stopSession(); mySid = null;
  try { const s = await getDoc(sessRef); if (s.exists() && s.data().sid === sid) await deleteDoc(sessRef); } catch {}
  try { localStorage.removeItem(SID_KEY); } catch {}
  signOut(auth);
};

$("setup").onsubmit = async e => {
  e.preventDefault(); say();
  const p1 = $("np").value, p2 = $("np2").value;
  if (p1.length < 8) return say("Use at least 8 characters.");
  if (p1 !== p2) return say("The two passwords don't match.");
  try {
    const { user } = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, p1);
    await updateProfile(user, { displayName: "Admin" });
    await setDoc(doc(db, "config", "admin"), { createdAt: new Date().toISOString() });
  } catch (err) {
    if (err.code === "auth/email-already-in-use") { await showEntry(true); say("A password already exists. Log in with it."); }
    else say("Could not create password (" + (err.code || err.message) + ").");
  }
};

$("lform").onsubmit = async e => {
  e.preventDefault(); say();
  if (isLocked()) return applyLock();
  if ($("capIn").value.trim().toUpperCase() !== capCode) {   // wrong CAPTCHA does not count as a password attempt
    newCaptcha(); $("capIn").focus();
    return say("The security code is incorrect. Please try the new one.");
  }
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, $("pw").value);
    clearLock(); $("pw").value = ""; newCaptcha();
  } catch (err) {
    newCaptcha();
    if (["auth/invalid-credential", "auth/wrong-password"].includes(err.code)) {
      const l = readLock(); l.fails = (l.fails || 0) + 1;
      if (l.fails >= MAX_FAILS) l.until = Date.now() + LOCK_MS;
      writeLock(l); $("pw").value = "";
      if (l.until > Date.now()) applyLock();
      else { const left = MAX_FAILS - l.fails; say("Password is incorrect. " + left + (left === 1 ? " attempt" : " attempts") + " left before this browser is locked for 24 hours."); }
    } else say("Login failed (" + err.code + ").");
  }
};

export { $, toast };
