/* ============================================================================
   INGENIOUX · data lake  (v2)
   ----------------------------------------------------------------------------
   Passive, UI-neutral analytics logger  ->  Cloud Firestore (ingenioux-ai).
   Include once per page, from the site root:

       <script type="module" src="/datalake.js"></script>

   Writes
     ai_sessions      one document per visit (30 min inactivity window, shared
                      across tabs)
     ai_events        every page / interaction / error / network event
     ai_db_mutations  only when a page calls  INGENIOUX_AI.dbWrite(...)
     ai_db_reads      only when a page calls  INGENIOUX_AI.dbRead(...)
   Read by  /AI/  (AI Data Lab dashboard). Field names are unchanged from v1,
   so the dashboard keeps working without edits.

   Site areas (page.area) come from the first folder of the URL:
       /                 -> main   (shown as "Home")
       /Projects/...     -> projects      /Disclosure/...  -> disclosure
       /Blogs/...        -> blogs         /Store/...       -> store
       /Portfolio/...    -> portfolio     /Admin/...       -> admin
       /AI/...           -> ai
   Any new top-level folder becomes its own area automatically. The second
   folder (e.g. /Projects/<project>/ or /Disclosure/Articles/) is stored as
   page.section, so every project/section is separable without code changes.

   Privacy
     - Never stores typed values, except search boxes (emails/long numbers are
       masked). Passwords, e-mail, phone and hidden fields are always ignored.
     - Link targets: mailto:/tel: addresses are NOT stored, only the kind;
       outbound links are stored without their query string.
     - Add  data-ai-ignore  to any element to exclude clicks inside it.
     - Add  data-ai="Some label"  to any element to give its clicks a stable name.

   Owner controls
     ?ai_ignore=1   stop tracking in this browser (e.g. you, as admin)
     ?ai_track=1    start tracking again
     Bots, headless browsers, localhost and file:// are skipped automatically.

   Optional hooks
     INGENIOUX_AI.setUser({ email, name })      sign-in identity
     window.__INGENIOUX_USER__ = { email, name } same thing, works even if set
                                                 before this script has loaded
     INGENIOUX_AI.track("name", { ... })        custom event
     INGENIOUX_AI.dbWrite("set", "path/x", obj) log a database write
     INGENIOUX_AI.dbRead("get", "path/x")       log a database read
   Store sign-ins (localStorage "ingenioux_shop_user_v1") are picked up
   automatically.
   ========================================================================== */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { initializeFirestore, collection, doc, writeBatch } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

/* ----------------------------------------------------------------------------
   Settings
---------------------------------------------------------------------------- */
const FIREBASE = {
  apiKey: "AIzaSyDCZMSbvb9Kb-qam7Pl6y3fvObnAeM9mkI",
  authDomain: "ingenioux-ai.firebaseapp.com",
  projectId: "ingenioux-ai",
  storageBucket: "ingenioux-ai.firebasestorage.app",
  messagingSenderId: "1078122034249",
  appId: "1:1078122034249:web:a0021c403178723aa9fb98"
};

const CFG = {
  appName: "ingenioux-ai",
  cols: { events: "ai_events", sessions: "ai_sessions", dbWrites: "ai_db_mutations", dbReads: "ai_db_reads" },
  storeUserKey: "ingenioux_shop_user_v1",   // written by /Store/auth.js
  sessionIdleMs: 30 * 60 * 1000,            // a new visit starts after 30 min of silence
  activeIdleMs: 60 * 1000,                  // "active time" stops after 60 s without input
  flushEveryMs: 5000,
  flushAt: 20,                              // flush as soon as this many items are queued
  maxBatch: 400,                            // Firestore allows 500 writes per batch
  maxQueue: 800,                            // hard cap if the network is down
  maxEventsPerPage: 300,                    // protects the free Firestore write quota
  commitTimeoutMs: 15000,
  trackLocalhost: false,
  respectDoNotTrack: false,                 // true = skip visitors who send DNT / GPC
  skipBots: true,
  skipPaths: []                             // e.g. [/^\/Admin\//i] to never track a path
};

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|preview|facebookexternalhit|python-requests|curl\/|wget\//i;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LONGNUM_RE = /\b\d{9,}\b/g;
const SECRET_KEY_RE = /password|passwd|pwd|secret|token|api[-_]?key|\botp\b|\bcvv\b|\bcvc\b|card[-_]?number/i;
const CLICK_SELECTOR = "a,button,input,select,textarea,summary,label,[role=button],[onclick],[data-ai],img,li,h1,h2,h3";
const CARD_SELECTOR = "[data-ai],.work-card,.product-card,.card,article";
const FETCH_SKIP_RE = /firestore|googleapis|gstatic|google-analytics|firebaseio/;

