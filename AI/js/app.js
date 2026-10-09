import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { initializeFirestore, getFirestore, collection, query, where, orderBy, limit, startAfter, getDocs, onSnapshot, getCountFromServer } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { getDatabase, ref as rRef, get as rGet, set as rSet, update as rUpdate, onValue as rOn } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

/* =====================================================================
   Firebase (ingenioux-ai project; own app instance)
   - Cloud Firestore      : analytics data written by /datalake.js (read-only here)
   - Realtime Database    : admin login only (password hash + single-device session)
===================================================================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDCZMSbvb9Kb-qam7Pl6y3fvObnAeM9mkI",
  authDomain: "ingenioux-ai.firebaseapp.com",
  /* Realtime Database URL of the ingenioux-ai project (region: asia-southeast1). */
  databaseURL: "https://ingenioux-ai-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ingenioux-ai",
  storageBucket: "ingenioux-ai.firebasestorage.app",
  messagingSenderId: "1078122034249",
  appId: "1:1078122034249:web:a0021c403178723aa9fb98"
};
const COLS = { events: "ai_events", sessions: "ai_sessions", muts: "ai_db_mutations", reads: "ai_db_reads" };
const CFG_COL = "ai_config", CFG_DOC = "access";
const PAGE = 1000;

let app;
try { app = getApps().find(a => a.name === "ingenioux-ai") || initializeApp(FIREBASE_CONFIG, "ingenioux-ai"); } catch (e) { app = getApp("ingenioux-ai"); }
let db;
try { db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); } catch (e) { db = getFirestore(app); }
const rtdb = getDatabase(app);                       // admin login lives here (Realtime Database)

/* =====================================================================
   tiny helpers
===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("en-IN");
const cf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const N = n => nf.format(Math.round(n || 0));
const C = n => (Math.abs(n) >= 10000 ? cf.format(n) : nf.format(Math.round(n)));
const pct = (a, b, d = 0) => b ? (100 * a / b).toFixed(d) + "%" : "–";
const dur = ms => { ms = Math.round(ms || 0); if (ms <= 0) return "0s"; const s = Math.round(ms / 1000); if (s < 60) return s + "s"; const m = Math.floor(s / 60); if (m < 60) return m + "m " + (s % 60) + "s"; const h = Math.floor(m / 60); return h + "h " + (m % 60) + "m"; };
const fmtT = ts => ts ? new Date(ts).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–";
const fmtD = ts => new Date(ts).toLocaleDateString([], { day: "2-digit", month: "short" });
const fmtH = ts => new Date(ts).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit" });
const trunc = (s, n = 70) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
const avg = a => a.length ? sum(a) / a.length : 0;
const pctile = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const emailOf = k => (k || "").replace(/,/g, ".");
function tally(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (k == null || k === "") continue; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v); }
function download(name, text, mime) { const b = new Blob([text], { type: mime }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const sget = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };
const sdel = k => { try { sessionStorage.removeItem(k); } catch (e) { } };
const lget = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

/* =====================================================================
   Password gate (password lives in Realtime Database: ai_config/access)
===================================================================== */
const enc = new TextEncoder();
const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: iter }, key, 256));
}
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
const safeEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

let accessDoc = null;       // current ai_config/access data (or null)
const accessRef = () => rRef(rtdb, CFG_COL + "/" + CFG_DOC);
async function fetchAccess() {
  const s = await rGet(accessRef());
  accessDoc = s.exists() ? s.val() : null;
  return accessDoc;
}
async function verify(pw) {
  const d = accessDoc; if (!d) return false;
  if (d.passwordHash && d.salt) return safeEq(await pbkdf2(pw, d.salt, d.iterations || 150000), d.passwordHash);
  if (typeof d.password === "string" && d.password) return safeEq(pw, d.password);
  return false;
}
const tokenFor = async d => sha("ix-ai|" + (d.passwordHash || "") + "|" + (d.salt || "") + "|" + (d.password || ""));
async function savePassword(pw) {
  const salt = rnd(16), iterations = 150000;
  const passwordHash = await pbkdf2(pw, salt, iterations);
  await rUpdate(accessRef(), { passwordHash, salt, iterations, algo: "PBKDF2-SHA256", password: null, updatedAt: Date.now() });
  await fetchAccess();
}

/* ---- AI key sync: the API key is encrypted (AES-GCM) with a key derived from the dashboard password
        and stored in Realtime Database at ai_config/ai, so every device that logs in can read it.
        The database rules are public, so the key is NEVER stored there in plain text. ---- */
const AI_NODE = "ai";
const aiRef = () => rRef(rtdb, CFG_COL + "/" + AI_NODE);
let AIC = null;                                   // decrypted AI settings for this login (in memory only)
const unhex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function deriveEk(pw) { return pbkdf2(pw, "ix-ai-key|" + ((accessDoc && accessDoc.salt) || ""), 150000); }
async function ekKey(usage) { const h = sget("IX_AI_EK"); if (!h) return null; return crypto.subtle.importKey("raw", unhex(h), "AES-GCM", false, [usage]); }
async function pushAiCfg() {
  const k = await ekKey("encrypt"); if (!k || !AIC) return false;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(AIC)));
  await rSet(aiRef(), { v: 1, iv: hex(iv), ct: hex(ct), updatedAt: Date.now() });
  return true;
}
async function loadAiCfg() {
  try {
    const k = await ekKey("decrypt"); if (!k) return;
    const s = await rGet(aiRef());
    if (s.exists() && s.val().ct) {
      const d = s.val();
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unhex(d.iv) }, k, unhex(d.ct));
      const c = JSON.parse(new TextDecoder().decode(pt)); if (c && PROVS[c.prov]) AIC = c;
    } else {
      // nothing in the cloud yet: move a key that was saved in this browser (old behaviour) up to the cloud
      const old = aiCfg(); AIC = old; if (old.key) { await pushAiCfg(); try { localStorage.removeItem("IX_AI_CFG"); localStorage.removeItem("IX_AI_KEY"); } catch (e) { } }
    }
  } catch (e) { console.warn("AI settings sync failed", e); }
  if (V && (cur === "ai" || cur === "settings")) render();   // only these tabs show the AI connection
}

const lockMsg = (t, c) => { const m = $("#lock-msg"); m.textContent = t || ""; m.className = "msg " + (c || ""); };
let lockMode = "login", failCount = 0, lockedUntil = 0;