/* ----------------------------------------------------------------------------
   Small helpers
---------------------------------------------------------------------------- */
const mem = {};
const makeStore = kind => (k, v) => {
  const key = kind + k, area = kind === "s" ? "sessionStorage" : "localStorage";
  if (v === undefined) {
    try { const r = window[area].getItem(k); if (r != null) return r; } catch (e) { /* blocked */ }
    return mem[key] != null ? mem[key] : null;
  }
  mem[key] = String(v);
  try { window[area].setItem(k, String(v)); } catch (e) { /* blocked */ }
};
const L = makeStore("l");

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const clean = (s, n = 120) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const scrub = (s, n = 120) => clean(s, n).replace(EMAIL_RE, "[email]").replace(LONGNUM_RE, "[number]");
const hostOf = u => { try { return new URL(u, location.href).host; } catch (e) { return ""; } };
const noQuery = (u, n = 100) => { try { const x = new URL(u, location.href); return x.origin + x.pathname; } catch (e) { return clean(u, n); } };
const safeDecode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };

function redact(v, depth = 0) {
  if (v == null) return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return scrub(v, 300);
  if (depth > 4) return "[deep]";
  if (Array.isArray(v)) return v.slice(0, 25).map(x => redact(x, depth + 1));
  if (typeof v === "object") {
    const o = {};
    Object.keys(v).slice(0, 40).forEach(k => { o[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redact(v[k], depth + 1); });
    return o;
  }
  return clean(v, 100);
}

function deviceType(ua) {
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "Tablet";
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "Tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "Mobile";
  return "Desktop";
}
function browserOf(ua) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}
function osOf(ua) {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

/* ----------------------------------------------------------------------------
   Where am I?  (Ingenioux site map)
---------------------------------------------------------------------------- */
function pageInfo() {
  const P = location.pathname;
  const parts = P.split("/").filter(Boolean).map(safeDecode);
  const file = parts.length && /\.[a-z0-9]+$/i.test(parts[parts.length - 1]) ? parts.pop() : null;
  const folders = parts.map(p => p.toLowerCase());
  const area = folders[0] || "main";
  let name = file ? file.replace(/\.[^.]+$/, "").toLowerCase() : "index";
  if (area === "main" && name === "index") name = "home";
  return {
    area,
    section: folders[1] || null,
    name,
    path: P + location.search,
    url: location.href,
    title: document.title,
    semester: null,            // legacy field still read by the dashboard; unused on Ingenioux
    staff: /(^|\/)(admin|executive)(\/|\.html|$)/i.test(P)
  };
}

/* ----------------------------------------------------------------------------
   Should we run at all?
---------------------------------------------------------------------------- */
(function readOwnerSwitches() {
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get("ai_ignore") === "1") L("ai_ignore", "1");
    if (qs.get("ai_track") === "1") L("ai_ignore", "0");
  } catch (e) { /* ignore */ }
})();

function shouldRun() {
  if (L("ai_ignore") === "1") return false;
  if (location.protocol === "file:") return false;
  if (!CFG.trackLocalhost && /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname)) return false;
  if (CFG.skipBots && (navigator.webdriver || BOT_RE.test(navigator.userAgent))) return false;
  if (CFG.respectDoNotTrack && (navigator.doNotTrack === "1" || navigator.globalPrivacyControl)) return false;
  if (CFG.skipPaths.some(re => re.test(location.pathname))) return false;
  return true;
}

/* Public API exists even when tracking is off, so page code never has to check. */
let user = null;
const api = {
  version: 2,
  enabled: false,
  setUser: u => { user = u || null; },
  track: () => {}, dbWrite: () => {}, dbRead: () => {}, flush: () => {},
  optOut: () => { L("ai_ignore", "1"); },
  optIn: () => { L("ai_ignore", "0"); }
};
window.INGENIOUX_AI = api;

if (shouldRun()) { try { boot(); } catch (e) { /* logging must never break the site */ } }

/* ============================================================================
   Boot
============================================================================ */
function boot() {
  const app = getApps().find(a => a.name === CFG.appName) || initializeApp(FIREBASE, CFG.appName);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true });

  /* ---- identity --------------------------------------------------------- */
  const visitorId = L("ai_vid") || (L("ai_vid", rid()), L("ai_vid"));

  function who() {
    const u = user || window.__INGENIOUX_USER__;
    if (u && u.email) return { email: String(u.email), name: u.name || "" };
    try {
      const s = JSON.parse(localStorage.getItem(CFG.storeUserKey) || "null");   // Ingenioux Store login
      if (s && s.email) return { email: String(s.email), name: s.name || "" };
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---- visit (session) --------------------------------------------------- */
  let sessionId = null, visitCount = 1;

  function ensureSession() {
    const n = Date.now(), last = +L("ai_last") || 0, stored = L("ai_sid");
    if (stored && n - last <= CFG.sessionIdleMs) {
      sessionId = stored; visitCount = +L("ai_visits") || 1;
      if (n - last > 3000) L("ai_last", n);
      return;
    }
    sessionId = rid(); L("ai_sid", sessionId); L("ai_last", n);
    visitCount = (+L("ai_visits") || 0) + 1; L("ai_visits", visitCount);
    queueSessionDoc(n);
  }

  /* ---- page view bookkeeping --------------------------------------------- */
  let pageviewId = rid(), t0 = Date.now(), seq = 0, evCount = 0;
  let active = 0, lastTick = Date.now(), lastInput = Date.now(), vis = !document.hidden;
  let maxScroll = 0, clicks = 0, keys = 0;
  const marks = new Set();
  const perfInfo = {};

  const core = () => {
    const u = who();
    return {
      schema: 2,
      sessionId, visitorId, pageviewId,
      clientTs: Date.now(),
      page: pageInfo(),
      seq: ++seq,
      userKey: u ? u.email.replace(/\./g, ",") : null,
      user: u ? { name: u.name } : null,
      visitCount
    };
  };
  const base = () => { ensureSession(); return core(); };

  /* ---- write queue -------------------------------------------------------- */
  let q = [], flushing = false, fails = 0, failUntil = 0;

  async function flush() {
    if (flushing || !q.length || Date.now() < failUntil) return;
    flushing = true;
    const items = q.splice(0, CFG.maxBatch);
    try {
      const b = writeBatch(db);
      items.forEach(i => b.set(doc(collection(db, i.col)), i.d));
      /* Offline, commit() waits for the network; the SDK keeps the write queued,
         so after the timeout we simply stop waiting instead of blocking later flushes. */
      await Promise.race([b.commit(), new Promise(r => setTimeout(r, CFG.commitTimeoutMs))]);
      fails = 0;
    } catch (e) {
      fails++;
      failUntil = Date.now() + Math.min(60000, 2000 * Math.pow(2, fails));
      if (fails <= 4) q.unshift(...items.slice(0, Math.max(0, CFG.maxQueue - q.length)));
    } finally { flushing = false; }
  }
  setInterval(flush, CFG.flushEveryMs);

  function push(col, d) {
    if (q.length >= CFG.maxQueue) q.shift();
    q.push({ col, d });
    if (q.length >= CFG.flushAt) flush();
  }

  function emit(type, category, data, always) {
    if (!always && ++evCount > CFG.maxEventsPerPage) return;
    push(CFG.cols.events, Object.assign(base(), { type, category, data: data || {} }));
  }

  /* ---- session document --------------------------------------------------- */
  function queueSessionDoc(startedAt) {
    const c = navigator.connection || {}, ua = navigator.userAgent;
    const qs = new URLSearchParams(location.search), utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"].forEach(k => { if (qs.get(k)) utm[k] = clean(qs.get(k), 80); });
    push(CFG.cols.sessions, Object.assign(core(), {
      startedAt,
      isNewVisitor: visitCount <= 1,
      visitIndex: visitCount,
      landing: { url: location.href, referrer: document.referrer, referrerHost: hostOf(document.referrer) },
      utm,
      device: {
        type: deviceType(ua), browser: browserOf(ua), os: osOf(ua),
        userAgent: ua, platform: navigator.platform,
        language: navigator.language, languages: (navigator.languages || []).slice(0, 5),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffset: new Date().getTimezoneOffset(),
        screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio, depth: screen.colorDepth },
        viewport: { w: innerWidth, h: innerHeight },
        cores: navigator.hardwareConcurrency, memoryGB: navigator.deviceMemory, touchPoints: navigator.maxTouchPoints,
        connection: { type: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData },
        prefersDark: matchMedia("(prefers-color-scheme: dark)").matches,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        standalone: matchMedia("(display-mode: standalone)").matches,
        cookies: navigator.cookieEnabled, dnt: navigator.doNotTrack, online: navigator.onLine
      }
    }));
  }

  /* ---- performance -------------------------------------------------------- */
  const nav = performance.getEntriesByType("navigation")[0] || {};
  try { new PerformanceObserver(l => { const e = l.getEntries(); perfInfo.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch (e) { /* unsupported */ }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) perfInfo.cls = +((perfInfo.cls || 0) + e.value).toFixed(4); })).observe({ type: "layout-shift", buffered: true }); } catch (e) { /* unsupported */ }

  const perf = () => {
    const f = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      loadMs: Math.round(nav.loadEventEnd || performance.now()),
      ttfb: Math.round(nav.responseStart || 0), ttfbMs: Math.round(nav.responseStart || 0),
      dclMs: Math.round(nav.domContentLoadedEventEnd || 0), domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
      fcp: f ? Math.round(f.startTime) : null, lcp: perfInfo.lcp || null, cls: perfInfo.cls || 0,
      transferKB: Math.round((nav.transferSize || 0) / 1024), navType: nav.type,
      resources: performance.getEntriesByType("resource").length
    };
  };

  /* ---- page view ---------------------------------------------------------- */
  function pageView(navType) {
    emit("page_view", "navigation", {
      perf: Object.assign(perf(), navType ? { navType } : {}),
      referrer: document.referrer,
      viewport: { w: innerWidth, h: innerHeight },
      docHeight: document.documentElement.scrollHeight,
      lang: document.documentElement.lang,
      theme: document.documentElement.dataset.theme || null
    }, true);
  }
  const firstView = () => setTimeout(() => pageView(), 300);
  if (document.readyState === "complete") firstView(); else addEventListener("load", firstView);

  /* ---- engagement: active time, scroll, keys ------------------------------ */
  const touchInput = () => { lastInput = Date.now(); };
  ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"].forEach(t => addEventListener(t, touchInput, { passive: true, capture: true }));
  const tick = () => {
    const n = Date.now();
    if (vis && n - lastInput < CFG.activeIdleMs) active += Math.min(n - lastTick, 5000);
    lastTick = n;
  };
  setInterval(tick, 1000);

  addEventListener("scroll", () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const p = h > 0 ? Math.round(100 * scrollY / h) : 100;
    if (p > maxScroll) maxScroll = p;
    [25, 50, 75, 100].forEach(m => {
      if (p >= m && !marks.has(m)) { marks.add(m); emit("scroll_depth", "engagement", { depthPct: m, atMs: Date.now() - t0 }); }
    });
  }, { passive: true });
  addEventListener("keydown", () => { keys++; }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    tick(); vis = !document.hidden;
    emit("visibility_change", "engagement", { visible: vis, activeMs: active });
    if (!vis) flush();
  });

  /* ---- clicks -------------------------------------------------------------- */
  let lastClick = { el: null, t: 0 };
  const labelOf = el => {
    if (el.matches && el.matches("input[type=button],input[type=submit],input[type=reset]")) return scrub(el.value, 80);
    if (el.matches && el.matches("input,textarea,select")) return "";              // never log typed values
    return scrub(el.innerText || el.alt || (el.getAttribute && el.getAttribute("aria-label")), 80);
  };
  const cardLabel = card => {
    if (!card) return null;
    const own = card.getAttribute("data-ai");
    if (own) return clean(own, 60);
    const h = card.querySelector("h1,h2,h3,h4");
    return h ? scrub(h.textContent, 60) : null;
  };
  const linkInfo = a => {
    if (!a || !a.href) return { href: null, outbound: false, kind: null };
    if (/^mailto:/i.test(a.href)) return { href: "mailto:", outbound: false, kind: "mail" };
    if (/^tel:/i.test(a.href)) return { href: "tel:", outbound: false, kind: "tel" };
    try {
      const x = new URL(a.href, location.href), same = x.host === location.host;
      return { href: same ? clean(x.href, 200) : x.origin + x.pathname, outbound: !same, kind: same ? "internal" : "outbound" };
    } catch (e) { return { href: null, outbound: false, kind: null }; }
  };

  document.addEventListener("click", ev => {
    clicks++;
    const target = ev.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-ai-ignore]")) return;
    const el = target.closest(CLICK_SELECTOR) || target;
    const n = Date.now();
    if (lastClick.el === el && n - lastClick.t < 120) return;     // double-fire guard
    lastClick = { el, t: n };

    const a = el.closest("a"), li = linkInfo(a), named = el.closest("[data-ai]");
    const cls = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    emit("click", "interaction", {
      tag: el.tagName, id: el.id || null, cls: clean(cls, 80),
      text: el.type === "password" ? "" : labelOf(el),
      aria: el.getAttribute && el.getAttribute("aria-label"), title: el.title || null,
      ai: named ? clean(named.getAttribute("data-ai"), 60) : null,
      item: cardLabel(el.closest(CARD_SELECTOR)),
      href: li.href, linkKind: li.kind, outbound: li.outbound,
      fileLink: !!(a && /\.(pdf|zip|docx?|xlsx?|pptx?|apk|png|jpe?g)(\?|$)/i.test(a.href)),
      x: Math.round(ev.clientX), y: Math.round(ev.clientY), pageY: Math.round(ev.pageY),
      sinceLoadMs: n - t0
    });
  }, true);

  /* ---- forms, search, clipboard, media ------------------------------------ */
  document.addEventListener("submit", ev => {
    const f = ev.target;
    emit("form_submit", "interaction", { form: { id: f.id || null, name: f.name || null, action: noQuery(f.action), method: f.method, fields: f.elements ? f.elements.length : 0 } });
    flush();
  }, true);

  let searchTimer;
  document.addEventListener("input", ev => {
    const t = ev.target;
    if (!t || /^(password|email|tel|hidden)$/i.test(t.type || "")) return;
    if (t.type !== "search" && !/search|query/i.test((t.id || "") + (t.name || "") + (t.placeholder || ""))) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => emit("search_input", "interaction", { query: scrub(t.value, 80), field: t.id || t.name || null }), 900);
  }, true);

  ["copy", "cut", "paste"].forEach(k => document.addEventListener(k, () => emit("clipboard", "interaction", { action: k })));
  document.addEventListener("play", ev => emit("media", "interaction", { action: "play", src: noQuery(ev.target.currentSrc, 80) }), true);
  document.addEventListener("pause", ev => emit("media", "interaction", { action: "pause", src: noQuery(ev.target.currentSrc, 80), pos: Math.round(ev.target.currentTime) }), true);

  /* ---- errors -------------------------------------------------------------- */
  const seenErr = {};
  const firstFew = k => (seenErr[k] = (seenErr[k] || 0) + 1) <= 3;
  addEventListener("error", ev => {
    if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) {
      const src = noQuery(ev.target.src || ev.target.href, 160);
      if (firstFew("r|" + src)) emit("resource_error", "error", { src, tag: ev.target.tagName });
      return;
    }
    const k = "j|" + ev.message + ev.filename + ev.lineno;
    if (firstFew(k)) emit("js_error", "error", { message: clean(ev.message, 200), file: noQuery(ev.filename, 160), line: ev.lineno, col: ev.colno, stack: clean(ev.error && ev.error.stack, 600) });
  }, true);
  addEventListener("unhandledrejection", ev => {
    const m = clean(ev.reason && (ev.reason.message || ev.reason), 200);
    if (firstFew("u|" + m)) emit("unhandled_rejection", "error", { message: m, stack: clean(ev.reason && ev.reason.stack, 600) });
  });
  addEventListener("online", () => emit("network", "system", { online: true }));
  addEventListener("offline", () => emit("network", "system", { online: false }));

  /* ---- api_call: wrap fetch (never logs Firestore / Google traffic) -------- */
  if (window.fetch && !window.fetch.__ingenioux) {
    const original = window.fetch.bind(window);
    const wrapped = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = (init && init.method) || (input && input.method) || "GET";
      const started = Date.now(), host = hostOf(url);
      const p = original(input, init);
      if (!FETCH_SKIP_RE.test(host)) {
        p.then(
          r => emit("api_call", "network", { method, host, path: clean(url.replace(/^https?:\/\/[^/]+/, "").split("?")[0], 80), status: r.status, ok: r.ok, durationMs: Date.now() - started }),
          er => emit("api_call", "network", { method, host, error: clean(er && er.message, 80), durationMs: Date.now() - started })
        );
      }
      return p;
    };
    wrapped.__ingenioux = true;
    window.fetch = wrapped;
  }

  /* ---- client-side route changes (pushState / back button) ---------------- */
  let lastRoute = location.pathname + location.search;
  const routeChanged = how => {
    const now = location.pathname + location.search;
    if (now === lastRoute) return;
    emit("route_change", "navigation", { from: lastRoute, to: now, how });
    lastRoute = now;
  };
  ["pushState", "replaceState"].forEach(fn => {
    const orig = history[fn];
    history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(() => routeChanged(fn), 0); return r; };
  });
  addEventListener("popstate", () => routeChanged("popstate"));

  /* ---- leaving -------------------------------------------------------------- */
  let left = false;
  const leave = () => {
    if (left) return; left = true;
    tick();
    emit("page_leave", "navigation", { activeMs: active, totalMs: Date.now() - t0, maxScrollPct: maxScroll, clicks, keys, perf: perf() }, true);
    flush();
  };
  addEventListener("pagehide", leave);
  addEventListener("beforeunload", leave);

  /* Back/forward cache: the page is shown again without reloading -> count it as a new view. */
  addEventListener("pageshow", ev => {
    if (!ev.persisted) return;
    left = false; pageviewId = rid(); t0 = Date.now(); seq = 0; evCount = 0;
    active = 0; maxScroll = 0; clicks = 0; keys = 0; marks.clear(); lastTick = Date.now();
    pageView("back_forward");
  });

  /* ---- database activity (opt-in, called by page code) --------------------- */
  const domainOf = p => String(p || "").replace(/^\/+/, "").split("/")[0] || "root";
  const dbDoc = (extra) => Object.assign(base(), extra);

  api.track = (type, data) => emit(clean(type, 60) || "custom", "custom", redact(data));
  api.dbWrite = (op, path, payload, meta) => {
    const p = String(path || "").replace(/^\/+/, "");
    push(CFG.cols.dbWrites, dbDoc({
      op: clean(op, 20), path: scrub(p, 160), domain: domainOf(p),
      deleted: op === "remove" || op === "delete",
      payload: redact(payload), meta: redact(meta)
    }));
  };
  api.dbRead = (op, path, meta) => {
    const p = String(path || "").replace(/^\/+/, "");
    push(CFG.cols.dbReads, dbDoc({ op: clean(op, 20), path: scrub(p, 160), domain: domainOf(p), meta: redact(meta) }));
  };
  api.flush = flush;
  api.enabled = true;

  /* Open the visit right away so the session document exists even if the first event is slow. */
  ensureSession();
  flush();
}