/* =====================================================================
   Single-device login: a second login asks first, then logs the other device out
   (Realtime Database node ai_config/session = { sid, dev, loginAt, lastSeen })
===================================================================== */
const SES_DOC = "session", STALE_MS = 120000;
const MY_SID = sget("IX_AI_SID") || (sset("IX_AI_SID", rnd(8)), sget("IX_AI_SID"));
const sesRef = () => rRef(rtdb, CFG_COL + "/" + SES_DOC);
const myDev = () => { const u = parseUA(navigator.userAgent); return u.browser + " · " + u.os + " · " + u.device; };
let hb = null, unsubSes = null;
async function otherLogin() {
  try { const s = await rGet(sesRef()); if (!s.exists()) return null; const d = s.val(); if (d.sid && d.sid !== MY_SID && Date.now() - (d.lastSeen || 0) < STALE_MS) return d; } catch (e) { }
  return null;
}
async function claimSession() { const n = Date.now(); await rSet(sesRef(), { sid: MY_SID, dev: myDev(), loginAt: n, lastSeen: n, updatedAt: n }); }
function watchSession() {
  clearInterval(hb); if (unsubSes) unsubSes();
  hb = setInterval(() => { rUpdate(sesRef(), { lastSeen: Date.now() }).catch(() => { }); }, 30000);
  unsubSes = rOn(sesRef(), s => { const d = s.val(); if (d && d.sid && d.sid !== MY_SID) forceLogout(); }, () => { });
}
function forceLogout() { clearInterval(hb); if (unsubSes) unsubSes(); sdel("IX_AI_OK"); sdel("IX_AI_EK"); sset("IX_AI_KICK", "1"); location.reload(); }
async function releaseSession() { clearInterval(hb); try { const s = await rGet(sesRef()); if (s.exists() && s.val().sid === MY_SID) await rUpdate(sesRef(), { sid: "", lastSeen: 0 }); } catch (e) { } }
function confirmDlg(title, html) {
  return new Promise(res => {
    const w = document.createElement("div"); w.className = "dlg-back";
    w.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3><p>${html}</p><div class="dlg-act"><button class="btn ghost" data-r="0">Cancel</button><button class="btn" data-r="1">OK</button></div></div>`;
    document.body.appendChild(w);
    const kd = e => { if (e.key === "Escape") done(false); };
    const done = v => { w.remove(); document.removeEventListener("keydown", kd); res(v); };
    document.addEventListener("keydown", kd);
    w.onclick = e => { const r = e.target.dataset && e.target.dataset.r; if (r != null) done(r === "1"); };
    w.querySelector('[data-r="1"]').focus();
  });
}
async function enter() {
  const o = await otherLogin();
  if (o) {
    const since = new Date(o.loginAt || Date.now()).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    const ok = await confirmDlg("Another login found", `This account is already logged in on another device (<b>${esc(o.dev || "unknown device")}</b>, since ${esc(since)}). If you continue, that device will be <b>logged out</b> and this device will take over.`);
    if (!ok) { sdel("IX_AI_OK"); $("#pw1").value = ""; $("#pw2").value = ""; return lockMsg("Login cancelled. The other device is still logged in.", "err"); }
  }
  await claimSession().catch(() => { }); watchSession(); unlock();
}

/* ---- brute-force guard: 5 wrong passwords => this browser/device is blocked for 24 h ---- */
const MAX_FAILS = 5, BLOCK_MS = 864e5;
function blockedLeft() {
  const u = +lget("IX_AI_BLOCK") || 0;
  if (u > Date.now()) return u - Date.now();
  if (u) { lset("IX_AI_BLOCK", "0"); lset("IX_AI_FAILS", "0"); }
  return 0;
}
function showBlocked(ms) {
  $("#lock-title").textContent = "Device blocked"; $("#lock-sub").textContent = "Too many wrong password attempts.";
  $("#lock-form").classList.add("hidden"); $("#pw1").value = ""; $("#pw2").value = "";
  lockMsg("This device is blocked for 24 hours. Try again in " + dur(ms) + ".", "err");
  $("#lock-hint").textContent = "Blocked until " + new Date(Date.now() + ms).toLocaleString() + ".";
}

async function bootLock() {
  { const b = blockedLeft(); if (b) return showBlocked(b); }
  if (!(window.crypto && crypto.subtle)) { $("#lock-sub").textContent = "This page needs a secure context (https:// or localhost) for password hashing."; return; }
  try {
    await fetchAccess();
  } catch (e) {
    $("#lock-sub").textContent = "Could not read the access settings.";
    lockMsg(/permission[_-]denied/i.test(e.code || e.message || "") ? "Realtime Database refused the read of ai_config/access. Publish database.rules.json (Firebase Console > Realtime Database > Rules) and check databaseURL at the top of js/app.js." : (e.message || String(e)), "err");
    return;
  }
  // resume an unlocked session in this tab
  const tk = sget("IX_AI_OK");
  if (accessDoc && tk && safeEq(tk, await tokenFor(accessDoc))) {
    if (!(await otherLogin())) { await claimSession().catch(() => { }); watchSession(); return unlock(); }
    sdel("IX_AI_OK"); sset("IX_AI_KICK", "1");   // another device took over while this tab was closed/asleep
  }

  $("#lock-form").classList.remove("hidden");
  if (!accessDoc) {
    lockMode = "setup";
    $("#lock-title").textContent = "Create AI password";
    $("#lock-sub").textContent = "";
    $("#pw1-l").textContent = "New password"; $("#pw1").autocomplete = "new-password";
    $("#pw2-wrap").classList.remove("hidden"); $("#pw2").required = true;
    $("#lock-btn").textContent = "Save";
    $("#lock-hint").textContent = "";
  } else {
    $("#lock-title").textContent = "AI Data Lab";
    $("#lock-sub").textContent = "";
    $("#lock-hint").textContent = "";
  }
  if (sget("IX_AI_KICK")) { sdel("IX_AI_KICK"); lockMsg("You were logged out because this account was opened on another device.", "err"); }
  $("#pw1").focus();
}

$("#lock-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  { const b0 = blockedLeft(); if (b0) return showBlocked(b0); }
  const pw = $("#pw1").value, btn = $("#lock-btn");
  if (Date.now() < lockedUntil) return lockMsg("Too many attempts — wait " + Math.ceil((lockedUntil - Date.now()) / 1000) + "s.", "err");
  btn.disabled = true; lockMsg("");
  try {
    if (lockMode === "setup") {
      if (pw.length < 6) throw new Error("Use at least 6 characters.");
      if (pw !== $("#pw2").value) throw new Error("The two passwords do not match.");
      await savePassword(pw);
      sset("IX_AI_OK", await tokenFor(accessDoc)); sset("IX_AI_EK", await deriveEk(pw));
      return enter();
    }
    await fetchAccess();                         // always check against the live value
    if (await verify(pw)) { lset("IX_AI_FAILS", "0"); sset("IX_AI_OK", await tokenFor(accessDoc)); sset("IX_AI_EK", await deriveEk(pw)); return enter(); }
    const f = (+lget("IX_AI_FAILS") || 0) + 1; lset("IX_AI_FAILS", String(f));
    if (f >= MAX_FAILS) { lset("IX_AI_BLOCK", String(Date.now() + BLOCK_MS)); return showBlocked(BLOCK_MS); }
    const left = MAX_FAILS - f;
    lockMsg("Wrong password. " + left + " attempt" + (left === 1 ? "" : "s") + " left before this device is blocked for 24 hours.", "err");
    $("#pw1").value = ""; $("#pw1").focus();
  } catch (e) { lockMsg(/permission[_-]denied/i.test(e.code || e.message || "") ? "Realtime Database refused the request — check database.rules.json." : (e.message || String(e)), "err"); }
  finally { btn.disabled = false; }
});

function unlock() {
  $("#lock").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#pw1").value = ""; $("#pw2").value = "";
  startApp();
}
$("#btn-lock").onclick = async () => { sdel("IX_AI_OK"); sdel("IX_AI_EK"); await releaseSession(); location.reload(); };

/* =====================================================================
   Data loading
===================================================================== */
const D = { events: [], sessions: [], muts: [], reads: [], loadedAt: 0, errors: {}, truncated: {}, readsUsed: 0, range: [0, 0] };
let V = null;           // filtered / derived view
let loading = false;

function rangeFrom() {
  const v = $("#f-range").value;
  if (v === "custom") {
    const f = $("#f-from").value, t = $("#f-to").value;
    return [f ? new Date(f + "T00:00:00").getTime() : 0, t ? new Date(t + "T23:59:59.999").getTime() : Date.now()];
  }
  const days = +v; return [days ? Date.now() - days * 864e5 : 0, Date.now()];
}
const tsOf = e => e.clientTs || (e.uploadedAt && e.uploadedAt.toMillis ? e.uploadedAt.toMillis() : 0);

async function loadCol(name, from, to, cap, prog) {
  const out = []; let last = null, truncated = false;
  while (out.length < cap) {
    const cons = [];
    if (from) cons.push(where("clientTs", ">=", from));
    if (to && to < Date.now() - 60000) cons.push(where("clientTs", "<=", to));
    cons.push(orderBy("clientTs", "desc"));
    if (last) cons.push(startAfter(last));
    cons.push(limit(Math.min(PAGE, cap - out.length)));
    const snap = await getDocs(query(collection(db, name), ...cons));
    D.readsUsed += snap.size; addReads(snap.size);
    snap.forEach(d => { const x = d.data(); x._id = d.id; x._c = name; x._ts = tsOf(x); out.push(x); });
    prog(out.length);
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
    if (out.length >= cap) truncated = true;
  }
  return { out, truncated };
}

async function loadAll() {
  if (loading) return; loading = true;
  const [from, to] = rangeFrom(), cap = +$("#f-cap").value, withDb = $("#f-db").checked;
  const bar = $("#progress i"); bar.style.width = "4%";
  $("#p-status").textContent = "loading…"; $("#btn-reload").disabled = true;
  D.errors = {}; D.truncated = {}; D.range = [from, to];
  const jobs = [["events", COLS.events], ["sessions", COLS.sessions]];
  if (withDb) jobs.push(["muts", COLS.muts], ["reads", COLS.reads]);
  const counts = {}; let done = 0;
  await Promise.all(jobs.map(async ([key, name]) => {
    try {
      const r = await loadCol(name, from, to, cap, n => { counts[key] = n; $("#p-status").textContent = "loading… " + C(sum(Object.values(counts))) + " docs"; bar.style.width = Math.min(92, 8 + sum(Object.values(counts)) / (cap * jobs.length) * 84) + "%"; });
      D[key] = r.out; D.truncated[key] = r.truncated;
    } catch (e) { D[key] = []; D.errors[key] = e; }
    done++;
  }));
  if (!withDb) { D.muts = []; D.reads = []; }
  D.loadedAt = Date.now(); loading = false; bar.style.width = "100%"; setTimeout(() => bar.style.width = "0", 500);
  $("#btn-reload").disabled = false;
  populateFilters(); refresh();
}

/* =====================================================================
   Filters + derived view
===================================================================== */
const F = { area: "", dev: "", aud: "", user: "", staff: true };
function populateFilters() { /* Area and Device filters are fixed lists defined in index.html */ }
function readFilters() {
  F.area = $("#f-area").value; F.dev = $("#f-dev").value; F.aud = $("#f-aud").value;
  F.user = $("#f-user").value.trim().toLowerCase(); F.staff = $("#f-staff").checked;
  F.devMap = null;
  if (F.dev) F.devMap = new Map(D.sessions.map(x => [x.sessionId, parseUA(x.device && x.device.userAgent).device]));
}
/* "Home" = the site root (logged as area "main" or "index.html") */
const areaKey = a => { a = String(a || "").toLowerCase(); return a === "main" || a === "index.html" || a === "index" ? "home" : a; };
function pass(e) {
  const p = e.page || {};
  if (F.area && areaKey(p.area) !== F.area) return false;
  if (!F.staff && (p.area === "admin" || p.area === "executive")) return false;
  if (F.dev && (!F.devMap || F.devMap.get(e.sessionId) !== F.dev)) return false;
  if (F.aud === "in" && !e.userKey) return false;
  if (F.aud === "anon" && e.userKey) return false;
  if (F.user) { const u = ((e.userKey || "") + " " + ((e.user && e.user.name) || "")).toLowerCase(); if (u.indexOf(F.user) < 0) return false; }
  return true;
}

/* ---- parse helpers ---- */
function parseUA(u) {
  u = u || ""; let b = "Other", o = "Other", d = "Desktop";
  if (/Edg\//.test(u)) b = "Edge"; else if (/OPR\/|Opera/.test(u)) b = "Opera"; else if (/SamsungBrowser/.test(u)) b = "Samsung Internet";
  else if (/Firefox|FxiOS/.test(u)) b = "Firefox"; else if (/Chrome|CriOS/.test(u)) b = "Chrome"; else if (/Safari/.test(u)) b = "Safari";
  if (/Windows/.test(u)) o = "Windows"; else if (/Android/.test(u)) o = "Android"; else if (/iPhone|iPad|iPod|iOS/.test(u)) o = "iOS"; else if (/CrOS/.test(u)) o = "ChromeOS"; else if (/Mac OS X|Macintosh/.test(u)) o = "macOS"; else if (/Linux/.test(u)) o = "Linux";
  if (/iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u))) d = "Tablet"; else if (/Mobi|iPhone|Android/.test(u)) d = "Mobile";
  return { browser: b, os: o, device: d };
}
const pageLabel = e => { const p = e.page || {}; return (p.area && p.area !== "main" ? p.area + (p.semester ? " S" + p.semester : "") + "/" : "") + (p.name || "?"); };
function refHost(s) {
  const r = s.landing && s.landing.referrer; if (!r) return "(direct)";
  try { const h = new URL(r).host.replace(/^www\./, ""); const l = s.landing.url ? new URL(s.landing.url).host.replace(/^www\./, "") : ""; return h === l ? "(internal)" : h; } catch (e) { return "(direct)"; }
}
const clickLabel = d => trunc(((d && (d.text || d.aria || d.title || d.id || d.name)) || (d && d.tag) || "?").replace(/\s+/g, " "), 60);
function pathGroup(p) { const a = String(p || "").split("/").filter(Boolean); if (!a.length) return "(root)"; return a.length === 1 ? a[0] : a[0] + "/*" + (a.length > 2 ? "/" + (/^[a-z]+$/i.test(a[2]) && a[2].length < 18 ? a[2] : "*") : ""); }

function summ(e) {
  const d = e.data || {}, t = e.type;
  switch (t) {
    case "page_view": return "Viewed " + pageLabel(e);
    case "click": return "Clicked “" + clickLabel(d) + "”" + (d.fileLink ? " (file download)" : "");
    case "form_submit": return "Submitted form " + ((d.form && (d.form.id || d.form.name || d.form.action)) || "");
    case "search_input": return "Searched “" + trunc(d.query, 50) + "”";
    case "scroll_depth": return "Scrolled to " + d.depthPct + "%";
    case "page_leave": return "Left " + pageLabel(e) + " · active " + dur(d.activeMs) + ", scroll " + (d.maxScrollPct || 0) + "%";
    case "js_error": case "unhandled_rejection": return "Error: " + trunc(d.message, 90);
    case "resource_error": return "Resource failed: " + trunc(d.src, 70);
    case "ui_toast": case "ui_alert": return "Message: " + trunc(d.message, 90);
    case "api_call": return d.method + " " + trunc(d.host, 30) + " → " + (d.status || d.error || "?") + " (" + d.durationMs + "ms)";
    case "auth_state": return "Auth: " + (d.action || "");
    case "route_change": return "Route → " + trunc(d.to, 60);
    case "db_write": return "DB " + e.op + " " + trunc(e.path, 70);
    case "db_read": return "DB " + e.op + " " + trunc(e.path, 70);
    case "media": return "Media " + d.action + " " + trunc(d.src, 50);
    case "local_state": return "Local " + d.op + " " + d.key;
    default: return t + (d && d.text ? " " + trunc(d.text, 50) : "");
  }
}

function derive() {
  readFilters();
  const events = D.events.filter(pass), muts = D.muts.filter(pass), reads = D.reads.filter(pass);
  const sdocs = D.sessions.filter(pass);
  const sdoc = new Map(sdocs.map(s => [s.sessionId, s]));

  // sessions
  const S = new Map();
  const getS = id => { let s = S.get(id); if (!s) { s = { id, first: Infinity, last: 0, ev: 0, pv: 0, clicks: 0, errors: 0, writes: 0, active: 0, pages: new Set(), user: null, name: "", visitor: null, doc: sdoc.get(id) || null, area: "", seq: [] }; S.set(id, s); } return s; };
  for (const e of events) {
    const s = getS(e.sessionId); s.ev++; s.first = Math.min(s.first, e._ts); s.last = Math.max(s.last, e._ts);
    if (e.userKey) { s.user = e.userKey; s.name = (e.user && e.user.name) || s.name; }
    s.visitor = e.visitorId || s.visitor; s.area = s.area || (e.page && e.page.area);
    if (e.type === "page_view") { s.pv++; s.pages.add(pageLabel(e)); s.seq.push(pageLabel(e)); }
    else if (e.type === "click") s.clicks++;
    else if (e.category === "error") s.errors++;
    else if (e.type === "page_leave") s.active += (e.data && e.data.activeMs) || 0;
  }
  for (const m of muts) { const s = getS(m.sessionId); s.writes++; s.first = Math.min(s.first, m._ts); s.last = Math.max(s.last, m._ts); if (m.userKey && !s.user) s.user = m.userKey; }
  for (const sd of sdocs) { const s = getS(sd.sessionId); s.first = Math.min(s.first, sd.startedAt || sd._ts); s.last = Math.max(s.last, sd._ts); s.visitor = s.visitor || sd.visitorId; if (sd.userKey && !s.user) s.user = sd.userKey; s.area = s.area || (sd.page && sd.page.area); }
  const sessions = [...S.values()].filter(s => isFinite(s.first)).map(s => {
    s.dur = Math.max(0, s.last - s.first); s.bounce = s.pv <= 1;
    s.landing = s.seq[0] || (s.doc && s.doc.page ? pageLabel(s.doc) : "");
    s.ua = parseUA(s.doc && s.doc.device && s.doc.device.userAgent);
    s.ref = s.doc ? refHost(s.doc) : "(unknown)";
    return s;
  }).sort((a, b) => b.first - a.first);

  // users
  const U = new Map();
  for (const e of events) {
    if (!e.userKey) continue;
    let u = U.get(e.userKey); if (!u) { u = { key: e.userKey, email: emailOf(e.userKey), name: "", semester: "", regNo: "", ev: 0, sess: new Set(), first: Infinity, last: 0, pv: 0, clicks: 0, active: 0, errors: 0, writes: 0, pages: new Map() }; U.set(e.userKey, u); }
    u.ev++; u.sess.add(e.sessionId); u.first = Math.min(u.first, e._ts); u.last = Math.max(u.last, e._ts);
    if (e.user) { u.name = e.user.name || u.name; u.semester = e.user.semester || u.semester; u.regNo = e.user.regNo || u.regNo; }
    if (e.type === "page_view") { u.pv++; const l = pageLabel(e); u.pages.set(l, (u.pages.get(l) || 0) + 1); }
    else if (e.type === "click") u.clicks++; else if (e.category === "error") u.errors++;
    else if (e.type === "page_leave") u.active += (e.data && e.data.activeMs) || 0;
  }
  for (const m of muts) if (m.userKey && U.has(m.userKey)) U.get(m.userKey).writes++;
  const users = [...U.values()].sort((a, b) => b.ev - a.ev);

  const by = t => events.filter(e => e.type === t);
  V = { events, muts, reads, sdocs, sessions, users, by, pv: by("page_view"), clicks: by("click"), leaves: by("page_leave"), errs: events.filter(e => e.category === "error") };
  const ts = events.map(e => e._ts).concat(muts.map(e => e._ts)).filter(Boolean);
  V.minTs = ts.length ? Math.min(...ts) : 0; V.maxTs = ts.length ? Math.max(...ts) : 0;
  V.visitors = new Set(events.map(e => e.visitorId).filter(Boolean));
}

/* =====================================================================
   Chart + UI primitives
===================================================================== */
const charts = {}; let post = [];
const PAL = ["#1f7a5c", "#b9832a", "#3b6ea5", "#c1443a", "#7a5aa6", "#2a9aa0", "#8a8f3a", "#d1698b", "#6b7280"];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.color = css("--dim"); Chart.defaults.borderColor = css("--soft");
  Chart.defaults.font.family = css("--sans"); Chart.defaults.font.size = 11.5;
  Chart.defaults.plugins.legend.labels.boxWidth = 10; Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.maintainAspectRatio = false; Chart.defaults.animation = { duration: 350 };
  Chart.defaults.plugins.tooltip.padding = 9;
}
function mkChart(id, cfg) { post.push(() => { const el = document.getElementById(id); if (!el) return; if (!window.Chart) { el.parentNode.innerHTML = '<div class="empty">Chart library failed to load (offline?).</div>'; return; } if (charts[id]) charts[id].destroy(); charts[id] = new Chart(el, cfg); }); }
const card = (title, sub, body, span = "c6") => `<section class="card ${span}"><h3>${esc(title)}</h3><div class="sub">${esc(sub || "")}</div>${body}</section>`;
const cv = (id, cls = "") => `<div class="cv ${cls}"><canvas id="${id}"></canvas></div>`;
const empty = (t = "No data in this selection.") => `<div class="empty">${esc(t)}</div>`;
function barList(rows, o = {}) {
  if (!rows.length) return empty();
  const max = Math.max(...rows.map(r => r.v)) || 1, tot = o.total || sum(rows.map(r => r.v));
  return '<div class="bars">' + rows.slice(0, o.n || 10).map((r, i) => `<div class="bar" title="${esc(r.k)}"><span class="n">${esc(trunc(r.label || r.k, 48))}</span><span class="t"><i style="width:${(100 * r.v / max).toFixed(1)}%;${o.color ? "background:" + o.color : ""}"></i></span><span class="v">${o.fmt ? o.fmt(r.v) : N(r.v)}${o.share ? " · " + pct(r.v, tot) : ""}</span></div>`).join("") + "</div>";
}
function spark(vals) {
  if (vals.length < 2) return "";
  const mx = Math.max(...vals, 1), w = 100, h = 30, pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - v / mx * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
const kpi = (label, val, sub, sp, tip) => `<section class="card kpi c3" ><div class="lbl">${esc(label)}</div><div class="val">${val}</div><p class="sub">${sub || "&nbsp;"}</p>${sp || ""}</section>`;
function table(cols, rows, o = {}) {
  if (!rows.length) return empty();
  const id = "t" + Math.random().toString(36).slice(2, 8);
  tables[id] = { cols, rows, sort: o.sort ?? -1, dir: o.dir || -1, onRow: o.onRow, n: o.n || 200 };
  post.push(() => drawTable(id)); return `<div class="scroll" style="max-height:${o.h || 460}px" id="${id}"></div>`;
}
const tables = {};
function drawTable(id) {
  const T = tables[id], el = document.getElementById(id); if (!el) return;
  let rows = T.rows.slice();
  if (T.sort >= 0) { const c = T.cols[T.sort]; rows.sort((a, b) => { const x = c.sv ? c.sv(a) : c.v(a), y = c.sv ? c.sv(b) : c.v(b); return (x > y ? 1 : x < y ? -1 : 0) * T.dir; }); }
  el.innerHTML = '<table class="t"><thead><tr>' + T.cols.map((c, i) => `<th class="s" data-i="${i}">${esc(c.h)}${T.sort === i ? (T.dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("") + "</tr></thead><tbody>" +
    rows.slice(0, T.n).map((r, ri) => `<tr class="${T.onRow ? "click" : ""}" data-r="${T.rows.indexOf(r)}">` + T.cols.map(c => `<td class="${c.num ? "num" : ""}">${c.html ? c.v(r) : esc(c.v(r))}</td>`).join("") + "</tr>").join("") + "</tbody></table>" +
    (rows.length > T.n ? `<div class="faint" style="padding:8px">Showing first ${T.n} of ${N(rows.length)} rows.</div>` : "");
  $$("th", el).forEach(th => th.onclick = () => { const i = +th.dataset.i; if (T.sort === i) T.dir *= -1; else { T.sort = i; T.dir = -1; } drawTable(id); });
  if (T.onRow) $$("tbody tr", el).forEach(tr => tr.onclick = () => T.onRow(T.rows[+tr.dataset.r]));
}
function openModal(title, html) {
  const r = $("#modal-root"); r.innerHTML = `<div class="modal"><div class="box"><div class="mh"><h2 style="flex:1;font-size:20px">${esc(title)}</h2><button class="btn ghost sm" id="mx">Close ✕</button></div><div class="mb">${html}</div></div></div>`;
  const close = () => r.innerHTML = ""; $("#mx").onclick = close; $(".modal", r).onclick = e => { if (e.target.classList.contains("modal")) close(); };
  return r;
}
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#modal-root").innerHTML = ""; });

/* time bucketing */
function buckets(items, unit, getTs = e => e._ts) {
  const step = unit === "h" ? 36e5 : 864e5, m = new Map();
  const floor = t => { const d = new Date(t); if (unit === "h") d.setMinutes(0, 0, 0); else d.setHours(0, 0, 0, 0); return d.getTime(); };
  let lo = Infinity, hi = 0;
  for (const it of items) { const t = floor(getTs(it)); if (!t) continue; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  if (!isFinite(lo)) return { keys: [], floor, step };
  const keys = []; for (let t = lo; t <= hi; t = floor(t + step * 1.5)) keys.push(t);
  return { keys, floor, step };
}
function unitFor() { const span = (V.maxTs - V.minTs); return span && span <= 3 * 864e5 ? "h" : "d"; }
function seriesOf(items, unit, getTs = e => e._ts, pick) {
  const b = buckets(items, unit, getTs), idx = new Map(b.keys.map((k, i) => [k, i]));
  const vals = b.keys.map(() => 0);
  for (const it of items) { const i = idx.get(b.floor(getTs(it))); if (i != null) vals[i] += pick ? pick(it) : 1; }
  return { keys: b.keys, vals, labels: b.keys.map(unit === "h" ? fmtH : fmtD) };
}
function uniqSeries(items, unit, idFn) {
  const b = buckets(items, unit, e => e._ts), idx = new Map(b.keys.map((k, i) => [k, i])), sets = b.keys.map(() => new Set());
  for (const it of items) { const i = idx.get(b.floor(it._ts)), id = idFn(it); if (i != null && id) sets[i].add(id); }
  return { keys: b.keys, vals: sets.map(s => s.size), labels: b.keys.map(unit === "h" ? fmtH : fmtD) };
}
const lineCfg = (labels, sets, o = {}) => ({ type: o.bar ? "bar" : "line", data: { labels, datasets: sets.map((s, i) => ({ label: s.label, data: s.data, borderColor: s.color || PAL[i % PAL.length], backgroundColor: o.bar ? (s.color || PAL[i % PAL.length]) : (s.color || PAL[i % PAL.length]) + "26", fill: !o.bar && (o.fill ?? sets.length === 1), tension: .3, pointRadius: labels.length > 60 ? 0 : 2, borderWidth: 2, borderRadius: 3 })) },
  options: { interaction: { mode: "index", intersect: false }, scales: { x: { stacked: !!o.stack, grid: { display: false }, ticks: { maxTicksLimit: 10, autoSkip: true } }, y: { stacked: !!o.stack, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: sets.length > 1 } } } });
const doughCfg = (rows, n = 8) => { const top = rows.slice(0, n), rest = sum(rows.slice(n).map(r => r.v)); const L = top.map(r => r.k).concat(rest ? ["other"] : []), Dd = top.map(r => r.v).concat(rest ? [rest] : []); return { type: "doughnut", data: { labels: L, datasets: [{ data: Dd, backgroundColor: L.map((_, i) => PAL[i % PAL.length]), borderColor: css("--panel"), borderWidth: 2 }] }, options: { cutout: "62%", plugins: { legend: { position: "right" } } } }; };
const hbarCfg = (rows, color, n = 10) => ({ type: "bar", data: { labels: rows.slice(0, n).map(r => trunc(r.k, 28)), datasets: [{ data: rows.slice(0, n).map(r => r.v), backgroundColor: color || PAL[0], borderRadius: 4 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });

/* =====================================================================
   TAB: Overview
===================================================================== */
function tabOverview() {
  const e = V.events, u = unitFor();
  if (!e.length && !V.sdocs.length) return noData();
  const tsE = seriesOf(e, u), tsS = uniqSeries(e, u, x => x.sessionId), tsV = uniqSeries(e, u, x => x.visitorId), tsP = seriesOf(V.pv, u);
  const act = sum(V.sessions.map(s => s.active)), bounce = V.sessions.filter(s => s.bounce).length;
  const ret = V.sdocs.filter(s => !s.isNewVisitor).length;
  const cats = tally(e, x => x.category), types = tally(e, x => x.type);
  const loggedIn = new Set(e.filter(x => x.userKey).map(x => x.userKey)).size;
  let h = '<div class="grid">';
  h += kpi("Sessions", N(V.sessions.length), `${N(V.visitors.size)} unique visitors`, spark(tsS.vals));
  h += kpi("Page views", N(V.pv.length), `${(V.pv.length / Math.max(1, V.sessions.length)).toFixed(1)} per session`, spark(tsP.vals));
  h += kpi("Total events", C(e.length), `${N(types.length)} event types`, spark(tsE.vals));
  h += kpi("Signed-in users", N(loggedIn), pct(e.filter(x => x.userKey).length, e.length) + " of events", spark(tsV.vals));
  h += kpi("Avg session length", dur(avg(V.sessions.map(s => s.dur))), "median " + dur(pctile(V.sessions.map(s => s.dur), .5)));
  h += kpi("Avg active time", dur(act / Math.max(1, V.sessions.filter(s => s.active).length)), "per session (not idle)");
  h += kpi("Bounce rate", pct(bounce, V.sessions.length), "single-page sessions");
  h += kpi("Returning visits", pct(ret, V.sdocs.length), N(V.sdocs.length) + " session records");
  h += kpi("Clicks", C(V.clicks.length), (V.clicks.length / Math.max(1, V.sessions.length)).toFixed(1) + " per session");
  h += kpi("DB writes", C(V.muts.length), V.muts.length ? N(tally(V.muts, m => m.domain).length) + " data domains" : "DB logs off / none");
  h += kpi("Errors", N(V.errs.length), pct(V.errs.length, e.length, 2) + " of events");
  h += kpi("Data window", dur(V.maxTs - V.minTs), V.minTs ? fmtD(V.minTs) + " → " + fmtD(V.maxTs) : "");
  h += "</div>";
  h += '<div class="grid">' +
    card("Activity over time", u === "h" ? "Events and page views per hour" : "Events and page views per day", cv("c-act", "tall"), "c8") +
    card("Events by category", "What kind of signals arrive", cv("c-cat", "tall"), "c4") + "</div>";
  h += '<div class="grid">' +
    card("Sessions & unique visitors", "Distinct sessions vs people (browser ids)", cv("c-sv"), "c6") +
    card("Top event types", "Most frequent signals", barList(types.map(t => ({ k: t.k, v: t.v })), { n: 12, share: true, total: e.length }), "c6") + "</div>";
  h += '<div class="grid">' +
    card("Where is the traffic?", "Events by area of the site", cv("c-area"), "c4") +
    card("Top pages", "By page views", barList(tally(V.pv, pageLabel), { n: 10 }), "c4") +
    card("Busiest times", "Events by hour of day (local time)", cv("c-hod"), "c4") + "</div>";

  mkChart("c-act", lineCfg(tsE.labels, [{ label: "Events", data: tsE.vals }, { label: "Page views", data: tsP.vals, color: PAL[1] }], { fill: true }));
  const cb = buckets(e, u), ci = new Map(cb.keys.map((k, i) => [k, i]));
  mkChart("c-cat", doughCfg(cats));
  mkChart("c-sv", lineCfg(tsS.labels, [{ label: "Sessions", data: tsS.vals }, { label: "Visitors", data: tsV.vals, color: PAL[2] }]));
  mkChart("c-area", doughCfg(tally(e, x => x.page && x.page.area), 6));
  const hod = Array(24).fill(0); e.forEach(x => hod[new Date(x._ts).getHours()]++);
  mkChart("c-hod", { type: "bar", data: { labels: hod.map((_, i) => i + "h"), datasets: [{ data: hod, backgroundColor: PAL[0], borderRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true } } } });
  return h;
}
function noData() {
  const errs = Object.entries(D.errors);
  let h = "";
  if (errs.length) h += permBanner();
  h += `<div class="card"><div class="empty"><b style="font-family:var(--display);font-size:18px;color:var(--text)">No data for this selection</b><br>${D.loadedAt ? "Loaded " + N(D.events.length) + " events in total — widen the time range or reset the filters." : "Press “Reload data”."}</div></div>`;
  return h;
}
function permBanner() {
  const errs = Object.entries(D.errors); if (!errs.length) return "";
  const perm = errs.some(([, e]) => e && e.code === "permission-denied"), idx = errs.some(([, e]) => e && e.code === "failed-precondition");
  return `<div class="banner"><b>Some collections could not be read</b><br>${errs.map(([k, e]) => `${esc(COLS[k] || k)}: ${esc(e.code || "")} ${esc(e.message || "")}`).join("<br>")}` +
    (perm ? `<pre>match /databases/{database}/documents {\n  match /ai_events/{d}       { allow create, read: if true; }\n  match /ai_sessions/{d}     { allow create, read: if true; }\n  match /ai_db_mutations/{d} { allow create, read: if true; }\n  match /ai_db_reads/{d}     { allow create, read: if true; }\n  match /ai_config/{d}       { allow read, write: if true; }\n}</pre>` : "") +
    (idx ? "<br>Firestore asks for an index – open the link in the message above and click Create." : "") + `</div>`;
}

/* =====================================================================
   TAB: Audience & Traffic
===================================================================== */
function tabAudience() {
  const sd = V.sdocs, u = unitFor();
  if (!V.sessions.length) return noData();
  const newRet = [{ k: "New visitors", v: sd.filter(s => s.isNewVisitor).length }, { k: "Returning", v: sd.filter(s => !s.isNewVisitor).length }];
  const refs = tally(V.sessions, s => s.ref), lands = tally(V.sessions, s => s.landing);
  const utm = [];
  sd.forEach(s => { const o = s.landing && s.landing.utm; if (o && Object.keys(o).length) utm.push((o.utm_source || "?") + " / " + (o.utm_medium || "?") + (o.utm_campaign ? " / " + o.utm_campaign : "")); });
  const dow = Array(7).fill(0).map(() => Array(24).fill(0)); V.events.forEach(e => { const d = new Date(e._ts); dow[(d.getDay() + 6) % 7][d.getHours()]++; });
  const mx = Math.max(1, ...dow.flat());
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let heat = '<div class="heat"><div></div>' + Array.from({ length: 24 }, (_, i) => `<div class="h">${i % 3 === 0 ? i : ""}</div>`).join("");
  dow.forEach((row, d) => { heat += `<div class="l">${days[d]}</div>` + row.map((v, h) => `<div class="c" title="${days[d]} ${h}:00 — ${N(v)} events" style="background:${v ? `color-mix(in srgb,var(--accent) ${Math.max(8, Math.round(100 * v / mx))}%,var(--sunken))` : ""}"></div>`).join(""); });
  heat += "</div>";
  const vis = new Map(); V.sessions.forEach(s => { if (s.visitor) vis.set(s.visitor, (vis.get(s.visitor) || 0) + 1); });
  const freq = tally([...vis.values()], n => n >= 10 ? "10+" : String(n));
  freq.sort((a, b) => (parseInt(a.k) || 0) - (parseInt(b.k) || 0));
  const tz = tally(sd, s => s.device && s.device.timezone), lang = tally(sd, s => s.device && s.device.language && s.device.language.split("-")[0]);
  const dauU = uniqSeries(V.events, "d", e => e.visitorId);
  const dist = [["<10s", 0, 1e4], ["10–30s", 1e4, 3e4], ["30s–1m", 3e4, 6e4], ["1–3m", 6e4, 18e4], ["3–10m", 18e4, 6e5], ["10–30m", 6e5, 18e5], ["30m+", 18e5, 1e18]].map(([k, a, b]) => ({ k, v: V.sessions.filter(s => s.dur >= a && s.dur < b).length }));
  const pps = tally(V.sessions, s => s.pv >= 8 ? "8+" : String(s.pv)).sort((a, b) => (parseInt(a.k) || 0) - (parseInt(b.k) || 0));

  let h = '<div class="grid">' +
    card("New vs returning visitors", "From session-start records", cv("a-nr", "short"), "c4") +
    card("Traffic sources", "Referrer host of the landing", barList(refs, { n: 8, share: true }), "c4") +
    card("Landing pages", "First page of each session", barList(lands, { n: 8, share: true }), "c4") + "</div>";
  h += '<div class="grid">' + card("When do people visit?", "Events by weekday × hour (local time) — darker = busier", heat, "c12") + "</div>";
  h += '<div class="grid">' +
    card("Daily active visitors", "Unique browser ids per day", cv("a-dau"), "c6") +
    card("Session length", "How long visits last", cv("a-dur"), "c3") +
    card("Pages per session", "Depth of a visit", cv("a-pps"), "c3") + "</div>";
  h += '<div class="grid">' +
    card("Visits per visitor", "How often the same browser comes back (in window)", cv("a-freq", "short"), "c4") +
    card("Languages", "Browser language", barList(lang, { n: 8, share: true }), "c4") +
    card("Time zones", "Where visitors roughly are", barList(tz, { n: 8, share: true }), "c4") + "</div>";
  if (utm.length) h += '<div class="grid">' + card("Campaigns (UTM)", "source / medium / campaign", barList(tally(utm, x => x), { n: 10 }), "c12") + "</div>";

  mkChart("a-nr", doughCfg(newRet)); mkChart("a-dau", lineCfg(dauU.labels, [{ label: "Visitors", data: dauU.vals }]));
  mkChart("a-dur", hbarCfg(dist.map(d => ({ k: d.k, v: d.v })), PAL[2], 8)); mkChart("a-pps", hbarCfg(pps, PAL[1], 9));
  mkChart("a-freq", { type: "bar", data: { labels: freq.map(f => f.k), datasets: [{ data: freq.map(f => f.v), backgroundColor: PAL[4], borderRadius: 4 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
  return h;
}

/* =====================================================================
   TAB: Behaviour (pages, clicks, scroll, search, funnel)
===================================================================== */
const FUNNEL = [
  ["Visited site", s => true],
  ["Viewed a product", s => s.some(e => e.type === "page_view" && e.page.name === "product")],
  ["Added to cart", s => s.some(e => e.type === "click" && /add to cart|add to bag|buy now/i.test(((e.data && (e.data.text || e.data.aria)) || "")))],
  ["Opened checkout", s => s.some(e => (e.type === "click" && /checkout|proceed|pay/i.test(((e.data && (e.data.text || e.data.aria || e.data.id)) || ""))) || (e.type === "form_submit" && /checkout/i.test(JSON.stringify(e.data && e.data.form || ""))))],
  ["Purchase recorded", s => s.some(e => e._c === COLS.muts && /^(purchases|checkout|orders)/.test(e.path || ""))]
];
function tabBehaviour() {
  const e = V.events; if (!e.length) return noData();
  const pages = new Map();
  const P = k => { let p = pages.get(k); if (!p) { p = { k, views: 0, sess: new Set(), clicks: 0, errors: 0, act: [], scr: [], tot: [], load: [] }; pages.set(k, p); } return p; };
  for (const x of e) {
    const p = P(pageLabel(x));
    if (x.type === "page_view") { p.views++; p.sess.add(x.sessionId); const l = x.data && x.data.perf && x.data.perf.loadMs; if (l > 0 && l < 6e4) p.load.push(l); }
    else if (x.type === "click") p.clicks++; else if (x.category === "error") p.errors++;
    else if (x.type === "page_leave" && x.data) { p.act.push(x.data.activeMs || 0); p.scr.push(x.data.maxScrollPct || 0); p.tot.push(x.data.totalMs || 0); }
  }
  const prow = [...pages.values()].filter(p => p.views || p.clicks);
  // clicks
  const clickRows = tally(V.clicks, c => pageLabel(c) + " › " + clickLabel(c.data)).map(r => ({ k: r.k, v: r.v }));
  const dl = tally(V.clicks.filter(c => c.data && c.data.fileLink), c => clickLabel(c.data) + " (" + pageLabel(c) + ")");
  const ext = tally(V.clicks.filter(c => c.data && c.data.external), c => c.data.hrefHost);
  // scroll
  const sd = tally(V.by("scroll_depth"), x => x.data && x.data.depthPct).sort((a, b) => a.k - b.k);
  // searches
  const lastQ = new Map(); V.by("search_input").forEach(x => { const k = x.pageviewId + "|" + (x.data && x.data.field); const q = String((x.data && x.data.query) || "").trim(); if (q.length >= 2) { const prev = lastQ.get(k); if (!prev || x._ts >= prev._ts) lastQ.set(k, { _ts: x._ts, q: q.toLowerCase() }); } });
  const searches = tally([...lastQ.values()], z => z.q);
  const forms = new Map(); V.by("form_submit").forEach(x => { const f = (x.data && x.data.form && (x.data.form.id || x.data.form.name || x.data.form.action)) || "(form)"; const o = forms.get(f) || { k: f, n: 0, ok: 0 }; o.n++; if (x.data && x.data.valid) o.ok++; forms.set(f, o); });
  const media = tally(V.by("media").filter(m => m.data && m.data.action === "play"), m => trunc((m.data.src || "").split("/").pop() || m.data.src, 40));
  const toasts = tally(V.by("ui_toast"), x => trunc(x.data && x.data.message, 80));
  const dwell = [["<5s", 0, 5e3], ["5–15s", 5e3, 15e3], ["15–60s", 15e3, 6e4], ["1–3m", 6e4, 18e4], ["3–10m", 18e4, 6e5], ["10m+", 6e5, 1e18]].map(([k, a, b]) => ({ k, v: V.leaves.filter(l => (l.data.activeMs || 0) >= a && (l.data.activeMs || 0) < b).length }));
  // funnel
  const bySess = new Map(); e.concat(V.muts).forEach(x => { if (!x.sessionId) return; let a = bySess.get(x.sessionId); if (!a) bySess.set(x.sessionId, a = []); a.push(x); });
  let pool = [...bySess.values()]; const fs = FUNNEL.map(([n, f]) => { pool = pool.filter(f); return { n, v: pool.length }; });

  let h = '<div class="grid">' +
    card("Funnel (heuristic)", "Sessions that reached each step in order — inferred from clicks/pages/DB writes, tune FUNNEL in ai.html", '<div class="funnel">' + fs.map((s, i) => `<div class="fstep"><span>${esc(s.n)}</span><span class="t"><i style="width:${fs[0].v ? (100 * s.v / fs[0].v).toFixed(1) : 0}%"></i></span><span class="v">${N(s.v)} · ${pct(s.v, fs[0].v)}${i ? " (" + pct(s.v, fs[i - 1].v) + " of prev)" : ""}</span></div>`).join("") + "</div>", "c12") + "</div>";
  h += '<div class="grid">' + card("Page performance", "Click a header to sort · load = time to load event · active = non-idle time before leaving", table([
    { h: "Page", v: r => r.k }, { h: "Views", num: 1, v: r => r.views }, { h: "Sessions", num: 1, v: r => r.sess.size }, { h: "Clicks", num: 1, v: r => r.clicks },
    { h: "Avg active", num: 1, v: r => dur(avg(r.act)), sv: r => avg(r.act) }, { h: "Avg scroll", num: 1, v: r => r.scr.length ? Math.round(avg(r.scr)) + "%" : "–", sv: r => avg(r.scr) },
    { h: "Load p50", num: 1, v: r => r.load.length ? Math.round(pctile(r.load, .5)) + "ms" : "–", sv: r => pctile(r.load, .5) }, { h: "Errors", num: 1, v: r => r.errors }
  ], prow, { sort: 1 }), "c12") + "</div>";
  h += '<div class="grid">' +
    card("Most clicked elements", "page › element", barList(clickRows, { n: 12 }), "c6") +
    card("File downloads & external links", "Clicks that leave or fetch a file", (dl.length ? "<b>Downloads</b>" + barList(dl, { n: 6 }) : "") + (ext.length ? '<div style="height:12px"></div><b>External hosts</b>' + barList(ext, { n: 6 }) : "") || empty("No download / external clicks recorded."), "c6") + "</div>";
  h += '<div class="grid">' +
    card("Scroll depth reached", "Number of scroll milestones hit", cv("b-scr", "short"), "c4") +
    card("Active time per page visit", "Distribution of engaged time", cv("b-dwell", "short"), "c4") +
    card("What people search for", "Final text typed in search boxes", barList(searches, { n: 10 }), "c4") + "</div>";
  h += '<div class="grid">' +
    card("Forms", "Submissions and validity", forms.size ? table([{ h: "Form", v: r => r.k }, { h: "Submits", num: 1, v: r => r.n }, { h: "Valid", num: 1, v: r => pct(r.ok, r.n), sv: r => r.ok / r.n }], [...forms.values()], { sort: 1, h: 260 }) : empty("No form submissions."), "c4") +
    card("Messages shown to users", "Toasts / alerts (often reveal friction)", barList(toasts, { n: 8 }), "c4") +
    card("Media played", "Audio / video 'play' events", barList(media, { n: 8 }), "c4") + "</div>";
  h += '<div class="grid">' + card("Click heatmap", "Where people click on a page (position as % of the viewport)", heatmapUI(), "c12") + "</div>";

  mkChart("b-scr", { type: "bar", data: { labels: sd.map(s => s.k + "%"), datasets: [{ data: sd.map(s => s.v), backgroundColor: PAL[0], borderRadius: 4 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
  mkChart("b-dwell", hbarCfg(dwell, PAL[2], 6));
  post.push(initHeatmap);
  return h;
}
function heatmapUI() {
  const pg = tally(V.clicks.filter(c => c.data && c.data.xPct != null), pageLabel);
  if (!pg.length) return empty("No click coordinates recorded yet.");
  return `<div class="toolbar"><select class="select" id="hm-page">${pg.map(p => `<option value="${esc(p.k)}">${esc(p.k)} (${p.v})</option>`).join("")}</select><span class="faint" id="hm-n"></span></div><canvas class="hm" id="hm" width="900" height="520"></canvas>`;
}
function initHeatmap() {
  const sel = $("#hm-page"); if (!sel) return;
  const draw = () => {
    const cvs = $("#hm"), ctx = cvs.getContext("2d"), w = cvs.width, hgt = cvs.height;
    const pts = V.clicks.filter(c => pageLabel(c) === sel.value && c.data && c.data.xPct != null);
    $("#hm-n").textContent = N(pts.length) + " clicks";
    const off = document.createElement("canvas"); off.width = w; off.height = hgt; const o = off.getContext("2d");
    for (const p of pts) { const x = p.data.xPct / 100 * w, y = p.data.yPct / 100 * hgt, g = o.createRadialGradient(x, y, 0, x, y, 22); g.addColorStop(0, "rgba(0,0,0,.14)"); g.addColorStop(1, "rgba(0,0,0,0)"); o.fillStyle = g; o.beginPath(); o.arc(x, y, 22, 0, 7); o.fill(); }
    const img = o.getImageData(0, 0, w, hgt), px = img.data, ramp = document.createElement("canvas"); ramp.width = 256; ramp.height = 1;
    const rc = ramp.getContext("2d"), lg = rc.createLinearGradient(0, 0, 256, 0); [[0, "#3b6ea5"], [.4, "#2a9aa0"], [.65, "#e0a94a"], [1, "#c1443a"]].forEach(s => lg.addColorStop(s[0], s[1])); rc.fillStyle = lg; rc.fillRect(0, 0, 256, 1);
    const pal = rc.getImageData(0, 0, 256, 1).data;
    for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (a) { const k = Math.min(255, a * 3) * 4; px[i] = pal[k]; px[i + 1] = pal[k + 1]; px[i + 2] = pal[k + 2]; px[i + 3] = Math.min(235, a * 3 + 25); } }
    ctx.clearRect(0, 0, w, hgt); ctx.fillStyle = css("--sunken"); ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = css("--border"); ctx.lineWidth = 1; for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, hgt); ctx.moveTo(0, i * hgt / 10); ctx.lineTo(w, i * hgt / 10); ctx.stroke(); }
    ctx.putImageData(img, 0, 0);
    // putImageData ignores compositing; redraw grid underneath
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = hgt; tmp.getContext("2d").putImageData(img, 0, 0);
    ctx.clearRect(0, 0, w, hgt); ctx.fillStyle = css("--sunken"); ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = css("--border"); for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, hgt); ctx.moveTo(0, i * hgt / 10); ctx.lineTo(w, i * hgt / 10); ctx.stroke(); }
    ctx.drawImage(tmp, 0, 0);
  };
  sel.onchange = draw; draw();
}

/* =====================================================================
   TAB: Database usage  (replaces the old Users tab)
   Firestore (analytics store, project ingenioux-ai) is MEASURED with server-side
   count queries; storage is an ESTIMATE (docs x average document size).
   Tracked-site Realtime DB activity comes from the ai_db_mutations / ai_db_reads logs.
===================================================================== */
const LIM = { reads: 50000, writes: 20000, deletes: 20000, storage: 1024 ** 3, egress: 10 * 1024 ** 3 };   // Firebase free (Spark) plan
const RT_LIM = { storage: 1e9, download: 10e9, conns: 100 };                                                  // Realtime DB free plan
const COL_LABEL = { events: "ai_events", sessions: "ai_sessions", muts: "ai_db_mutations", reads: "ai_db_reads" };

/* Firestore free quotas reset at midnight Pacific Time */
const ptDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(t);
function ptStart() {
  const [y, m, d] = ptDay().split("-").map(Number), guess = Date.UTC(y, m - 1, d, 8);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(guess).map(x => [x.type, +x.value]));
  const off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;      // negative (-7h / -8h)
  return Date.UTC(y, m - 1, d) - off;
}
function readsToday() { try { return (JSON.parse(lget("IX_AI_RD") || "{}"))[ptDay()] || 0; } catch (e) { return 0; } }
function addReads(n) {
  try { const o = JSON.parse(lget("IX_AI_RD") || "{}"), k = ptDay(); o[k] = (o[k] || 0) + n; const keep = Object.keys(o).sort().slice(-14), r = {}; keep.forEach(x => r[x] = o[x]); lset("IX_AI_RD", JSON.stringify(r)); } catch (e) { }
}
function fmtB(b) { b = Math.max(0, b || 0); if (b < 1024) return Math.round(b) + " B"; const u = ["KB", "MB", "GB", "TB"]; let i = -1; do { b /= 1024; i++; } while (b >= 1024 && i < 3); return b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2) + " " + u[i]; }
const docBytes = x => { const o = {}; for (const k in x) if (!/^_/.test(k)) o[k] = x[k]; try { return JSON.stringify(o).length + 40; } catch (e) { return 400; } };
const bytesOf = x => { if (typeof x.bytes === "number") return x.bytes; if (typeof x.size === "number") return x.size; const p = x.payload ?? x.value ?? x.data; if (p == null) return 0; try { return JSON.stringify(p).length; } catch (e) { return 0; } };

let UG = null, ugBusy = false;   // measured Firestore numbers
async function measureUsage() {
  if (ugBusy) return; ugBusy = true;
  const start = ptStart(), out = { at: Date.now(), start, tot: {}, today: {}, err: null }; let cost = 0;
  try {
    await Promise.all(Object.entries(COLS).map(async ([k, name]) => {
      const [t, d] = await Promise.all([getCountFromServer(collection(db, name)), getCountFromServer(query(collection(db, name), where("clientTs", ">=", start)))]);
      out.tot[k] = t.data().count; out.today[k] = d.data().count; cost += Math.max(1, Math.ceil(out.tot[k] / 1000)) + Math.max(1, Math.ceil(out.today[k] / 1000));
    }));
  } catch (e) { out.err = e; }
  addReads(cost); D.readsUsed += cost; UG = out; ugBusy = false;
  if (cur === "usage") render();
}
function avgDoc() {
  let saved = {}; try { saved = JSON.parse(lget("IX_AI_AVG") || "{}"); } catch (e) { }
  const o = {};
  for (const k of Object.keys(COLS)) { const a = D[k].slice(0, 400); if (a.length >= 5) { o[k] = sum(a.map(docBytes)) / a.length; saved[k] = o[k]; } else o[k] = saved[k] || { events: 900, sessions: 1500, muts: 700, reads: 450 }[k]; }
  lset("IX_AI_AVG", JSON.stringify(saved)); return o;
}
const tone = f => f >= .85 ? "var(--danger)" : f >= .6 ? "var(--amber)" : "var(--accent)";
function meter(label, used, limit, fmt, extra) {
  const f = limit ? used / limit : 0, left = Math.max(0, limit - used);
  return `<div class="meter"><div class="mt"><b>${esc(label)}</b><span class="mono">${fmt(used)} / ${fmt(limit)} · <b style="color:${tone(f)}">${(f * 100).toFixed(f < .1 ? 2 : 1)}%</b></span></div>
    <div class="mb2"><i style="width:${Math.min(100, f * 100).toFixed(2)}%;background:${tone(f)}"></i></div>
    <div class="ms"><span>${fmt(left)} left</span><span>${extra || ""}</span></div></div>`;
}
function resetIn() { const n = ptStart() + 864e5 - Date.now(); return Math.floor(n / 36e5) + "h " + Math.floor(n % 36e5 / 6e4) + "m"; }

function tabUsage() {
  const idx = +(lget("IX_AI_IDX") || 2), avgs = avgDoc(), start = ptStart();
  if (!UG && !ugBusy) post.push(measureUsage);
  post.push(() => {
    const b = $("#ug-refresh"); if (b) b.onclick = measureUsage;
    const s = $("#ug-idx"); if (s) s.onchange = () => { lset("IX_AI_IDX", s.value); render(); };
  });
  const elapsed = Math.max(.02, (Date.now() - start) / 864e5);
  let h = `<div class="toolbar"><h3 style="flex:1;margin:0">Usage</h3>
    <span class="pill">${UG ? "measured " + new Date(UG.at).toLocaleTimeString() : ugBusy ? "measuring…" : "not measured"}</span>
    <label class="chk" title="Firestore stores index entries on top of the document data. 2× is typical for event-style documents.">index overhead <select class="select" id="ug-idx">${[1, 1.5, 2, 3].map(v => `<option value="${v}"${v === idx ? " selected" : ""}>×${v}</option>`).join("")}</select></label>
    <button class="btn ghost sm" id="ug-refresh"${ugBusy ? " disabled" : ""}>↻ Measure now</button></div>`;
  if (UG && UG.err) h += `<div class="banner">Could not measure Firestore: ${esc(UG.err.code || "")} ${esc(UG.err.message || "")}</div>`;

  /* ---------- Firestore ---------- */
  h += '<div class="sec">Cloud Firestore · analytics store (ingenioux-ai)</div>';
  const keys = Object.keys(COLS);
  if (UG && !UG.err) {
    const wToday = sum(keys.map(k => UG.today[k])), docs = sum(keys.map(k => UG.tot[k])), rawB = sum(keys.map(k => UG.tot[k] * avgs[k])), used = rawB * idx;
    const rToday = readsToday(), dayKeys = [...new Set(D.events.concat(D.sessions, D.muts, D.reads).map(e => ptDay(e._ts)))].sort();
    const perDay = dayKeys.map(d => ({ d, n: 0, b: 0 })), di = new Map(perDay.map(x => [x.d, x]));
    for (const k of keys) for (const e of D[k]) { const r = di.get(ptDay(e._ts)); if (r) { r.n++; r.b += avgs[k] * idx; } }
    const full = perDay.filter(x => x.d !== ptDay()), growth = full.length ? avg(full.slice(-7).map(x => x.b)) : 0, runway = growth ? (LIM.storage - used) / growth : 0;
    const proj = Math.round(wToday / elapsed);
    h += '<div class="grid">' +
      kpi("Writes today", N(wToday), `of ${N(LIM.writes)} free · ${N(Math.max(0, LIM.writes - wToday))} left`, "", "Documents created since midnight Pacific. 1 document = 1 write.") +
      kpi("Reads today (this browser)", N(rToday), `of ${N(LIM.reads)} free · ${N(Math.max(0, LIM.reads - rToday))} left`, "", "Reads made by this dashboard in this browser today. Other devices are not included.") +
      kpi("Space used (est.)", fmtB(used), `${fmtB(Math.max(0, LIM.storage - used))} left of 1 GiB`, "", "Documents × average size × index overhead") +
      kpi("Documents stored", C(docs), `${fmtB(rawB)} raw data`, "") + "</div>";
    h += '<div class="grid">' + card("Free-tier meters", "Used vs. daily / total allowance", 
      meter("Writes today", wToday, LIM.writes, N, `pace → ~${N(proj)} by midnight PT`) +
      meter("Reads today (this browser)", rToday, LIM.reads, N, "resets in " + resetIn()) +
      meter("Storage (estimated)", used, LIM.storage, fmtB, runway > 0 && isFinite(runway) ? `≈ ${runway > 3650 ? "10+ years" : runway >= 1 ? Math.floor(runway) + " days" : "<1 day"} of room at recent pace` : "") +
      `<div class="hint">Deletes: ${N(LIM.deletes)}/day allowed — the analytics store only creates documents, so this stays at 0. Egress allowance: ${fmtB(LIM.egress)}/month (not measurable from the browser).</div>`, "c6") +
      card("Space by collection", "Estimated, including index overhead", cv("ug-sp", "short"), "c6") + "</div>";
    const hrs = Array(24).fill(0); for (const k of keys) for (const e of D[k]) if (e._ts >= start) hrs[Math.min(23, Math.floor((e._ts - start) / 36e5))]++;
    const nowH = Math.min(23, Math.floor((Date.now() - start) / 36e5));
    h += '<div class="grid">' + card("Writes by hour — today (Pacific day)", D.truncated.events ? "Loaded docs only (cap reached — raise “≤ docs”)" : "Documents created per hour", cv("ug-hr", "short"), "c6") +
      card("Daily writes — recent days", `Dashed line = ${N(LIM.writes)}/day free limit`, cv("ug-day", "short"), "c6") + "</div>";
    h += '<div class="grid">' + card("Per collection", "Totals measured on the server; sizes estimated from loaded samples", table([
      { h: "Collection", v: r => r.name }, { h: "Documents", num: 1, v: r => N(r.tot), sv: r => r.tot }, { h: "Written today", num: 1, v: r => N(r.today), sv: r => r.today },
      { h: "Avg doc", num: 1, v: r => fmtB(r.avg), sv: r => r.avg }, { h: "Raw size", num: 1, v: r => fmtB(r.raw), sv: r => r.raw }, { h: "Est. with indexes", num: 1, v: r => fmtB(r.raw * idx), sv: r => r.raw },
      { h: "Share of free 1 GiB", num: 1, v: r => pct(r.raw * idx, LIM.storage, 2), sv: r => r.raw }
    ], keys.map(k => ({ name: COL_LABEL[k], tot: UG.tot[k], today: UG.today[k], avg: avgs[k], raw: UG.tot[k] * avgs[k] })), { sort: 1, h: 260 }), "c12") + "</div>";
    mkChart("ug-sp", doughCfg(keys.map(k => ({ k: COL_LABEL[k], v: Math.round(UG.tot[k] * avgs[k] * idx) })).sort((a, b) => b.v - a.v), 6));
    mkChart("ug-hr", { type: "bar", data: { labels: hrs.map((_, i) => String(i).padStart(2, "0") + ":00"), datasets: [{ data: hrs, backgroundColor: hrs.map((_, i) => i === nowH ? PAL[1] : PAL[0]), borderRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } } } } });
    const lastDays = perDay.slice(-14);
    mkChart("ug-day", { type: "bar", data: { labels: lastDays.map(x => x.d.slice(5)), datasets: [{ label: "Writes", data: lastDays.map(x => x.n), backgroundColor: PAL[0], borderRadius: 3 }, { type: "line", label: "Free limit", data: lastDays.map(() => LIM.writes), borderColor: PAL[3], borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 }] }, options: { plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
  } else if (!UG || ugBusy) h += card("Measuring…", "Counting documents in the four analytics collections", empty("Please wait a moment."), "c12");

  /* ---------- tracked site's Realtime DB ---------- */
  const t0 = new Date().setHours(0, 0, 0, 0), mT = D.muts.filter(x => x._ts >= t0), rT = D.reads.filter(x => x._ts >= t0);
  const wb = sum(mT.map(bytesOf)), allWb = sum(D.muts.map(bytesOf)), delT = mT.filter(x => x.deleted || x.op === "remove").length;
  h += '<div class="sec">Realtime Database · your site (from datalake logs)</div>';
  if (!D.muts.length && !D.reads.length) {
    h += card("No Realtime-Database logs loaded", "", empty($("#f-db").checked ? "Nothing logged in the selected time range." : "“DB logs” is switched off — tick it in the toolbar and reload."), "c12");
  } else {
    const du = "d", sw = seriesOf(D.muts, du), sr = seriesOf(D.reads, du), nL = Math.max(sw.labels.length, sr.labels.length);
    h += '<div class="grid">' +
      kpi("Writes today", N(mT.length), `${N(delT)} deletes · ${N(tally(mT, x => x.path).length)} paths`, spark(sw.vals), "Since local midnight") +
      kpi("Reads / listens today", N(rT.length), `${N(tally(rT, x => x.path).length)} paths`, spark(sr.vals), "Since local midnight") +
      kpi("Data written today", wb ? fmtB(wb) : "not logged", wb ? `${fmtB(allWb)} in selected range` : "datalake.js doesn’t log payload size", "", "Sum of logged payload sizes") +
      kpi("Write : read today", rT.length ? (mT.length / rT.length).toFixed(2) : "–", "ratio") + "</div>";
    h += '<div class="grid">' + card("Realtime DB free allowance", "Your site’s database (Spark plan)",
      `<div class="stat-line"><span>Stored</span><b>1 GB free</b></div><div class="stat-line"><span>Downloaded</span><b>10 GB / month free</b></div><div class="stat-line"><span>Simultaneous connections</span><b>100</b></div>
       <div class="hint">Realtime DB meters stored size and download bandwidth on Google’s side only — see Firebase Console → Realtime Database → Usage. The logs here give operation counts${allWb ? " and an upper bound on bytes written" : ""}.</div>`, "c4") +
      card("Reads vs writes — daily", "Within the loaded time range", cv("ug-rt", "short"), "c8") + "</div>";
    h += '<div class="grid">' + card("Hottest write paths today", "Ids collapsed to *", barList(tally(mT, x => pathGroup(x.path)), { n: 10 }), "c6") + card("Hottest read paths today", "What pages load", barList(tally(rT, x => pathGroup(x.path)), { n: 10 }), "c6") + "</div>";
    mkChart("ug-rt", lineCfg(sw.labels.length >= sr.labels.length ? sw.labels : sr.labels, [{ label: "Writes", data: padTo(sw.vals, nL) }, { label: "Reads", data: padTo(sr.vals, nL), color: PAL[2] }], { bar: true }));
  }
  return h;
}
function timeline(list, showDate) {
  if (!list.length) return empty("No events.");
  return '<div class="tl">' + list.map(e => `<div class="it ${esc(e.category || "")}"><span class="tm">${showDate ? fmtT(e._ts) : new Date(e._ts).toLocaleTimeString()}</span><span class="tag">${esc(e.type)}</span> ${esc(summ(e))}</div>`).join("") + "</div>";
}

/* =====================================================================
   TAB: Sessions
===================================================================== */
function tabSessions() {
  const ss = V.sessions; if (!ss.length) return noData();
  let h = '<div class="grid">' + card("Sessions", "Click a row to replay what happened, step by step", table([
    { h: "Started", v: r => fmtT(r.first), sv: r => r.first }, { h: "User", v: r => r.name || emailOf(r.user) || "anonymous" }, { h: "Landing", v: r => r.landing || "–" },
    { h: "Duration", num: 1, v: r => dur(r.dur), sv: r => r.dur }, { h: "Active", num: 1, v: r => dur(r.active), sv: r => r.active }, { h: "Pages", num: 1, v: r => r.pv }, { h: "Clicks", num: 1, v: r => r.clicks },
    { h: "Writes", num: 1, v: r => r.writes }, { h: "Errors", num: 1, v: r => r.errors }, { h: "Device", v: r => r.ua.device + " · " + r.ua.os }, { h: "Source", v: r => r.ref }
  ], ss, { sort: 0, h: 600, onRow: showSession, n: 300 }), "c12") + "</div>";
  return h;
}
function showSession(s) {
  const ev = V.events.filter(e => e.sessionId === s.id).concat(V.muts.filter(m => m.sessionId === s.id)).sort((a, b) => a._ts - b._ts);
  const d = s.doc && s.doc.device || {};
  const html = `<div class="grid" style="margin:0 0 12px"><div class="c6"><div class="stat-line"><span>User</span><b>${esc(s.name || emailOf(s.user) || "anonymous")}</b></div><div class="stat-line"><span>Started</span><b>${fmtT(s.first)}</b></div><div class="stat-line"><span>Duration</span><b>${dur(s.dur)}</b></div><div class="stat-line"><span>Source</span><b>${esc(s.ref)}</b></div></div>
    <div class="c6"><div class="stat-line"><span>Device</span><b>${esc(s.ua.device)} · ${esc(s.ua.os)} · ${esc(s.ua.browser)}</b></div><div class="stat-line"><span>Screen</span><b>${d.screen ? d.screen.w + "×" + d.screen.h : "–"}</b></div><div class="stat-line"><span>Language / TZ</span><b>${esc((d.language || "–") + " · " + (d.timezone || "–"))}</b></div><div class="stat-line"><span>Visit #</span><b>${s.doc ? s.doc.visitIndex : "–"}</b></div></div></div>
    <h3 style="margin:10px 0 8px">Timeline <span class="faint" style="font:12px var(--mono)">${N(ev.length)} items</span></h3>${timeline(ev.filter(e => e.type !== "page_heartbeat" && e.type !== "local_state").slice(0, 400), false)}`;
  openModal("Session " + s.id.slice(0, 8), html);
}

/* =====================================================================
   TAB: AI  (ask questions about your data)
   "Training" is automatic: every time data loads, a fresh digest of the database is
   built (statsFor/buildDigest) and handed to the model as context. No manual step.
   - With an Anthropic API key (stored only in THIS browser) -> Claude answers any question.
   - Without a key -> a built-in engine answers common questions (visitors, pages, devices...).
===================================================================== */
const AI = { chat: [], busy: false };
const PROVS = {
  anthropic: { name: "Claude (Anthropic)", model: "claude-sonnet-5-5" },
  openai: { name: "OpenAI", model: "gpt-4o-mini", base: "https://api.openai.com/v1" },
  gemini: { name: "Google Gemini", model: "gemini-3.8-flash" },
  groq: { name: "Groq", model: "llama-3.3-70b-versatile", base: "https://api.groq.com/openai/v1" },
  openrouter: { name: "OpenRouter", model: "openrouter/auto", base: "https://openrouter.ai/api/v1" },
  custom: { name: "Custom (OpenAI-compatible)", model: "" }
};
function aiCfg() {
  if (AIC) return AIC;
  try { const c = JSON.parse(lget("IX_AI_CFG") || "null"); if (c && PROVS[c.prov]) return c; } catch (e) { }
  return { prov: "anthropic", key: lget("IX_AI_KEY") || "", model: lget("IX_AI_MODEL") || "", url: "" };   // old saved Claude key keeps working
}
const aiSave = c => {
  AIC = c;
  if (sget("IX_AI_EK")) pushAiCfg().catch(e => { const m = document.getElementById("s-aimsg"); if (m) { m.textContent = "Could not save to the cloud: " + (e.message || e); m.className = "msg err"; } });
  else lset("IX_AI_CFG", JSON.stringify(c));      // no unlock key in this tab (old session): fall back to this browser only
};
const aiKey = () => aiCfg().key || "";
const aiModel = () => { const c = aiCfg(); return c.model || PROVS[c.prov].model; };
const aiName = () => PROVS[aiCfg().prov].name;
async function aiModels() {
  const c = aiCfg(), P = c.prov; if (!c.key) return [];
  let url, headers = {};
  if (P === "anthropic") { url = "https://api.anthropic.com/v1/models?limit=100"; headers = { "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }; }
  else if (P === "gemini") { url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200"; headers = { "x-goog-api-key": c.key }; }
  else { const base = P === "custom" ? (c.url || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "") : PROVS[P].base; if (!base) return []; url = base + "/models"; headers = { authorization: "Bearer " + c.key }; }
  const r = await fetch(url, { headers }); if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  if (P === "gemini") return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => String(m.name).replace(/^models\//, ""));
  return (j.data || []).map(m => m.id).filter(Boolean);
}
async function aiCall(system, msgs, maxTok) {
  const c = aiCfg(), model = aiModel(), P = c.prov; let url, headers = { "content-type": "application/json" }, body;
  if (P === "anthropic") {
    url = "https://api.anthropic.com/v1/messages"; Object.assign(headers, { "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
    body = { model, max_tokens: maxTok, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: msgs };
  } else if (P === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent"; headers["x-goog-api-key"] = c.key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTok } };
  } else {
    let base = P === "custom" ? (c.url || "").trim().replace(/\/+$/, "") : PROVS[P].base;
    if (!base) throw new Error("Add the base URL in Settings.");
    url = /\/chat\/completions$/.test(base) ? base : base + "/chat/completions"; headers.authorization = "Bearer " + c.key;
    body = { model, messages: [{ role: "system", content: system }].concat(msgs) }; body[P === "openai" ? "max_completion_tokens" : "max_tokens"] = maxTok;
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = j.error; throw new Error((e && (e.message || (typeof e === "string" ? e : ""))) || j.message || ("HTTP " + res.status)); }
  let t = "";
  if (P === "anthropic") t = (j.content || []).map(x => x.text || "").join("");
  else if (P === "gemini") t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(x => x.text || "").join("");
  else t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  return String(t).trim() || "(empty reply)";
}
const dayStr = t => new Date(t).toLocaleDateString("en-CA");
const topN = (rows, n = 8) => rows.slice(0, n).map(r => ({ name: String(r.k), count: r.v }));

function statsFor(a, b) {
  const inW = x => x._ts >= a && x._ts < b;
  const ev = D.events.filter(inW), sd = D.sessions.filter(x => { const t = x.startedAt || x._ts; return t >= a && t < b; });
  const vis = new Set(), ses = new Map();
  for (const e of ev) { if (e.visitorId) vis.add(e.visitorId); let s = ses.get(e.sessionId); if (!s) ses.set(e.sessionId, s = { f: e._ts, l: e._ts, pv: 0 }); s.f = Math.min(s.f, e._ts); s.l = Math.max(s.l, e._ts); if (e.type === "page_view") s.pv++; }
  for (const s of sd) { if (s.visitorId) vis.add(s.visitorId); if (!ses.has(s.sessionId)) ses.set(s.sessionId, { f: s.startedAt || s._ts, l: s._ts, pv: 0 }); }
  const pv = ev.filter(e => e.type === "page_view"), cl = ev.filter(e => e.type === "click"), er = ev.filter(e => e.category === "error");
  const sl = [...ses.values()], withPv = sl.filter(x => x.pv > 0), m = D.muts.filter(inW), r = D.reads.filter(inW);
  return {
    unique_visitors: vis.size, sessions: ses.size, page_views: pv.length, clicks: cl.length, errors: er.length, total_events: ev.length,
    signed_in_users: new Set(ev.filter(e => e.userKey).map(e => e.userKey)).size,
    returning_visitors: sd.filter(x => x.visitIndex > 1).length,
    avg_session_seconds: Math.round(avg(sl.map(x => x.l - x.f)) / 1000),
    bounce_rate_percent: withPv.length ? Math.round(100 * withPv.filter(x => x.pv <= 1).length / withPv.length) : null,
    top_pages: topN(tally(pv, pageLabel), 10), top_clicked: topN(tally(cl, e => clickLabel(e.data)), 8),
    devices: topN(tally(sd, x => parseUA(x.device && x.device.userAgent).device), 5), operating_systems: topN(tally(sd, x => parseUA(x.device && x.device.userAgent).os), 6),
    browsers: topN(tally(sd, x => parseUA(x.device && x.device.userAgent).browser), 6), traffic_sources: topN(tally(sd, x => refHost(x)), 8),
    realtime_db_writes: m.length, realtime_db_reads: r.length, top_db_write_paths: topN(tally(m, x => pathGroup(x.path)), 6)
  };
}
function buildDigest() {
  const now = Date.now(), d0 = new Date().setHours(0, 0, 0, 0), tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const daily = []; for (let i = 13; i >= 0; i--) { const a = d0 - i * 864e5, st = statsFor(a, a + 864e5); daily.push({ date: dayStr(a), visitors: st.unique_visitors, sessions: st.sessions, page_views: st.page_views, errors: st.errors, db_writes: st.realtime_db_writes }); }
  const hourly = []; for (let h = 0; h <= new Date().getHours(); h++) { const a = d0 + h * 36e5, st = statsFor(a, a + 36e5); hourly.push({ hour: h, visitors: st.unique_visitors, page_views: st.page_views }); }
  const errs = new Map(); for (const e of D.events) if (e.category === "error" && e._ts >= now - 7 * 864e5) { const k = (e.data && (e.data.message || e.data.src)) || e.type; errs.set(k, (errs.get(k) || 0) + 1); }
  const [from, to] = D.range, ts = D.events.map(e => e._ts).filter(Boolean);
  const dg = {
    site: "INGENIOUX (ingenioux.in)", now_local: new Date().toString(), timezone: tz, today_date: dayStr(now),
    data_coverage: { loaded_events: D.events.length, loaded_sessions: D.sessions.length, loaded_db_writes: D.muts.length, loaded_db_reads: D.reads.length, earliest_event: ts.length ? new Date(Math.min(...ts)).toString() : null, range_requested_from: from ? new Date(from).toString() : "all time", truncated_by_doc_cap: D.truncated, note: "Anything older than earliest_event is NOT in this data." },
    today: statsFor(d0, now + 1), yesterday: statsFor(d0 - 864e5, d0), last_7_days: statsFor(now - 7 * 864e5, now + 1), last_30_days_within_loaded_data: statsFor(now - 30 * 864e5, now + 1), all_loaded_data: statsFor(0, now + 1),
    daily_last_14_days: daily, hourly_today: hourly,
    top_errors_7d: [...errs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ message: trunc(k, 120), count: v })),
    recent_activity: D.events.slice().sort((a, b) => b._ts - a._ts).slice(0, 15).map(e => ({ time: new Date(e._ts).toLocaleTimeString(), what: trunc(summ(e), 100), page: pageLabel(e) }))
  };
  if (UG && !UG.err) dg.firestore_free_tier = { writes_today: sum(Object.keys(COLS).map(k => UG.today[k])), writes_limit_per_day: LIM.writes, reads_today_this_browser: readsToday(), reads_limit_per_day: LIM.reads, documents_total: sum(Object.keys(COLS).map(k => UG.tot[k])), storage_limit_bytes: LIM.storage };
  return dg;
}
const AI_SYS = dg => `You are the built-in analytics assistant of the INGENIOUX AI Data Lab dashboard. The site owner asks questions about their website's visitor and database data. Answer ONLY from the DATA below (JSON, freshly built from their database a moment ago). Rules: quote exact numbers; say which time window you used (today = local midnight to now); if a question needs data outside data_coverage, or something not present, say so plainly instead of guessing; never invent figures. Keep answers short and friendly, use short bullet lists when helpful, no markdown tables. "Visitors" = unique_visitors, "sessions" are separate visits.\n\nDATA:\n${JSON.stringify(dg)}`;

async function askClaude() {
  const msgs = AI.chat.filter(m => !m.err).slice(-12).map(m => ({ role: m.r === "user" ? "user" : "assistant", content: m.t }));
  return aiCall(AI_SYS(buildDigest()), msgs, 1024);
}

function localAnswer(q) {
  const t = q.toLowerCase(), now = Date.now(), d0 = new Date().setHours(0, 0, 0, 0);
  let w = [d0, now + 1, "today"];
  if (/yesterday/.test(t)) w = [d0 - 864e5, d0, "yesterday"];
  else if (/30 days|month/.test(t)) w = [now - 30 * 864e5, now + 1, "the last 30 days (within loaded data)"];
  else if (/7 days|seven days|week/.test(t)) w = [now - 7 * 864e5, now + 1, "the last 7 days"];
  else if (/all time|overall|ever|in total|so far/.test(t) && !/today/.test(t)) w = [0, now + 1, "all loaded data"];
  const s = statsFor(w[0], w[1]), L = w[2], list = a => a.length ? a.map(x => `- ${x.name}: ${N(x.count)}`).join("\n") : "- (nothing recorded)";
  if (!D.loadedAt) return "The data is still loading — try again in a few seconds.";
  if (/visitor|people|audience|who came/.test(t)) return `**${N(s.unique_visitors)} unique visitors** ${L} (${N(s.sessions)} sessions, ${N(s.returning_visitors)} returning).`;
  if (/session|visit/.test(t)) return `**${N(s.sessions)} sessions** ${L}, averaging ${dur(s.avg_session_seconds * 1000)}.`;
  if (/page.?view|views/.test(t) && !/top|most|popular/.test(t)) return `**${N(s.page_views)} page views** ${L}.`;
  if (/click/.test(t)) return `**${N(s.clicks)} clicks** ${L}. Most clicked:\n${list(s.top_clicked.slice(0, 5))}`;
  if (/error|bug|crash|broken/.test(t)) return `**${N(s.errors)} errors** ${L}.`;
  if (/bounce/.test(t)) return s.bounce_rate_percent == null ? `No page-view sessions ${L} yet.` : `Bounce rate ${L}: **${s.bounce_rate_percent}%** of sessions viewed only one page.`;
  if (/duration|how long|time spent|average session/.test(t)) return `Average session ${L}: **${dur(s.avg_session_seconds * 1000)}**.`;
  if (/device|mobile|desktop|tablet/.test(t)) return `Devices ${L}:\n${list(s.devices)}`;
  if (/browser/.test(t)) return `Browsers ${L}:\n${list(s.browsers)}`;
  if (/\bos\b|operating|android|windows|ios|mac/.test(t)) return `Operating systems ${L}:\n${list(s.operating_systems)}`;
  if (/source|referr|traffic|came from|where/.test(t)) return `Traffic sources ${L}:\n${list(s.traffic_sources)}`;
  if (/top|most|popular|page/.test(t)) return `Most viewed pages ${L}:\n${list(s.top_pages)}`;
  if (/quota|storage|space|limit|free tier|firestore/.test(t)) { const f = buildDigest().firestore_free_tier; return f ? `Firestore today: **${N(f.writes_today)} / ${N(f.writes_limit_per_day)}** writes, ${N(f.reads_today_this_browser)} / ${N(f.reads_limit_per_day)} reads (this browser). ${N(f.documents_total)} documents stored. Open the **Usage** tab for space left.` : "Open the **Usage** tab first so I can measure Firestore."; }
  if (/database|db|write|read/.test(t)) return `Realtime DB ${L}: **${N(s.realtime_db_writes)} writes**, **${N(s.realtime_db_reads)} reads**.\nTop write paths:\n${list(s.top_db_write_paths)}`;
  return null;
}

function md(t) {
  const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>").split("\n"); let out = "", ul = false;
  for (const l of lines) { const m = l.match(/^\s*[-*•]\s+(.*)/); if (m) { if (!ul) { out += "<ul>"; ul = true; } out += "<li>" + m[1] + "</li>"; } else { if (ul) { out += "</ul>"; ul = false; } if (l.trim()) out += "<p>" + l + "</p>"; } }
  return out + (ul ? "</ul>" : "");
}
function drawChat() {
  const box = document.getElementById("ai-msgs"); if (!box) return;
  box.innerHTML = (AI.chat.length ? AI.chat.map(m => `<div class="cm ${m.r}${m.err ? " err" : ""}"><div class="cb">${m.r === "user" ? "<p>" + esc(m.t) + "</p>" : md(m.t)}${m.via ? `<span class="via">${esc(m.via)}</span>` : ""}</div></div>`).join("") : `<div class="ai-hello"><div class="ai-orb">AI</div><h3>Ask anything about INGENIOUX</h3></div>`) +
    (AI.busy ? '<div class="cm ai"><div class="cb"><span class="dots"><i></i><i></i><i></i></span></div></div>' : "");
  box.scrollTop = box.scrollHeight;
  const b = document.getElementById("ai-send"); if (b) b.disabled = AI.busy;
  const c = document.getElementById("ai-clear"); if (c) c.disabled = AI.busy || !AI.chat.length;
}
const AI_HELLO = "Hi, I'm Ingenioux AI. What would you like to know about your website today?";
const AI_NODATA = "Hello, I'm Ingenioux AI.\nI couldn't find any data to answer from yet. Check that tracking is running on your site, widen the time range at the top, or press **Reload data** and ask me again.";
const AI_NOKEY = "Hello, I'm Ingenioux AI.\nI'm not connected to my full brain yet, so I can only answer simple questions like visitors, sessions, page views, top pages, devices, errors and database activity. Connect your API key in **Settings** and I'll answer anything about your data.";
const isGreeting = q => /^\s*(hi+|hello+|hey+|hola|namaste|yo|good (morning|afternoon|evening)|who are you|what are you|what can you do|help)\b[\s!?.]*$/i.test(q) || /^\s*(who|what) (are|r) (you|u)\b/i.test(q);
async function aiAsk(q) {
  q = (q || "").trim(); if (!q || AI.busy) return;
  AI.chat.push({ r: "user", t: q }); AI.busy = true; drawChat();
  const say = (t, o) => AI.chat.push(Object.assign({ r: "ai", t }, o));
  try {
    if (isGreeting(q)) say(AI_HELLO);
    else if (D.loadedAt && !D.events.length && !D.sessions.length && !D.muts.length) say(AI_NODATA);
    else if (aiKey()) {
      try { say(await askClaude(), { via: aiName() + " · " + aiModel() }); }
      catch (e) { say("Sorry, I couldn't reach the AI service just now (" + (e.message || e) + ")." + (localAnswer(q) ? "\n\nHere's what I can tell you from the data:\n" + localAnswer(q) : ""), { err: true }); }
    } else say(localAnswer(q) || AI_NOKEY);
  } catch (e) { say("Something went wrong: " + (e.message || e), { err: true }); }
  AI.busy = false; drawChat();
}
function tabAI() {
  post.push(() => {
    drawChat();
    const ta = $("#ai-q"), send = () => { const v = ta.value; ta.value = ""; ta.style.height = ""; aiAsk(v); };
    $("#ai-send").onclick = send;
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; };
    $("#ai-clear").onclick = () => { AI.chat = []; ta.value = ""; ta.style.height = ""; drawChat(); ta.focus(); };
    if (!AI.chat.length) ta.focus();
  });
  return `<div class="ai-wrap">
    <div class="ai-top"><div><b>AI assistant</b></div>
      <button class="btn ghost sm" id="ai-clear">Clear chat</button></div>
    <div id="ai-msgs" class="ai-msgs"></div>
    <div class="ai-box"><textarea id="ai-q" rows="1" placeholder="Ask about your visitors, pages, errors, database…"></textarea><button class="btn" id="ai-send">Send</button></div></div>`;
}
const padTo = (a, n) => a.length >= n ? a : a.concat(Array(n - a.length).fill(0));
const strip = x => { const o = {}; for (const k in x) if (!/^_/.test(k) || k === "_id" || k === "_c") o[k] = x[k]; return o; };

/* =====================================================================
   TAB: Devices & Performance
===================================================================== */
function tabDevices() {
  const sd = V.sdocs; if (!sd.length) return noData();
  const ua = sd.map(s => ({ s, u: parseUA(s.device && s.device.userAgent) }));
  const vpW = sd.map(s => s.device && s.device.viewport && s.device.viewport.w).filter(Boolean);
  const bp = tally(vpW, w => w < 480 ? "Phone <480" : w < 768 ? "Large phone 480–767" : w < 1024 ? "Tablet 768–1023" : w < 1440 ? "Laptop 1024–1439" : "Desktop 1440+");
  const res = tally(sd, s => s.device && s.device.screen ? s.device.screen.w + "×" + s.device.screen.h : null);
  const conn = tally(sd, s => s.device && s.device.connection && s.device.connection.type);
  const cores = tally(sd, s => s.device && s.device.cores).sort((a, b) => a.k - b.k);
  const mem = tally(sd, s => s.device && s.device.memoryGB).sort((a, b) => a.k - b.k);
  const dark = sd.filter(s => s.device && s.device.prefersDark).length, pwa = sd.filter(s => s.device && s.device.standalone).length, touch = sd.filter(s => s.device && s.device.touchPoints > 0).length;
  const perf = V.pv.map(p => p.data && p.data.perf).filter(p => p && p.loadMs > 0 && p.loadMs < 6e4);
  const ttfb = perf.map(p => p.ttfbMs).filter(x => x >= 0), load = perf.map(p => p.loadMs), dcl = perf.map(p => p.domContentLoadedMs).filter(x => x > 0);
  const api = V.by("api_call"), apiHost = new Map();
  api.forEach(a => { const d = a.data || {}; let o = apiHost.get(d.host); if (!o) apiHost.set(d.host, o = { k: d.host, n: 0, fail: 0, t: [] }); o.n++; if (d.error || d.ok === false) o.fail++; if (d.durationMs >= 0) o.t.push(d.durationMs); });
  const lenta = [{ k: "Fast <1s", a: 0, b: 1e3 }, { k: "OK 1–2.5s", a: 1e3, b: 2500 }, { k: "Slow 2.5–5s", a: 2500, b: 5e3 }, { k: "Very slow 5s+", a: 5e3, b: 1e9 }].map(x => ({ k: x.k, v: load.filter(l => l >= x.a && l < x.b).length }));
  let h = '<div class="grid">' +
    kpi("Mobile share", pct(ua.filter(x => x.u.device === "Mobile").length, ua.length), "of sessions") + kpi("Touch devices", pct(touch, sd.length), "") + kpi("Prefer dark mode", pct(dark, sd.length), "") + kpi("Installed (PWA)", pct(pwa, sd.length), "standalone display") + "</div>";
  h += '<div class="grid">' + card("Device type", "", cv("v-dev", "short"), "c4") + card("Operating system", "", cv("v-os", "short"), "c4") + card("Browser", "", cv("v-br", "short"), "c4") + "</div>";
  h += '<div class="grid">' + card("Screen size classes", "Viewport width at session start", barList(bp, { n: 6, share: true }), "c4") + card("Screen resolutions", "Top physical screens", barList(res, { n: 8 }), "c4") + card("Network quality", "effectiveType reported by the browser", barList(conn, { n: 6, share: true }), "c4") + "</div>";
  h += '<div class="grid">' +
    kpi("Median TTFB", ttfb.length ? Math.round(pctile(ttfb, .5)) + " ms" : "–", "p90 " + (ttfb.length ? Math.round(pctile(ttfb, .9)) + " ms" : "–")) + kpi("Median load", load.length ? Math.round(pctile(load, .5)) + " ms" : "–", "p90 " + (load.length ? Math.round(pctile(load, .9)) + " ms" : "–")) +
    kpi("Median DOM ready", dcl.length ? Math.round(pctile(dcl, .5)) + " ms" : "–", "p90 " + (dcl.length ? Math.round(pctile(dcl, .9)) + " ms" : "–")) + kpi("API calls", N(api.length), pct(api.filter(a => a.data && (a.data.error || a.data.ok === false)).length, api.length, 1) + " failed") + "</div>";
  h += '<div class="grid">' + card("Page load speed", "Share of page views by load time", cv("v-load", "short"), "c4") + card("CPU cores", "Device capability", cv("v-cores", "short"), "c4") + card("Memory (GB)", "navigator.deviceMemory", cv("v-mem", "short"), "c4") + "</div>";
  if (apiHost.size) h += '<div class="grid">' + card("API hosts", "fetch() calls made by pages", table([{ h: "Host", v: r => r.k }, { h: "Calls", num: 1, v: r => r.n }, { h: "Failed", num: 1, v: r => pct(r.fail, r.n, 1), sv: r => r.fail / r.n }, { h: "p50", num: 1, v: r => Math.round(pctile(r.t, .5)) + "ms", sv: r => pctile(r.t, .5) }, { h: "p90", num: 1, v: r => Math.round(pctile(r.t, .9)) + "ms", sv: r => pctile(r.t, .9) }], [...apiHost.values()], { sort: 1, h: 280 }), "c12") + "</div>";
  mkChart("v-dev", doughCfg(tally(ua, x => x.u.device), 5)); mkChart("v-os", doughCfg(tally(ua, x => x.u.os), 6)); mkChart("v-br", doughCfg(tally(ua, x => x.u.browser), 6));
  mkChart("v-load", hbarCfg(lenta, PAL[0], 4));
  const simpleBar = (rows, c) => ({ type: "bar", data: { labels: rows.map(r => r.k), datasets: [{ data: rows.map(r => r.v), backgroundColor: c, borderRadius: 4 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
  mkChart("v-cores", simpleBar(cores, PAL[2])); mkChart("v-mem", simpleBar(mem, PAL[4]));
  return h;
}

/* =====================================================================
   TAB: Errors & health
===================================================================== */
function tabErrors() {
  const er = V.errs; if (!V.events.length) return noData();
  const u = unitFor(), ts = seriesOf(er, u), g = new Map();
  er.forEach(x => { const d = x.data || {}; const k = x.type + "|" + (d.message || d.src || "?") + "|" + (d.file || "") + ":" + (d.line || ""); let o = g.get(k); if (!o) g.set(k, o = { type: x.type, msg: d.message || d.src || "?", loc: d.file ? d.file.split("/").pop() + ":" + d.line : "", n: 0, sess: new Set(), users: new Set(), last: 0, page: pageLabel(x), stack: d.stack || "" }); o.n++; o.sess.add(x.sessionId); if (x.userKey) o.users.add(x.userKey); o.last = Math.max(o.last, x._ts); });
  const rows = [...g.values()];
  const bad = tally(V.by("ui_toast").concat(V.by("ui_alert")).filter(x => /error|fail|invalid|wrong|denied|not found|unable|could not|couldn't/i.test((x.data && x.data.message) || "")), x => trunc(x.data.message, 90));
  const sessErr = V.sessions.filter(s => s.errors).length;
  const failApi = V.by("api_call").filter(a => a.data && (a.data.error || a.data.ok === false));
  let h = '<div class="grid">' + kpi("Errors", N(er.length), pct(er.length, V.events.length, 2) + " of events", spark(ts.vals)) + kpi("Affected sessions", pct(sessErr, V.sessions.length, 1), N(sessErr) + " sessions") +
    kpi("Distinct problems", N(rows.length), "unique message + location") + kpi("Failed API calls", N(failApi.length), "fetch errors / non-2xx") + "</div>";
  h += '<div class="grid">' + card("Errors over time", "", cv("e-ts", "short"), "c8") + card("By kind", "", cv("e-kind", "short"), "c4") + "</div>";
  h += '<div class="grid">' + card("Distinct problems", "Click for the stack trace", table([
    { h: "Kind", v: r => r.type }, { h: "Message", v: r => r.msg }, { h: "Where", v: r => r.loc || r.page }, { h: "Count", num: 1, v: r => r.n }, { h: "Sessions", num: 1, v: r => r.sess.size }, { h: "Users", num: 1, v: r => r.users.size }, { h: "Last", v: r => fmtT(r.last), sv: r => r.last }
  ], rows, { sort: 3, h: 380, onRow: r => openModal(r.type, `<div class="stat-line"><span>Message</span><b>${esc(r.msg)}</b></div><div class="stat-line"><span>Where</span><b>${esc(r.loc || r.page)}</b></div><pre class="json">${esc(r.stack || "(no stack recorded)")}</pre>`) }), "c12") + "</div>";
  h += '<div class="grid">' + card("User-facing error messages", "Toasts/alerts that look like failures", barList(bad, { n: 10 }), "c6") + card("Failed network calls", "Host · status", barList(tally(failApi, a => (a.data.host || "?") + " · " + (a.data.status || a.data.error || "error")), { n: 10 }), "c6") + "</div>";
  mkChart("e-ts", lineCfg(ts.labels, [{ label: "Errors", data: ts.vals, color: css("--danger") }], { bar: true })); mkChart("e-kind", doughCfg(tally(er, x => x.type), 5));
  return h;
}

/* =====================================================================
   TAB: Insights (auto-written findings)
===================================================================== */
function tabInsights() {
  if (!V.events.length) return noData();
  const I = [], add = (cls, t, d) => I.push(`<div class="ins ${cls}"><b>${esc(t)}</b><span>${esc(d)}</span></div>`);
  const S = V.sessions, e = V.events;
  const hod = Array(24).fill(0), dow = Array(7).fill(0); e.forEach(x => { const d = new Date(x._ts); hod[d.getHours()]++; dow[d.getDay()]++; });
  const DN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ph = hod.indexOf(Math.max(...hod)), pd = dow.indexOf(Math.max(...dow));
  add("", "Peak time", `Activity peaks around ${ph}:00–${ph + 1}:00 and ${DN[pd]}s are the busiest day (${pct(dow[pd], e.length)} of events). Schedule releases/notifications just before it.`);
  const topP = tally(V.pv, pageLabel); if (topP[0]) add("info", "Most visited page", `“${topP[0].k}” gets ${pct(topP[0].v, V.pv.length)} of page views (${N(topP[0].v)}).`);
  const bounce = S.filter(s => s.bounce).length / Math.max(1, S.length);
  add(bounce > .6 ? "warn" : "", "Bounce rate " + pct(bounce, 1), bounce > .6 ? "Most visits end after one page. Check landing pages with the highest exit and make the next step obvious." : "Most visitors go beyond the first page – healthy navigation.");
  const lp = tally(S.filter(s => s.bounce), s => s.landing)[0]; if (lp && bounce > .3) add("warn", "Highest-bounce landing page", `“${lp.k}” accounts for ${N(lp.v)} single-page sessions.`);
  const mob = V.sdocs.length ? V.sdocs.filter(s => parseUA(s.device && s.device.userAgent).device === "Mobile").length / V.sdocs.length : 0;
  if (V.sdocs.length) add("info", "Mobile first?", `${pct(mob, 1)} of sessions come from phones. ${mob > .5 ? "Design and test mobile layouts first." : "Desktop still dominates – keep both polished."}`);
  const ret = V.sdocs.length ? V.sdocs.filter(s => !s.isNewVisitor).length / V.sdocs.length : 0;
  if (V.sdocs.length) add(ret < .2 ? "warn" : "", "Retention signal", `${pct(ret, 1)} of sessions are from returning visitors. ${ret < .2 ? "Few people come back – reminders, notifications and fresh material may help." : "A good base of returning users."}`);
  const errRate = V.errs.length / Math.max(1, e.length); const worst = tally(V.errs, x => trunc((x.data && x.data.message) || x.type, 90))[0];
  if (V.errs.length) add(errRate > .01 ? "bad" : "warn", "Errors detected", `${N(V.errs.length)} error events (${(errRate * 100).toFixed(2)}%). Most common: “${worst ? worst.k : ""}” (${worst ? worst.v : 0}×). See the Errors tab.`); else add("", "No errors recorded", "No JavaScript or resource errors in this selection.");
  const sorted = V.leaves.filter(l => l.data && l.data.maxScrollPct != null); if (sorted.length > 5) { const sh = sorted.filter(l => l.data.maxScrollPct < 25).length / sorted.length; add(sh > .5 ? "warn" : "", "Scroll engagement", `${Math.round(sh * 100)}% of page visits never scroll past 25%. Median scroll depth is ${pctile(sorted.map(l => l.data.maxScrollPct), .5)}%.`); }
  const searches = new Map(); V.by("search_input").forEach(x => { const q = String((x.data && x.data.query) || "").trim().toLowerCase(); if (q.length >= 3) searches.set(q, (searches.get(q) || 0) + 1); }); const sq = [...searches.entries()].sort((a, b) => b[1] - a[1])[0];
  if (sq) add("info", "Search demand", `People search for “${sq[0]}” most. Make sure this content is easy to find without searching.`);
  const dl = V.clicks.filter(c => c.data && c.data.fileLink); if (dl.length) { const t = tally(dl, c => clickLabel(c.data))[0]; add("", "Downloads", `${N(dl.length)} file-download clicks; top: “${t.k}” (${t.v}).`); }
  const slow = V.pv.filter(p => p.data && p.data.perf && p.data.perf.loadMs > 5000); if (slow.length) add("warn", "Slow loads", `${N(slow.length)} page views took over 5 s to load; slowest page: “${tally(slow, pageLabel)[0].k}”.`);
  const half = V.minTs + (V.maxTs - V.minTs) / 2, a = e.filter(x => x._ts < half).length, b = e.length - a;
  if (a > 20) add(b > a * 1.15 ? "" : b < a * .85 ? "warn" : "info", "Trend", `Second half of the window has ${b > a ? "+" : ""}${pct(b - a, a)} ${b >= a ? "more" : "fewer"} events than the first half (${N(b)} vs ${N(a)}).`);
  const power = V.users.filter(u => u.sess.size >= 5).length; if (V.users.length) add("info", "Loyal users", `${N(power)} of ${N(V.users.length)} signed-in users had 5+ sessions in this window.`);
  const wr = tally(V.muts, m => m.domain)[0]; if (wr) add("info", "Busiest data domain", `“${wr.k}” receives ${pct(wr.v, V.muts.length)} of all database writes.`);
  const semT = tally(V.events.filter(x => x.page && x.page.semester), x => "Semester " + x.page.semester)[0]; if (semT) add("", "Most active semester area", `${semT.k} drives the most classroom activity (${N(semT.v)} events).`);
  const fn = FUNNEL.map(([n, f]) => n); // simple conversion hint
  const buy = V.muts.filter(m => /^(purchases|checkout|orders)/.test(m.path || "")).length; add("info", "Commerce writes", buy ? `${N(buy)} purchase/checkout writes were logged.` : "No purchase/checkout writes in this selection.");
  return `<div class="sec">Auto-generated findings · ${N(e.length)} events analysed</div><div class="insights">${I.join("")}</div>
  <div class="sec" style="margin-top:28px">Data quality</div><div class="card">
    <div class="stat-line"><span>Documents loaded (events / sessions / DB writes / DB reads)</span><b>${N(D.events.length)} / ${N(D.sessions.length)} / ${N(D.muts.length)} / ${N(D.reads.length)}</b></div>
    <div class="stat-line"><span>Truncated by the document limit</span><b>${Object.entries(D.truncated).filter(([, v]) => v).map(([k]) => k).join(", ") || "no"}</b></div>
    <div class="stat-line"><span>Firestore reads used by this page this visit</span><b>${N(D.readsUsed)}</b></div>
    <div class="stat-line"><span>Events without a signed-in user</span><b>${pct(e.filter(x => !x.userKey).length, e.length)}</b></div>
  </div>`;
}

/* =====================================================================
   TAB: Explorer (raw documents, search, export)
===================================================================== */
const EX = { col: "events", type: "", q: "", page: 0 };
function exList() {
  let list = D[EX.col] || []; list = list.filter(pass);
  if (EX.type) list = list.filter(x => x.type === EX.type);
  if (EX.q) { const q = EX.q.toLowerCase(); list = list.filter(x => JSON.stringify(x).toLowerCase().indexOf(q) >= 0); }
  return list;
}
function tabExplorer() {
  const base = (D[EX.col] || []).filter(pass), types = tally(base, x => x.type);
  const list = exList(), PG = 50, pages = Math.max(1, Math.ceil(list.length / PG)); EX.page = Math.min(EX.page, pages - 1);
  const rows = list.slice(EX.page * PG, EX.page * PG + PG);
  let h = `<div class="card"><div class="toolbar">
    <select class="select" id="x-col">${Object.entries(COLS).map(([k, v]) => `<option value="${k}" ${k === EX.col ? "selected" : ""}>${v} (${N((D[k] || []).length)})</option>`).join("")}</select>
    <select class="select" id="x-type"><option value="">All types</option>${types.map(t => `<option ${t.k === EX.type ? "selected" : ""} value="${esc(t.k)}">${esc(t.k)} (${t.v})</option>`).join("")}</select>
    <input class="input" id="x-q" type="search" placeholder="Search anything in the documents…" style="flex:1;min-width:180px" value="${esc(EX.q)}" />
    <span class="pill">${N(list.length)} matches</span>
    <button class="btn ghost sm" id="x-csv">⬇ CSV</button><button class="btn ghost sm" id="x-json">⬇ JSON</button></div>
    <div class="scroll" style="max-height:620px"><table class="t"><thead><tr><th>Time</th><th>Type</th><th>Page</th><th>User</th><th>Summary</th></tr></thead><tbody>
    ${rows.map((x, i) => `<tr class="click" data-i="${EX.page * PG + i}"><td class="mono">${fmtT(x._ts)}</td><td><span class="tag">${esc(x.type || x._c)}</span></td><td>${esc(pageLabel(x))}</td><td>${esc(emailOf(x.userKey) || "–")}</td><td>${esc(summ(x))}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No documents.</td></tr>`}
    </tbody></table></div>
    <div class="toolbar" style="margin:12px 0 0;justify-content:center"><button class="btn ghost sm" id="x-prev" ${EX.page ? "" : "disabled"}>← Prev</button><span class="dim">Page ${EX.page + 1} / ${pages}</span><button class="btn ghost sm" id="x-next" ${EX.page < pages - 1 ? "" : "disabled"}>Next →</button></div></div>`;
  post.push(() => {
    $("#x-col").onchange = e => { EX.col = e.target.value; EX.type = ""; EX.page = 0; render(); };
    $("#x-type").onchange = e => { EX.type = e.target.value; EX.page = 0; render(); };
    let tm; $("#x-q").oninput = e => { clearTimeout(tm); tm = setTimeout(() => { EX.q = e.target.value; EX.page = 0; render(); const q = $("#x-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 350); };
    $("#x-prev").onclick = () => { EX.page--; render(); }; $("#x-next").onclick = () => { EX.page++; render(); };
    $$("#view tbody tr[data-i]").forEach(tr => tr.onclick = () => { const x = list[+tr.dataset.i]; openModal((x.type || x._c) + " · " + fmtT(x._ts), `<pre class="json">${esc(JSON.stringify(strip(x), null, 2))}</pre>`); });
    $("#x-json").onclick = () => download(EX.col + "-" + Date.now() + ".json", JSON.stringify(list.map(strip), null, 1), "application/json");
    $("#x-csv").onclick = () => {
      const cols = ["_c", "_id", "type", "category", "iso", "sessionId", "visitorId", "userKey", "area", "semester", "page", "path", "op", "domain", "summary", "json"];
      const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const lines = [cols.join(",")].concat(list.map(x => [x._c, x._id, x.type, x.category, new Date(x._ts).toISOString(), x.sessionId, x.visitorId, x.userKey, x.page && x.page.area, x.page && x.page.semester, x.page && x.page.name, x.path, x.op, x.domain, summ(x), JSON.stringify(x.data || x.payload || "")].map(q).join(",")));
      download(EX.col + "-" + Date.now() + ".csv", lines.join("\n"), "text/csv");
    };
  });
  return h;
}

/* =====================================================================
   TAB: Live feed
===================================================================== */
let liveUnsub = null, livePaused = false;
function tabLive() {
  post.push(startLive);
  return `<div class="card"><div class="toolbar"><h3 style="flex:1">Live activity</h3><span class="pill" id="live-n">connecting…</span><button class="btn ghost sm" id="live-pause">Pause</button><button class="btn ghost sm" id="live-clear">Clear</button></div>
  <div class="sub">Newest documents arriving in ai_events right now (uses a real-time Firestore listener, 1 read per new event).</div><div id="live-list" style="max-height:640px;overflow:auto"></div></div>`;
}
function startLive() {
  stopLive(); const list = $("#live-list"); if (!list) return; let n = 0;
  $("#live-pause").onclick = e => { livePaused = !livePaused; e.target.textContent = livePaused ? "Resume" : "Pause"; };
  $("#live-clear").onclick = () => { list.innerHTML = ""; };
  try {
    liveUnsub = onSnapshot(query(collection(db, COLS.events), orderBy("clientTs", "desc"), limit(40)), snap => {
      $("#live-n") && ($("#live-n").textContent = "● live");
      if (livePaused) return;
      const adds = snap.docChanges().filter(c => c.type === "added").map(c => { const x = c.doc.data(); x._ts = tsOf(x); x._id = c.doc.id; x._c = COLS.events; return x; }).sort((a, b) => a._ts - b._ts);
      D.readsUsed += snap.docChanges().length; addReads(snap.docChanges().length);
      adds.forEach(x => { const row = document.createElement("div"); row.className = "live-row"; row.innerHTML = `<span class="mono faint">${new Date(x._ts).toLocaleTimeString()}</span><span><span class="tag ${x.category === "error" ? "r" : x.category === "navigation" ? "b" : x.category === "interaction" ? "a" : "g"}">${esc(x.type)}</span></span><span>${esc(pageLabel(x))} · ${esc(summ(x))}${x.userKey ? ' <span class="faint">— ' + esc(emailOf(x.userKey)) + "</span>" : ""}</span>`; list.insertBefore(row, list.firstChild); n++; });
      while (list.children.length > 300) list.removeChild(list.lastChild);
    }, err => { $("#live-n") && ($("#live-n").textContent = "error"); list.innerHTML = `<div class="banner">${esc(err.code || "")} ${esc(err.message || "")}</div>`; });
  } catch (e) { list.innerHTML = `<div class="banner">${esc(e.message)}</div>`; }
}
function stopLive() { if (liveUnsub) { try { liveUnsub(); } catch (e) { } liveUnsub = null; } }

/* =====================================================================
   TAB: Settings
===================================================================== */
function tabSettings() {
  post.push(() => {
    $("#s-save").onclick = async () => {
      const a = $("#s-new").value, b = $("#s-new2").value, m = $("#s-msg");
      m.className = "msg"; if (a.length < 6) { m.textContent = "Use at least 6 characters."; m.className = "msg err"; return; }
      if (a !== b) { m.textContent = "Passwords do not match."; m.className = "msg err"; return; }
      try { await savePassword(a); sset("IX_AI_OK", await tokenFor(accessDoc)); sset("IX_AI_EK", await deriveEk(a)); await pushAiCfg().catch(() => { }); m.textContent = "Password updated in Realtime Database (ai_config/access)."; m.className = "msg ok"; $("#s-new").value = $("#s-new2").value = ""; }
      catch (e) { m.textContent = e.message || String(e); m.className = "msg err"; }
    };
    const val = id => ($(id) ? $(id).value.trim() : "");
    if (aiKey()) aiModels().then(list => { const dl = $("#s-aimodels"); if (dl && list.length) dl.innerHTML = list.map(m => `<option value="${esc(m)}">`).join(""); }).catch(() => { });
    $("#s-aiprov").onchange = e => { const old = aiCfg(); const np = e.target.value; const keepModel = old.model && old.model !== PROVS[old.prov].model; aiSave({ prov: np, key: old.prov === np ? old.key : "", model: keepModel ? "" : "", url: old.url || "" }); render(); };
    $("#s-aisave").onclick = () => {
      const c = aiCfg(), m = $("#s-aimsg"), k = val("#s-aikey") || c.key;
      if (!k) { m.textContent = "Enter an API key."; m.className = "msg err"; return; }
      if (c.prov === "custom" && !val("#s-aiurl") && !c.url) { m.textContent = "Enter the base URL."; m.className = "msg err"; return; }
      if (c.prov === "custom" && !val("#s-aimodel") && !c.model) { m.textContent = "Enter a model name."; m.className = "msg err"; return; }
      aiSave({ prov: c.prov, key: k, model: val("#s-aimodel"), url: $("#s-aiurl") ? val("#s-aiurl") : c.url }); render();
    };
    const rm = $("#s-airm"); if (rm) rm.onclick = () => { const c = aiCfg(); aiSave({ prov: c.prov, key: "", model: c.model, url: c.url }); try { localStorage.removeItem("IX_AI_KEY"); } catch (e) { } render(); };
    const ts = $("#s-aitest"); if (ts) ts.onclick = async () => {
      const m = $("#s-aimsg"); m.textContent = "Testing…"; m.className = "msg";
      try { await aiCall("Reply with the single word: ok", [{ role: "user", content: "ping" }], 16); m.textContent = "Connected."; m.className = "msg ok"; }
      catch (e) { m.textContent = "Failed: " + (e.message || e); m.className = "msg err"; }
    };
  });
  const cfg = aiCfg(), aiOn = !!cfg.key;
  return `<div class="grid">
  <section class="card c6"><h3>Change password</h3>
    <div class="field"><label>New password</label><input id="s-new" class="input" type="password" autocomplete="new-password" /></div>
    <div class="field"><label>Confirm</label><input id="s-new2" class="input" type="password" autocomplete="new-password" /></div>
    <button class="btn" id="s-save">Update password</button><div class="msg" id="s-msg"></div></section>
  <section class="card c6"><h3>AI connection <span class="tag ${aiOn ? "g" : ""}" style="margin-left:6px">${aiOn ? "connected" : "not set"}</span></h3>
    <div class="field"><label>Provider</label><select class="select" id="s-aiprov" style="width:100%">${Object.entries(PROVS).map(([k, v]) => `<option value="${k}"${k === cfg.prov ? " selected" : ""}>${v.name}</option>`).join("")}</select></div>
    ${cfg.prov === "custom" ? `<div class="field"><label>Base URL</label><input id="s-aiurl" class="input" autocomplete="off" placeholder="https://api.example.com/v1" value="${esc(cfg.url || "")}"></div>` : ""}
    <div class="field"><label>API key</label><input id="s-aikey" class="input" type="password" autocomplete="off" placeholder="${aiOn ? "Saved — paste to replace" : "Paste your API key"}"></div>
    <div class="field"><label>Model</label><input id="s-aimodel" class="input" list="s-aimodels" autocomplete="off" placeholder="${esc(PROVS[cfg.prov].model || "model name")}" value="${esc(cfg.model || "")}"><datalist id="s-aimodels"></datalist></div>
    <div class="toolbar" style="margin:0"><button class="btn" id="s-aisave">Save</button>${aiOn ? '<button class="btn ghost" id="s-aitest">Test</button><button class="btn ghost" id="s-airm">Remove</button>' : ""}</div>
    <div class="msg" id="s-aimsg"></div></section></div>`;
}

/* =====================================================================
   Shell: tabs, render, theme, events
===================================================================== */

/* =====================================================================
   TAB: Journeys (page-to-page flow, entry / exit pages)
===================================================================== */
function tabJourneys() {
  const ss = V.sessions.filter(s => s.seq.length); if (!ss.length) return noData();
  const tr = new Map(), ent = new Map(), ex = new Map();
  ss.forEach(s => { const q = s.seq; ent.set(q[0], (ent.get(q[0]) || 0) + 1); ex.set(q[q.length - 1], (ex.get(q[q.length - 1]) || 0) + 1);
    for (let i = 1; i < q.length; i++) { if (q[i] === q[i - 1]) continue; const k = q[i - 1] + "  →  " + q[i]; tr.set(k, (tr.get(k) || 0) + 1); } });
  const T = [...tr.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v), E = [...ent.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v), X = [...ex.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const multi = ss.filter(s => s.pages.size > 1).length, depth = avg(ss.map(s => s.pv));
  let h = '<div class="grid">' + kpi("Sessions with a path", N(ss.length), "page-view sequences") + kpi("Multi-page sessions", pct(multi, ss.length), N(multi) + " sessions") + kpi("Pages / session", depth.toFixed(2), "average depth") + kpi("Distinct transitions", N(T.length), "page → page");
  h += card("Top page-to-page transitions", "Most common next step after each page (click a row for details)", table([{ h: "From → To", v: r => r.k }, { h: "Times", num: 1, v: r => r.v }, { h: "Share", num: 1, v: r => pct(r.v, sum(T.map(x => x.v)), 1), sv: r => r.v }], T, { sort: 1, h: 380 }), "c12");
  h += card("Entry pages", "Where sessions begin", cv("j-ent", "short"), "c6") + card("Exit pages", "Last page seen in a session", cv("j-exit", "short"), "c6") + "</div>";
  mkChart("j-ent", hbarCfg(E, css("--accent"))); mkChart("j-exit", hbarCfg(X, css("--danger"))); return h;
}

/* =====================================================================
   TAB: Cohorts (new vs returning, visit frequency, daily actives)
===================================================================== */
function tabCohorts() {
  const sd = V.sdocs; if (!sd.length) return noData();
  const day = new Map(); sd.forEach(s => { const k = new Date(s.startedAt || s._ts).toISOString().slice(0, 10); let o = day.get(k); if (!o) day.set(k, o = { n: 0, r: 0, v: new Set() }); s.isNewVisitor ? o.n++ : o.r++; if (s.visitorId) o.v.add(s.visitorId); });
  const ks = [...day.keys()].sort(), vis = new Map(); sd.forEach(s => { if (s.visitorId) vis.set(s.visitorId, Math.max(vis.get(s.visitorId) || 0, s.visitIndex || s.visitCount || 1)); });
  const bucket = tally([...vis.values()], n => n === 1 ? "1 visit" : n === 2 ? "2 visits" : n <= 5 ? "3–5 visits" : n <= 10 ? "6–10 visits" : "11+ visits");
  const loyal = [...vis.entries()].map(([id, n]) => ({ id, n, last: Math.max(...sd.filter(s => s.visitorId === id).map(s => s._ts)), user: (sd.find(s => s.visitorId === id && s.userKey) || {}).userKey })).sort((a, b) => b.n - a.n);
  const rep = [...vis.values()].filter(n => n > 1).length, dau = ks.map(k => day.get(k).v.size);
  let h = '<div class="grid">' + kpi("Unique visitors", N(vis.size), "with a session record") + kpi("Repeat visitors", pct(rep, vis.size), N(rep) + " came back") + kpi("Avg daily visitors", avg(dau).toFixed(1), "distinct per day") + kpi("Best day", ks.length ? ks[dau.indexOf(Math.max(...dau))] : "–", Math.max(0, ...dau) + " visitors");
  h += card("New vs returning sessions per day", "Stacked by visit type", cv("co-day"), "c8") + card("Visits per visitor", "How loyal the audience is", cv("co-b", "short"), "c4");
  h += card("Most loyal visitors", "Highest visit counts (anonymous id, or user when logged in)", table([{ h: "Visitor", v: r => r.user ? emailOf(r.user) : r.id.slice(0, 10) + "…" }, { h: "Visits", num: 1, v: r => r.n }, { h: "Last seen", v: r => fmtT(r.last), sv: r => r.last }], loyal, { sort: 1, h: 340 }), "c12") + "</div>";
  const cfg = lineCfg(ks.map(k => k.slice(5)), [{ label: "New", data: ks.map(k => day.get(k).n), color: css("--accent") }, { label: "Returning", data: ks.map(k => day.get(k).r), color: css("--amber") }], { bar: true });
  cfg.options = Object.assign(cfg.options || {}, { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } });
  mkChart("co-day", cfg); mkChart("co-b", doughCfg(bucket, 6)); return h;
}

/* =====================================================================
   TAB: AI dataset (training-data coverage + one-click exports)
===================================================================== */
const csvCell = v => { if (v == null) return ""; v = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCSV = (cols, rows) => cols.join(",") + "\n" + rows.map(r => cols.map(c => csvCell(r[c])).join(",")).join("\n");
function sessionFeatures() {
  const scr = new Map(); V.leaves.forEach(l => { const d = l.data || {}; scr.set(l.sessionId, Math.max(scr.get(l.sessionId) || 0, d.maxScrollPct || 0)); });
  return V.sessions.map(s => { const d = (s.doc && s.doc.device) || {}, dt = new Date(s.first), u = s.ua || {};
    return { session_id: s.id, visitor_id: s.visitor, user: s.user ? emailOf(s.user) : "", start_iso: dt.toISOString(), hour: dt.getHours(), weekday: dt.getDay(), duration_ms: s.dur, active_ms: s.active, page_views: s.pv, unique_pages: s.pages.size, clicks: s.clicks, errors: s.errors, db_writes: s.writes, max_scroll_pct: scr.get(s.id) || 0, bounce: s.bounce ? 1 : 0, landing: s.landing, exit_page: s.seq[s.seq.length - 1] || "", path: s.seq.join(">"), referrer: s.ref, browser: u.browser, os: u.os, device: u.device, screen_w: d.screen && d.screen.w, screen_h: d.screen && d.screen.h, viewport_w: d.viewport && d.viewport.w, dpr: d.screen && d.screen.dpr, cores: d.cores, memory_gb: d.memoryGB, touch_points: d.touchPoints, connection: d.connection && d.connection.type, downlink: d.connection && d.connection.downlink, rtt: d.connection && d.connection.rtt, timezone: d.timezone, language: d.language, dark_mode: d.prefersDark ? 1 : 0, new_visitor: s.doc && s.doc.isNewVisitor ? 1 : 0, visit_index: s.doc && s.doc.visitIndex, utm_source: s.doc && s.doc.utm && s.doc.utm.utm_source }; });
}
function tabDataset() {
  const ev = V.events, sd = V.sdocs; if (!ev.length && !sd.length) return noData();
  const has = (a, f) => a.filter(x => { try { const v = f(x); return v !== undefined && v !== null && v !== ""; } catch (e) { return false; } }).length;
  const chk = [["Events", "visitorId", ev, x => x.visitorId], ["Events", "user (logged in)", ev, x => x.userKey], ["Events", "page.area / name", ev, x => x.page.name], ["Events", "data payload", ev, x => Object.keys(x.data).length], ["Events", "click position (x,y)", ev.filter(e => e.type === "click"), x => x.data.x], ["Page views", "load timing", V.pv, x => x.data.perf.loadMs], ["Page views", "LCP", V.pv, x => x.data.perf.lcp], ["Page views", "CLS", V.pv, x => x.data.perf.cls], ["Page leaves", "active time", V.leaves, x => x.data.activeMs], ["Page leaves", "scroll depth", V.leaves, x => x.data.maxScrollPct],
    ["Sessions", "device.userAgent", sd, x => x.device.userAgent], ["Sessions", "screen size", sd, x => x.device.screen.w], ["Sessions", "CPU cores", sd, x => x.device.cores], ["Sessions", "device memory", sd, x => x.device.memoryGB], ["Sessions", "connection type", sd, x => x.device.connection.type], ["Sessions", "timezone", sd, x => x.device.timezone], ["Sessions", "referrer", sd, x => x.landing.referrer], ["Sessions", "UTM tags", sd, x => Object.keys(x.utm).length]]
    .map(([src, f, a, g]) => ({ src, f, n: a.length, p: a.length ? has(a, g) / a.length : 0 }));
  const score = avg(chk.map(c => c.p)), cats = tally(ev, e => e.category), feat = sessionFeatures();
  let h = '<div class="grid">' + kpi("Training rows (sessions)", N(feat.length), "one row per session") + kpi("Raw events", N(ev.length), "JSONL export") + kpi("Event types", N(tally(ev, e => e.type).length), "distinct behaviours") + kpi("Field coverage", (score * 100).toFixed(0) + "%", "avg across tracked fields");
  h += card("Export for model training", "Honors the current time range and filters. Files download straight from your browser.", `<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="dx-s">Sessions features (CSV)</button><button class="btn" id="dx-e">All events (JSONL)</button><button class="btn" id="dx-p">Page views (CSV)</button><button class="btn ghost" id="dx-j">Sessions (JSON)</button></div><p class="hint">Sessions CSV is a flat feature table (time, device, behaviour, source) ready for pandas/sklearn. Events JSONL keeps every raw parameter for sequence models.</p>`, "c12");
  h += card("Field coverage", "How often each parameter was actually captured — low values show where data is missing", table([{ h: "Source", v: r => r.src }, { h: "Field", v: r => r.f }, { h: "Rows", num: 1, v: r => r.n }, { h: "Captured", num: 1, v: r => (r.p * 100).toFixed(0) + "%", sv: r => r.p }], chk, { sort: 3, dir: 1, h: 420 }), "c8") + card("Events by category", "Class balance of your data", cv("d-cat", "short"), "c4") + "</div>";
  mkChart("d-cat", doughCfg(cats, 7));
  post.push(() => {
    const st = new Date().toISOString().slice(0, 10), on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on("dx-s", () => download("sessions_features_" + st + ".csv", toCSV(Object.keys(feat[0] || { session_id: 1 }), feat), "text/csv"));
    on("dx-e", () => download("events_" + st + ".jsonl", ev.map(e => JSON.stringify(strip(e))).join("\n"), "application/x-ndjson"));
    on("dx-p", () => download("page_views_" + st + ".csv", toCSV(["time", "session_id", "visitor_id", "user", "page", "load_ms", "ttfb_ms", "fcp", "lcp", "cls", "transfer_kb", "nav_type", "referrer"], V.pv.map(p => { const f = (p.data && p.data.perf) || {}; return { time: new Date(p._ts).toISOString(), session_id: p.sessionId, visitor_id: p.visitorId, user: emailOf(p.userKey), page: pageLabel(p), load_ms: f.loadMs, ttfb_ms: f.ttfbMs, fcp: f.fcp, lcp: f.lcp, cls: f.cls, transfer_kb: f.transferKB, nav_type: f.navType, referrer: p.data && p.data.referrer }; })), "text/csv"));
    on("dx-j", () => download("sessions_" + st + ".json", JSON.stringify(sd.map(strip), null, 1), "application/json"));
  });
  return h;
}

const TABS = [["ai", "AI", tabAI], ["overview", "Overview", tabOverview], ["audience", "Audience & traffic", tabAudience], ["behaviour", "Behaviour", tabBehaviour], ["usage", "Usage", tabUsage], ["sessions", "Sessions", tabSessions],
   ["devices", "Devices & speed", tabDevices], ["errors", "Errors", tabErrors], ["insights", "AI insights", tabInsights], ["journeys", "Journeys", tabJourneys], ["cohorts", "Cohorts", tabCohorts], ["dataset", "AI dataset", tabDataset], ["explorer", "Explorer", tabExplorer], ["live", "Live", tabLive], ["settings", "Settings", tabSettings]];
let cur = (location.hash || "#ai").slice(1);
if (cur === "users") cur = "usage";
if (cur === "database") cur = "ai";
if (!TABS.some(t => t[0] === cur)) cur = "ai";

function render() {
  if (!V) return; stopLive(); post = [];
  Object.keys(charts).forEach(k => { try { charts[k].destroy(); } catch (e) { } delete charts[k]; });
  const t = TABS.find(x => x[0] === cur) || TABS[0];
  const st = window.scrollY;
  let html; try { html = (D.loadedAt || cur === "settings" || cur === "ai" ? t[2]() : "") + (cur !== "settings" && cur !== "overview" ? "" : ""); } catch (e) { console.error(e); html = `<div class="banner">Could not render this view: ${esc(e.message)}</div>`; }
  if (cur === "overview" && Object.keys(D.errors).length && V.events.length) html = permBanner() + html;
  $("#view").innerHTML = html; chartDefaults();
  post.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  // once the new layout has settled (scrollbar appears/disappears between tabs), refit every chart so none stays blank
  requestAnimationFrame(() => requestAnimationFrame(() => Object.values(charts).forEach(c => { try { if (c.canvas && c.canvas.isConnected) c.resize(); } catch (e) { } })));
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === cur));
  window.scrollTo(0, st);
}
function refresh() {
  derive();
  $("#p-status").textContent = D.loadedAt ? `${C(V.events.length)} events · ${N(V.sessions.length)} sessions · ${fmtT(D.loadedAt).replace(/^\d+ \w+,? /, "")}` : "not loaded";
  render();
}
function setTheme(t) { document.documentElement.dataset.theme = t; lset("PL_AI_THEME", t); if (V) render(); }

let started = false, autoTimer = null;
function startApp() {
  if (started) return; started = true;
  const th = lget("PL_AI_THEME") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); document.documentElement.dataset.theme = th;
  $("#tabs").innerHTML = TABS.map(t => `<button data-t="${t[0]}">${t[1]}</button>`).join("");
  $$("#tabs button").forEach(b => b.onclick = () => { cur = b.dataset.t; history.replaceState(null, "", "#" + cur); render(); window.scrollTo(0, 0); });
  $("#btn-theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#btn-reload").onclick = loadAll; $("#btn-clear").onclick = () => { $("#f-area").value = $("#f-dev").value = $("#f-aud").value = $("#f-user").value = ""; $("#f-staff").checked = true; refresh(); };
  ["#f-area", "#f-dev", "#f-aud", "#f-staff"].forEach(s => $(s).onchange = refresh);
  let tm; $("#f-user").oninput = () => { clearTimeout(tm); tm = setTimeout(() => { refresh(); $("#f-user").focus(); }, 300); };
  $("#f-range").onchange = () => { const c = $("#f-range").value === "custom"; $("#f-custom").classList.toggle("hidden", !c); if (c) { const t = new Date(), f = new Date(Date.now() - 7 * 864e5); $("#f-to").value = t.toISOString().slice(0, 10); $("#f-from").value = f.toISOString().slice(0, 10); } loadAll(); };
  $("#f-from").onchange = $("#f-to").onchange = loadAll; $("#f-cap").onchange = loadAll; $("#f-db").onchange = loadAll;
  $("#autorefresh").onchange = e => { clearInterval(autoTimer); if (e.target.checked) autoTimer = setInterval(() => { if (document.visibilityState === "visible" && cur !== "live") loadAll(); }, 60000); };
  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h) && h !== cur) { cur = h; render(); } });
  V = { events: [], muts: [], reads: [], sdocs: [], sessions: [], users: [], by: () => [], pv: [], clicks: [], leaves: [], errs: [], visitors: new Set(), minTs: 0, maxTs: 0 };
  render(); loadAll(); loadAiCfg();
}

bootLock();

/* tabs: invisible scrollbar stays active — mouse wheel and click-drag slide the tab row */
(function () {
  const nav = document.getElementById("tabs"); if (!nav) return;
  nav.addEventListener("wheel", e => { if (nav.scrollWidth > nav.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { nav.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  let down = false, moved = false, x0 = 0, s0 = 0;
  nav.addEventListener("mousedown", e => { down = true; moved = false; x0 = e.pageX; s0 = nav.scrollLeft; });
  window.addEventListener("mousemove", e => { if (!down) return; const dx = e.pageX - x0; if (Math.abs(dx) > 5) { moved = true; nav.classList.add("drag"); } if (moved) nav.scrollLeft = s0 - dx; });
  window.addEventListener("mouseup", () => { down = false; nav.classList.remove("drag"); });
  nav.addEventListener("click", e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
})();

/* mobile header: collapsed by default; the chevron toggles filters + actions (no effect on desktop) */
(function () {
  const b = document.getElementById("btn-more"), hd = document.querySelector("header.top"); if (!b || !hd) return;
  b.addEventListener("click", () => { const o = hd.classList.toggle("open"); b.setAttribute("aria-expanded", o ? "true" : "false"); b.title = o ? "Hide filters & actions" : "Show filters & actions"; });
})();
