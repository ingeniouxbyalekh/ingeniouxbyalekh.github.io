/**
 * PlayLearn Data Lake  (datalake.js)
 * ---------------------------------------------------------------
 * Records everything users do on the site into the NEW Cloud
 * Firestore database of the playlearn-cb8c1 Firebase project, so the
 * data can be used later to train an AI. It is completely separate
 * from the Realtime Database the site already uses: nothing here
 * reads from, or changes, what the site stores there.
 *
 * It does NOT change any UI or behaviour. It listens passively
 * (clicks, forms, scrolling, toasts, errors, Realtime Database
 * writes ...) and uploads in the background. Every piece is wrapped
 * in try/catch, so a failure here can never break a page.
 *
 * Load it on every page, AFTER the firebase-*-compat <script> tags
 * and BEFORE auth.js:
 *     <script src="datalake.js"></script>
 *
 * Firestore collections (all append-only, one document per record):
 *   ai_sessions         one doc per browsing session (device, referrer, landing page ...)
 *   ai_events           every user action / page signal (see "type")
 *   ai_db_mutations     every Realtime Database write the site makes
 *                       (set / update / push / remove / transaction)
 *   ai_db_reads         which Realtime Database paths pages read / listened to
 *
 * Never stored: passwords, OTPs, card numbers, tokens, secrets.
 * Opt-out: localStorage.setItem("PL_DL_OPTOUT","1")  or  window.PLDL_DISABLE = true
 *
 * Public API (all safe to call at any time):
 *     PLDL.track(type, data)            custom event
 *     PLDL.dbWrite(op, ref, value)      log a write made with the modular SDK
 *     PLDL.identify({email,name,...})   attach/override the user
 *     PLDL.flush()                      upload the queue right now
 * ---------------------------------------------------------------
 */
(function () {
  "use strict";
  if (window.PLDL) return;

  var VERSION = 2;
  var SDK = "https://www.gstatic.com/firebasejs/10.12.5/";
  var APP_NAME = "playlearn-datalake";
  // Same project as the rest of the shop (playlearn-cb8c1). Firestore lives here.
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyABB2Tl_3umwwx1eXKsTiakCPJ3L5TP-yQ",
    authDomain: "playlearn-cb8c1.firebaseapp.com",
    projectId: "playlearn-cb8c1",
    storageBucket: "playlearn-cb8c1.firebasestorage.app",
    messagingSenderId: "196791573453",
    appId: "1:196791573453:web:429ca975f41f2af7a00284"
  };
  var COL = {
    events: "ai_events",
    sessions: "ai_sessions",
    mutations: "ai_db_mutations",
    reads: "ai_db_reads"
  };
  var USER_KEYS = ["PlayLearn_user_v1", "PlayLearn_shop_user_v1"];
  var STAFF_KEYS = { admin: "PlayLearn_admin_user_v1", executive: "PlayLearn_executive_user_v1" };

  /* ---- limits ---- */
  var MAX_STR = 4000, MAX_KEYS = 120, MAX_ARR = 120, MAX_DEPTH = 7;
  var MAX_DOC_BYTES = 600000;       // Firestore hard limit is 1 MiB
  var FLUSH_MS = 4000, FLUSH_AT = 25, BATCH_MAX = 400, QUEUE_CAP = 600;
  var SENSITIVE = /pass(word|wd|code)?$|^pwd|secret|otp|cvv|cvc|card.?(num|number|no)|^token$|_token|token_|apikey|api_key|authorization|private.?key/i;

  /* ---- tiny safe helpers ---- */
  var ls = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  var ss = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();
  var rawSet = ls ? Storage.prototype.setItem : null; // untouched copy (we patch setItem later)
  function lget(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function lset(k, v) { try { if (ls) rawSet.call(ls, k, v); } catch (e) { } }
  function sget(k) { try { return ss ? ss.getItem(k) : null; } catch (e) { return null; } }
  function sset(k, v) { try { if (ss) ss.setItem(k, v); } catch (e) { } }
  function now() { return Date.now(); }
  function uid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ""); } catch (e) { }
    return now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
  }
  function jparse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function emailKey(e) { return String(e || "").trim().toLowerCase().replace(/\./g, ","); }

  if (window.PLDL_DISABLE || lget("PL_DL_OPTOUT") === "1") {
    window.PLDL = { track: noop, dbWrite: noop, identify: noop, flush: noop, disabled: true };
    return;
  }
  function noop() { }

  /* ---------------------------------------------------------------
     Sanitiser — turns anything into a Firestore-safe value, strips
     secrets, shrinks huge strings / data-URLs.
  --------------------------------------------------------------- */
  function cleanKey(k) {
    k = String(k).slice(0, 150);
    if (!k) return "_";
    if (/^__.*__$/.test(k)) return "_" + k;
    return k;
  }
  function cleanStr(s) {
    if (/^data:[^;,]+[;,]/i.test(s)) return "[data-url " + s.length + " chars " + s.slice(0, s.indexOf(",") > 0 ? s.indexOf(",") : 30) + "]";
    if (s.length > MAX_STR) return s.slice(0, MAX_STR) + "…[+" + (s.length - MAX_STR) + " chars]";
    return s;
  }
  function clean(v, depth, seen) {
    depth = depth || 0;
    if (v === null) return null;
    var t = typeof v;
    if (t === "undefined" || t === "function" || t === "symbol") return undefined;
    if (t === "string") return cleanStr(v);
    if (t === "boolean") return v;
    if (t === "number") return isFinite(v) ? v : null;
    if (t === "bigint") return String(v);
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
    if (typeof Node !== "undefined" && v instanceof Node) return "[node " + (v.nodeName || "") + "]";
    if (depth >= MAX_DEPTH) return "[max depth]";
    seen = seen || [];
    if (seen.indexOf(v) !== -1) return "[circular]";
    seen = seen.concat([v]);
    var out, i;
    if (Array.isArray(v)) {
      out = [];
      for (i = 0; i < v.length && i < MAX_ARR; i++) {
        var c = clean(v[i], depth + 1, seen);
        // Firestore forbids nested arrays; wrap them.
        if (Array.isArray(c)) c = { list: c };
        out.push(c === undefined ? null : c);
      }
      if (v.length > MAX_ARR) out.push("[+" + (v.length - MAX_ARR) + " more]");
      return out;
    }
    if (t === "object") {
      if (typeof v.toJSON === "function" && !(v.constructor === Object)) {
        try { return clean(v.toJSON(), depth + 1, seen); } catch (e) { return "[unserialisable]"; }
      }
      out = {};
      var n = 0, k;
      for (k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (n++ >= MAX_KEYS) { out._truncated = true; break; }
        var ck = cleanKey(k);
        if (SENSITIVE.test(k)) { out[ck] = "[REDACTED]"; continue; }
        var cv = clean(v[k], depth + 1, seen);
        if (cv !== undefined) out[ck] = cv;
      }
      return out;
    }
    return undefined;
  }

  /* ---------------------------------------------------------------
     Identity / context
  --------------------------------------------------------------- */
  var visitorId = lget("PL_DL_VID");
  var isNewVisitor = false;
  if (!visitorId) { visitorId = uid(); lset("PL_DL_VID", visitorId); isNewVisitor = true; }

  var sessionId = sget("PL_DL_SID");
  var newSession = false;
  if (!sessionId) { sessionId = uid(); sset("PL_DL_SID", sessionId); newSession = true; }

  var manualUser = null;
  function readUser() {
    if (manualUser) return manualUser;
    var i, u;
    for (i = 0; i < USER_KEYS.length; i++) {
      u = jparse(lget(USER_KEYS[i]));
      if (u && u.email) return { email: String(u.email).toLowerCase(), name: u.name || "", semester: u.semester || "", regNo: u.regNo || "", role: "student" };
    }
    var p = pageInfo().area;
    if (STAFF_KEYS[p]) {
      u = jparse(lget(STAFF_KEYS[p]));
      if (u && (u.email || u.username || u.name)) return { email: String(u.email || u.username || u.name).toLowerCase(), name: u.name || "", role: p };
    }
    return null;
  }

  var _qs = function (s) {
    var o = {};
    try { new URLSearchParams(s).forEach(function (v, k) { o[k] = SENSITIVE.test(k) ? "[REDACTED]" : v; }); } catch (e) { }
    return o;
  };
  function pageInfo() {
    var p = location.pathname, low = p.toLowerCase();
    var area = "shop", sem = null, m;
    if ((m = low.match(/classroom\/semester(\d+)/))) { area = "classroom"; sem = parseInt(m[1], 10); }
    else if (/\/community\//.test(low)) area = "community";
    else if (/admin\.html$/.test(low)) area = "admin";
    else if (/executive\.html$/.test(low)) area = "executive";
    var name = (p.split("/").pop() || "index").replace(/\.html?$/i, "") || "index";
    return { path: p, name: name, area: area, semester: sem, title: document.title || "", query: _qs(location.search), hash: location.hash || "" };
  }

  var seqKey = "PL_DL_SEQ";
  var pageviewId = uid().slice(0, 16);
  function nextSeq() {
    var n = parseInt(sget(seqKey) || "0", 10) + 1;
    sset(seqKey, String(n));
    return n;
  }

  function envelope() {
    var u = readUser();
    var env = {
      schema: VERSION,
      sessionId: sessionId,
      visitorId: visitorId,
      pageviewId: pageviewId,
      seq: nextSeq(),
      clientTs: now(),
      clientIso: new Date().toISOString(),
      page: pageInfo(),
      userKey: u ? emailKey(u.email) : null,
      user: u ? clean(u) : null,
      loggedIn: !!u
    };
    return env;
  }

  /* ---------------------------------------------------------------
     Queue  (persisted per tab so nothing is lost on navigation)
  --------------------------------------------------------------- */
  var QKEY = "PL_DL_Q_" + sessionId;
  var queue = [];
  var flushTimer = null, persistTimer = null, flushing = false;
  var fs = null, fsReady = false;

  function persist() {
    persistTimer = null;
    try {
      var s = JSON.stringify({ t: now(), items: queue });
      while (s.length > 900000 && queue.length > 10) { queue.splice(0, Math.ceil(queue.length / 4)); s = JSON.stringify({ t: now(), items: queue }); }
      lset(QKEY, s);
    } catch (e) { }
  }
  function schedulePersist() { if (!persistTimer) persistTimer = setTimeout(persist, 400); }

  // Pick up queues left behind by tabs that closed before uploading.
  function adoptOrphans() {
    try {
      if (!ls) return;
      var keys = [], i;
      for (i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf("PL_DL_Q_") === 0 && k !== QKEY) keys.push(k); }
      keys.forEach(function (k) {
        var q = jparse(lget(k));
        if (!q || !q.items) { try { ls.removeItem(k); } catch (e) { } return; }
        if (now() - (q.t || 0) < 15000) return; // probably a live tab
        try { ls.removeItem(k); } catch (e) { }
        q.items.forEach(function (it) { queue.push(it); });
      });
    } catch (e) { }
  }

  function enqueue(col, doc) {
    try {
      var item = { c: col, i: now().toString(36) + uid().slice(0, 10), d: doc, a: 0 };
      var size = 0;
      try { size = JSON.stringify(doc).length; } catch (e) { return; }
      if (size > MAX_DOC_BYTES) {
        doc.data = { truncated: true, originalBytes: size };
        doc.payload = doc.payload !== undefined ? { truncated: true, originalBytes: size } : undefined;
        if (doc.payload === undefined) delete doc.payload;
      }
      queue.push(item);
      if (queue.length > QUEUE_CAP) queue.splice(0, queue.length - QUEUE_CAP);
      schedulePersist();
      if (queue.length >= FLUSH_AT) flush();
      else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    } catch (e) { }
  }

  function withServerTime(it) {
    var d = {};
    for (var k in it.d) if (Object.prototype.hasOwnProperty.call(it.d, k)) d[k] = it.d[k];
    d.uploadedAt = firebase.firestore.FieldValue.serverTimestamp();
    return d;
  }

  function flush() {
    flushTimer = null;
    if (!fsReady || flushing || !queue.length) return Promise.resolve();
    flushing = true;
    var batchItems = queue.slice(0, BATCH_MAX);
    var b;
    try {
      b = fs.batch();
      batchItems.forEach(function (it) { b.set(fs.collection(it.c).doc(it.i), withServerTime(it)); });
    } catch (e) { flushing = false; return Promise.resolve(); }
    return b.commit().then(function () {
      removeSent(batchItems);
    }, function () {
      // One bad document fails the whole batch → retry individually.
      return Promise.all(batchItems.map(function (it) {
        return fs.collection(it.c).doc(it.i).set(withServerTime(it)).then(function () { return { it: it, ok: true }; },
          function (err) { return { it: it, ok: false, code: err && err.code }; });
      })).then(function (res) {
        var done = [];
        res.forEach(function (r) {
          if (r.ok) done.push(r.it);
          else {
            r.it.a = (r.it.a || 0) + 1;
            // permanent problems (rules / invalid data) → drop after 2 tries
            if (r.code === "permission-denied" || r.code === "invalid-argument" || r.it.a >= 6) done.push(r.it);
          }
        });
        removeSent(done);
      });
    }).then(function () {
      flushing = false;
      if (queue.length) flushTimer = setTimeout(flush, queue.length >= FLUSH_AT ? 200 : FLUSH_MS);
    }, function () { flushing = false; });
  }
  function removeSent(items) {
    var ids = {};
    items.forEach(function (it) { ids[it.i] = 1; });
    queue = queue.filter(function (it) { return !ids[it.i]; });
    persist();
  }

  /* ---------------------------------------------------------------
     Firestore bootstrap (loads the SDK itself if the page lacks it)
  --------------------------------------------------------------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function bootFirestore() {
    var chain = Promise.resolve();
    if (!window.firebase || !firebase.initializeApp) chain = chain.then(function () { return loadScript(SDK + "firebase-app-compat.js"); });
    chain = chain.then(function () { if (!firebase.firestore) return loadScript(SDK + "firebase-firestore-compat.js"); });
    return chain.then(function () {
      var app;
      try { app = firebase.app(APP_NAME); } catch (e) { app = firebase.initializeApp(FIREBASE_CONFIG, APP_NAME); }
      fs = app.firestore();
      try { fs.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { }
      fsReady = true;
      adoptOrphans();
      flush();
    }).catch(function () { /* offline / blocked: queue stays on disk and is retried next page */ });
  }

  /* ---------------------------------------------------------------
     Core recorders
  --------------------------------------------------------------- */
  var CATEGORY = {
    page_view: "navigation", page_leave: "navigation", page_heartbeat: "navigation", page_hidden: "navigation", page_visible: "navigation", route_change: "navigation",
    click: "interaction", form_submit: "interaction", field_change: "interaction", search_input: "interaction", scroll_depth: "interaction", copy: "interaction", paste: "interaction", cut: "interaction", media: "interaction", impression: "interaction",
    ui_toast: "feedback", ui_alert: "feedback", ui_confirm: "feedback",
    js_error: "error", resource_error: "error", unhandled_rejection: "error",
    api_call: "network", network_status: "network",
    local_state: "state", auth_state: "auth"
  };

  function track(type, data, extra) {
    try {
      var e = envelope();
      e.type = String(type);
      e.category = CATEGORY[type] || (extra && extra.category) || "custom";
      var d = clean(data || {});
      if (d !== undefined) e.data = d;
      enqueue(COL.events, e);
    } catch (err) { }
  }

  function startSession() {
    try {
      var n = navigator, c = n.connection || n.mozConnection || n.webkitConnection || {};
      var visits = parseInt(lget("PL_DL_VISITS") || "0", 10) + 1;
      lset("PL_DL_VISITS", String(visits));
      var doc = envelope();
      doc.type = "session_start";
      doc.startedAt = now();
      doc.isNewVisitor = isNewVisitor;
      doc.visitIndex = visits;
      doc.firstSeenAt = parseInt(lget("PL_DL_FIRST") || "0", 10) || (lset("PL_DL_FIRST", String(now())), now());
      doc.landing = { url: location.href.split("#")[0], referrer: document.referrer || "", utm: (function () { var q = _qs(location.search), o = {}; Object.keys(q).forEach(function (k) { if (/^utm_/i.test(k)) o[k] = q[k]; }); return o; })() };
      doc.device = clean({
        userAgent: n.userAgent, platform: n.platform, vendor: n.vendor, language: n.language, languages: n.languages,
        timezone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })(),
        tzOffsetMin: new Date().getTimezoneOffset(),
        screen: { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight, dpr: window.devicePixelRatio, colorDepth: screen.colorDepth },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        orientation: (screen.orientation && screen.orientation.type) || "",
        touchPoints: n.maxTouchPoints, cores: n.hardwareConcurrency, memoryGB: n.deviceMemory,
        cookies: n.cookieEnabled, doNotTrack: n.doNotTrack,
        online: n.onLine,
        standalone: !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches),
        prefersDark: !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches),
        reducedMotion: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
        connection: { type: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: c.saveData },
        uaData: n.userAgentData ? { mobile: n.userAgentData.mobile, platform: n.userAgentData.platform, brands: n.userAgentData.brands } : null
      });
      enqueue(COL.sessions, doc);
    } catch (e) { }
  }

  /* ---------------------------------------------------------------
     Realtime-Database write / read capture
  --------------------------------------------------------------- */
  var IGNORE_PATH = /^(presence|typing|lastSeen)(\/|$)|^calls\/[^/]+\/(caller|callee)Candidates|^\.info/;
  var DOMAIN = {
    users: "account", UserDeviceInfo: "account", deviceSessions: "account", loginAttempts: "security", adminLoginAttempts: "security", executiveLoginAttempts: "security",
    purchases: "commerce", checkout: "commerce", orders: "commerce", links: "catalog", queries: "support", activity: "activity",
    admin: "staff", executive: "staff",
    chats: "chat", permanentChat: "chat", posts: "social", comments: "social", reactions: "social", reacts: "social",
    stories: "stories", storyArchive: "stories", storyViews: "stories", storyReacts: "stories",
    friends: "social_graph", requests: "social_graph", sent: "social_graph", blocks: "social_graph", blockedBy: "social_graph", reports: "safety",
    notifications: "notifications", groups: "groups", groupMembers: "groups", groupInvites: "groups", groupInvited: "groups",
    calls: "calls", incoming: "calls"
  };
  function normPath(p) { return String(p || "").replace(/^\/+|\/+$/g, ""); }
  function domainOf(path) { var first = normPath(path).split("/")[0]; return DOMAIN[first] || (first ? "other" : "root"); }

  // ref can be a compat/modular Reference, a URL string or a plain path
  function parseRef(ref) {
    var s = "", host = "", path = "";
    try { s = typeof ref === "string" ? ref : (ref && ref.toString ? ref.toString() : ""); } catch (e) { }
    var m = s.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
    if (m) { host = m[1]; try { path = decodeURIComponent(m[2] || ""); } catch (e) { path = m[2] || ""; } }
    else path = s;
    return { host: host, path: normPath(path) };
  }
  function projectOf(host) { return host ? host.split(".")[0].replace(/-default-rtdb$/, "") : ""; }

  function logWrite(op, ref, value, extra) {
    try {
      var r = parseRef(ref);
      if (IGNORE_PATH.test(r.path)) return;
      var doc = envelope();
      doc.type = "db_write";
      doc.op = op;
      doc.db = { host: r.host, project: projectOf(r.host) };
      doc.path = r.path;
      doc.pathParts = r.path ? r.path.split("/").slice(0, 12) : [];
      var domains = {}, touched = null;
      if (op === "update" && value && typeof value === "object") {
        touched = Object.keys(value).slice(0, MAX_KEYS).map(function (k) { return normPath(r.path + "/" + k); });
        touched = touched.filter(function (p) { return !IGNORE_PATH.test(p); });
        if (!touched.length) return;
        touched.forEach(function (p) { domains[domainOf(p)] = 1; });
        doc.touchedPaths = touched;
      } else domains[domainOf(r.path)] = 1;
      doc.domains = Object.keys(domains);
      doc.domain = doc.domains[0] || "other";
      if (op === "remove") { doc.payload = null; doc.deleted = true; }
      else if (value !== undefined) {
        var p = clean(value);
        doc.payload = p === undefined ? null : p;
      }
      if (extra) for (var k in extra) doc[k] = clean(extra[k]);
      enqueue(COL.mutations, doc);
    } catch (e) { }
  }

  var readSeen = {};
  function logRead(op, ref, info) {
    try {
      var r = parseRef(ref);
      if (IGNORE_PATH.test(r.path)) return;
      var key = op + "|" + r.host + "|" + r.path + "|" + (info && info.query || "");
      var t = now();
      if (readSeen[key] && t - readSeen[key] < 5000) return;
      readSeen[key] = t;
      var doc = envelope();
      doc.type = "db_read";
      doc.op = op;
      doc.db = { host: r.host, project: projectOf(r.host) };
      doc.path = r.path;
      doc.domain = domainOf(r.path);
      if (info) { var c = clean(info); if (c) doc.result = c; }
      enqueue(COL.reads, doc);
    } catch (e) { }
  }

  function hookCompatDatabase() {
    try {
      if (!window.firebase || !firebase.database || !firebase.database.Reference) return;
      var R = firebase.database.Reference.prototype;
      if (R.__pldl) return;
      R.__pldl = true;

      var oSet = R.set;
      R.set = function (value) { logWrite("set", this, value); return oSet.apply(this, arguments); };

      var oUpdate = R.update;
      R.update = function (values) { logWrite("update", this, values); return oUpdate.apply(this, arguments); };

      var oRemove = R.remove;
      R.remove = function () { logWrite("remove", this); return oRemove.apply(this, arguments); };

      var oPush = R.push;
      R.push = function (value) {
        var out = oPush.apply(this, arguments);
        if (value !== undefined) { var child = out && out.key; logWrite("push", this, value, { newKey: child || null }); }
        return out;
      };

      if (R.setWithPriority) {
        var oSwp = R.setWithPriority;
        R.setWithPriority = function (value, pr) { logWrite("set", this, value, { priority: pr }); return oSwp.apply(this, arguments); };
      }
      if (R.transaction) {
        var oTx = R.transaction;
        R.transaction = function () { logWrite("transaction", this); return oTx.apply(this, arguments); };
      }

      var Q = firebase.database.Query && firebase.database.Query.prototype;
      if (Q && Q.once) {
        var oOnce = Q.once;
        Q.once = function (eventType) {
          var self = this, p = oOnce.apply(this, arguments);
          try {
            if (p && p.then) p.then(function (snap) {
              try { logRead("once", self, { event: eventType || "value", exists: !!(snap && snap.exists()), children: snap && snap.hasChildren && snap.hasChildren() ? snap.numChildren() : 0 }); } catch (e) { }
            }, function () { });
          } catch (e) { }
          return p;
        };
      }
      if (Q && Q.on) {
        var oOn = Q.on;
        Q.on = function (eventType) { logRead("on", this, { event: eventType }); return oOn.apply(this, arguments); };
      }
    } catch (e) { }
  }

  /* ---------------------------------------------------------------
     DOM description helpers
  --------------------------------------------------------------- */
  function txt(s, n) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n || 120); }
  function isSensitiveField(el) {
    if (!el) return false;
    var t = (el.type || "").toLowerCase();
    if (t === "password") return true;
    var tag = (el.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
    var ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (/^cc-|one-time-code|new-password|current-password/.test(ac)) return true;
    return SENSITIVE.test(el.name || "") || SENSITIVE.test(el.id || "");
  }
  function selectorPath(el) {
    var parts = [], n = 0;
    while (el && el.nodeType === 1 && n < 4 && el !== document.body) {
      var s = el.tagName.toLowerCase();
      if (el.id) s += "#" + el.id;
      else if (el.classList && el.classList.length) s += "." + Array.prototype.slice.call(el.classList, 0, 2).join(".");
      parts.unshift(s); el = el.parentElement; n++;
    }
    return parts.join(" > ");
  }
  function describe(el) {
    var d = {};
    try {
      var tag = el.tagName.toLowerCase();
      d.tag = tag;
      if (el.id) d.id = el.id;
      if (el.className && typeof el.className === "string") d.cls = txt(el.className, 100);
      var role = el.getAttribute("role"); if (role) d.role = role;
      if (el.type) d.type = el.type;
      if (el.name) d.name = el.name;
      var isField = tag === "input" || tag === "textarea" || tag === "select";
      d.text = isField ? txt(el.getAttribute("aria-label") || el.placeholder || el.name || el.id, 80) : txt(el.innerText || el.textContent, 120);
      var al = el.getAttribute("aria-label"); if (al) d.aria = txt(al, 80);
      if (el.title) d.title = txt(el.title, 80);
      if (tag === "a") {
        var href = el.getAttribute("href") || "";
        d.href = txt(href, 400);
        try { var u = new URL(el.href, location.href); d.hrefHost = u.host; d.external = u.host !== location.host; d.hrefPath = u.pathname; } catch (e) { }
        if (el.hasAttribute("download")) d.download = true;
        if (/\.(pdf|docx?|pptx?|xlsx?|zip|rar|epub|mp4|mp3)(\?|#|$)/i.test(href)) d.fileLink = true;
        if (el.target) d.target = el.target;
      }
      var data = {}, n = 0, a;
      for (var i = 0; i < el.attributes.length && n < 14; i++) {
        a = el.attributes[i];
        if (a.name.indexOf("data-") === 0) { data[a.name.slice(5)] = SENSITIVE.test(a.name) ? "[REDACTED]" : txt(a.value, 200); n++; }
      }
      if (n) d.data = data;
      d.path = selectorPath(el);
      var box = el.closest && el.closest("section,article,li,tr,form,.card,.product-card,.syllabus-card,[data-id],[data-product-id]");
      if (box && box !== el) {
        var h = box.querySelector && box.querySelector("h1,h2,h3,h4,h5,.title,strong");
        d.context = txt((h && h.textContent) || "", 100);
        if (box.id) d.contextId = box.id;
      }
    } catch (e) { }
    return d;
  }
  function fieldValue(el) {
    var tag = el.tagName.toLowerCase(), t = (el.type || "").toLowerCase();
    if (isSensitiveField(el)) return "[REDACTED]";
    if (t === "file") return Array.prototype.map.call(el.files || [], function (f) { return { name: f.name, size: f.size, type: f.type }; });
    if (t === "checkbox" || t === "radio") return !!el.checked;
    if (tag === "select") {
      if (el.multiple) return Array.prototype.map.call(el.selectedOptions, function (o) { return o.value; });
      var o = el.selectedOptions && el.selectedOptions[0];
      return { value: el.value, label: o ? txt(o.textContent, 80) : "" };
    }
    return String(el.value == null ? "" : el.value);
  }

  /* ---------------------------------------------------------------
     Automatic listeners
  --------------------------------------------------------------- */
  var pageStart = now();
  var maxScroll = 0, clickCount = 0, lastInteract = now(), activeMs = 0, visibleMs = 0, hiddenAt = 0;
  var scrollMarks = {};
  var leftSent = false;
  var focusAt = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var impressionCount = 0;

  function perfData() {
    var o = {};
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav) o = { type: nav.type, domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd), ttfbMs: Math.round(nav.responseStart), transferBytes: nav.transferSize };
    } catch (e) { }
    return o;
  }

  function onClick(e) {
    try {
      lastInteract = now(); clickCount++;
      var t = e.target;
      if (!t || !t.closest) return;
      var el = t.closest("a,button,input,select,textarea,summary,label,[role=button],[onclick],[data-id],[data-product-id],[data-material],li,.card") || t;
      var d = describe(el);
      if (el !== t && t.tagName) d.clickedTag = t.tagName.toLowerCase();
      d.x = Math.round(e.clientX); d.y = Math.round(e.clientY);
      d.xPct = Math.round(100 * e.clientX / Math.max(1, window.innerWidth));
      d.yPct = Math.round(100 * e.clientY / Math.max(1, window.innerHeight));
      d.pageY = Math.round(window.scrollY + e.clientY);
      d.button = e.button;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) d.modifiers = [e.ctrlKey && "ctrl", e.metaKey && "meta", e.shiftKey && "shift", e.altKey && "alt"].filter(Boolean);
      d.sincePageLoadMs = now() - pageStart;
      track("click", d);
    } catch (err) { }
  }

  function onSubmit(e) {
    try {
      var f = e.target;
      if (!f || f.tagName !== "FORM") return;
      var fields = {};
      Array.prototype.forEach.call(f.elements || [], function (el) {
        var tag = el.tagName.toLowerCase(), t = (el.type || "").toLowerCase();
        if (tag === "button" || t === "submit" || t === "button" || t === "reset" || t === "hidden" && !el.name) return;
        var k = el.name || el.id; if (!k) return;
        if ((t === "radio") && !el.checked) return;
        fields[k] = { type: t || tag, value: fieldValue(el), length: (el.value || "").length };
      });
      track("form_submit", {
        form: { id: f.id || "", name: f.getAttribute("name") || "", action: txt(f.getAttribute("action"), 200), method: (f.method || "").toLowerCase(), cls: txt(f.className, 80) },
        valid: (function () { try { return f.checkValidity(); } catch (er) { return null; } })(),
        fields: fields,
        submitter: e.submitter ? describe(e.submitter) : null
      });
    } catch (err) { }
  }

  var searchTimers = {};
  function isSearchField(el) {
    var s = ((el.type || "") + " " + (el.id || "") + " " + (el.name || "") + " " + (el.placeholder || "") + " " + (el.getAttribute("aria-label") || ""));
    return /search|find|query|filter/i.test(s);
  }
  function onInput(e) {
    try {
      var el = e.target; lastInteract = now();
      if (!el || !el.tagName || isSensitiveField(el)) return;
      if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) || !isSearchField(el)) return;
      var key = el.id || el.name || "q";
      clearTimeout(searchTimers[key]);
      searchTimers[key] = setTimeout(function () {
        if (el.value) track("search_input", { field: describe(el), query: el.value, length: el.value.length });
      }, 900);
    } catch (err) { }
  }
  function onFocusIn(e) { try { if (focusAt && e.target && typeof e.target === "object") focusAt.set(e.target, now()); } catch (er) { } }
  function onChange(e) {
    try {
      var el = e.target; lastInteract = now();
      if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      var d = { field: describe(el), value: fieldValue(el), length: (el.value || "").length };
      var f = focusAt && focusAt.get(el); if (f) d.editMs = now() - f;
      track("field_change", d);
    } catch (err) { }
  }

  function onScroll() {
    try {
      lastInteract = now();
      var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight;
      var pct = h > 0 ? Math.min(100, Math.round(100 * window.scrollY / h)) : 100;
      if (pct > maxScroll) maxScroll = pct;
      [25, 50, 75, 90, 100].forEach(function (m) {
        if (pct >= m && !scrollMarks[m]) { scrollMarks[m] = 1; track("scroll_depth", { depthPct: m, afterMs: now() - pageStart }); }
      });
    } catch (e) { }
  }
  var scrollRaf = 0;
  function onScrollThrottled() { if (scrollRaf) return; scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; onScroll(); }); }

  function pageStats() {
    return { activeMs: activeMs, visibleMs: visibleMs, totalMs: now() - pageStart, maxScrollPct: maxScroll, clicks: clickCount };
  }
  function onLeave(reason) {
    if (leftSent) return; leftSent = true;
    var s = pageStats(); s.reason = reason;
    track("page_leave", s);
    persist(); flush();
  }

  function onClipboard(kind) {
    return function (e) {
      try {
        var el = e.target, d = { field: el && el.tagName ? describe(el) : null };
        if (el && isSensitiveField(el)) { track(kind, d); return; }
        if (kind === "copy" || kind === "cut") {
          var sel = String(window.getSelection ? window.getSelection() : "");
          d.length = sel.length; d.text = sel.slice(0, 500);
        } else {
          var cd = e.clipboardData; var tx = cd ? cd.getData("text") : "";
          d.length = tx.length;
        }
        track(kind, d);
      } catch (err) { }
    };
  }

  function onMedia(e) {
    try {
      var m = e.target; if (!m || !m.tagName || !/^(VIDEO|AUDIO)$/.test(m.tagName)) return;
      track("media", { action: e.type, tag: m.tagName.toLowerCase(), src: txt(m.currentSrc || m.src, 300), t: Math.round(m.currentTime || 0), duration: Math.round(m.duration || 0) || null });
    } catch (err) { }
  }

  function onError(e) {
    try {
      var t = e.target;
      if (t && t !== window && t.tagName) {
        var src = t.src || t.href; if (!src || src.indexOf("datalake") !== -1) return;
        track("resource_error", { tag: t.tagName.toLowerCase(), src: txt(src, 300) });
      } else {
        track("js_error", { message: txt(e.message, 500), file: txt(e.filename, 200), line: e.lineno, col: e.colno, stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1500) : "" });
      }
    } catch (err) { }
  }
  function onRejection(e) {
    try {
      var r = e.reason;
      track("unhandled_rejection", { message: txt(r && (r.message || r), 500), code: r && r.code, stack: r && r.stack ? String(r.stack).slice(0, 1500) : "" });
    } catch (err) { }
  }

  /* ---- toast / alert capture: the site reports outcomes through these ---- */
  var lastToast = { t: "", at: 0 };
  function reportToast(el, text, source) {
    text = txt(text, 300).replace(/^\$\s*/, "");
    if (!text) return;
    var t = now();
    if (lastToast.t === text && t - lastToast.at < 1500) return;
    lastToast = { t: text, at: t };
    track("ui_toast", { message: text, source: source, element: el && el.id ? "#" + el.id : (el && el.className ? txt(el.className, 60) : "") });
  }
  function watchToasts() {
    try {
      var sel = "#toast,.toast,[role=status],[role=alert]";
      var watched = new WeakSet();
      function attach(el) {
        if (watched.has(el)) return; watched.add(el);
        // Only text changes count (class toggles are just the toast hiding again).
        new MutationObserver(function () {
          reportToast(el, el.textContent, "static");
        }).observe(el, { childList: true, characterData: true, subtree: true });
      }
      Array.prototype.forEach.call(document.querySelectorAll(sel), attach);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches(sel)) { reportToast(n, n.textContent, "dynamic"); attach(n); }
            else if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll(sel), function (c) { attach(c); });
          });
        });
      }).observe(document.body, { childList: true });
    } catch (e) { }
  }

  function hookDialogs() {
    try {
      var oA = window.alert, oC = window.confirm;
      window.alert = function (m) { track("ui_alert", { message: txt(m, 500) }); return oA.apply(this, arguments); };
      window.confirm = function (m) { var r = oC.apply(this, arguments); track("ui_confirm", { message: txt(m, 500), result: r }); return r; };
    } catch (e) { }
  }

  /* ---- fetch metadata (never bodies) ---- */
  var SKIP_HOST = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebasedatabase\.app|google\.com|googletagmanager\.com|google-analytics\.com)$/i;
  function hookFetch() {
    try {
      if (!window.fetch) return;
      var oF = window.fetch;
      window.fetch = function (input, init) {
        var url = "", method = "GET", t0 = now(), host = "", skip = false;
        try {
          url = typeof input === "string" ? input : (input && input.url) || "";
          method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
          var u = new URL(url, location.href); host = u.host;
          skip = SKIP_HOST.test(u.hostname);
          url = u.origin + u.pathname;
        } catch (e) { skip = true; }
        var p = oF.apply(this, arguments);
        if (!skip) {
          try {
            p.then(function (r) { track("api_call", { method: method, host: host, url: url, status: r.status, ok: r.ok, durationMs: now() - t0 }); },
              function (er) { track("api_call", { method: method, host: host, url: url, error: txt(er && er.message, 200), durationMs: now() - t0 }); });
          } catch (e) { }
        }
        return p;
      };
    } catch (e) { }
  }

  /* ---- localStorage snapshots (cart, session, preferences ...) ---- */
  var lastLocal = {};
  function hookLocalStorage() {
    try {
      if (!ls) return;
      var oSet = Storage.prototype.setItem, oRem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (k, v) {
        try {
          if (this === ls && !/^(PL_DL_|firebase:|__)/.test(String(k))) {
            var t = now(), last = lastLocal[k];
            if (!last || last.v !== v) {
              lastLocal[k] = { v: v, t: t };
              var parsed = jparse(v);
              track("local_state", { op: "set", key: String(k), value: parsed !== null && typeof parsed === "object" ? parsed : v });
            }
          }
        } catch (e) { }
        return oSet.apply(this, arguments);
      };
      Storage.prototype.removeItem = function (k) {
        try { if (this === ls && !/^(PL_DL_|firebase:|__)/.test(String(k))) { delete lastLocal[k]; track("local_state", { op: "remove", key: String(k) }); } } catch (e) { }
        return oRem.apply(this, arguments);
      };
    } catch (e) { }
  }

  /* ---- impressions: which cards / rows the user actually saw ---- */
  function watchImpressions() {
    try {
      if (!window.IntersectionObserver || pageInfo().area === "community" && pageInfo().name === "chat") return;
      var sel = "[data-product-id],[data-id],.product-card,.syllabus-card,.post,.post-card,.course-card,.timetable-card,.class-card";
      var seen = new WeakSet(), timers = new WeakMap();
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var el = en.target;
          if (en.isIntersecting && en.intersectionRatio >= 0.5) {
            if (timers.has(el)) return;
            timers.set(el, setTimeout(function () {
              if (impressionCount++ < 250) {
                var d = describe(el);
                var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : -1;
                d.index = sib; d.text = txt(el.innerText, 160);
                track("impression", d);
              }
              io.unobserve(el);
            }, 800));
          } else if (timers.has(el)) { clearTimeout(timers.get(el)); timers.delete(el); }
        });
      }, { threshold: [0.5] });
      var scan = function () {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length && i < 400; i++) { if (!seen.has(els[i])) { seen.add(els[i]); io.observe(els[i]); } }
      };
      var t = null;
      new MutationObserver(function () { if (!t) t = setTimeout(function () { t = null; scan(); }, 600); }).observe(document.body, { childList: true, subtree: true });
      scan();
    } catch (e) { }
  }

  function hookHistory() {
    try {
      ["pushState", "replaceState"].forEach(function (fn) {
        var o = history[fn];
        history[fn] = function () {
          var r = o.apply(this, arguments);
          track("route_change", { via: fn, to: location.pathname + location.search + location.hash });
          return r;
        };
      });
      window.addEventListener("hashchange", function (e) { track("route_change", { via: "hashchange", to: location.hash }); });
    } catch (e) { }
  }

  /* ---------------------------------------------------------------
     Wire everything up
  --------------------------------------------------------------- */
  hookCompatDatabase();   // as early as possible: later writes/reads are then all captured
  hookDialogs();
  hookFetch();
  hookLocalStorage();

  function init() {
    try {
      if (newSession) startSession();
      track("page_view", {
        referrer: document.referrer || "",
        newSession: newSession,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        perf: perfData(),
        cartSize: (function () { var c = jparse(lget("PlayLearn_shop_cart_v1")); return c && typeof c === "object" ? Object.keys(c).length : 0; })()
      });

      document.addEventListener("click", onClick, true);
      document.addEventListener("submit", onSubmit, true);
      document.addEventListener("input", onInput, true);
      document.addEventListener("change", onChange, true);
      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("copy", onClipboard("copy"), true);
      document.addEventListener("cut", onClipboard("cut"), true);
      document.addEventListener("paste", onClipboard("paste"), true);
      ["play", "pause", "ended", "seeked"].forEach(function (n) { document.addEventListener(n, onMedia, true); });
      window.addEventListener("scroll", onScrollThrottled, { passive: true });
      ["keydown", "pointerdown", "touchstart", "mousemove"].forEach(function (n) { window.addEventListener(n, function () { lastInteract = now(); }, { passive: true, capture: true }); });
      window.addEventListener("error", onError, true);
      window.addEventListener("unhandledrejection", onRejection);
      window.addEventListener("online", function () { track("network_status", { online: true }); flush(); });
      window.addEventListener("offline", function () { track("network_status", { online: false }); });
      window.addEventListener("pagehide", function () { onLeave("pagehide"); });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") { hiddenAt = now(); track("page_hidden", pageStats()); persist(); flush(); }
        else { track("page_visible", { hiddenForMs: hiddenAt ? now() - hiddenAt : 0 }); leftSent = false; }
      });

      setInterval(function () {
        if (document.visibilityState !== "visible") return;
        visibleMs += 1000;
        if (now() - lastInteract < 30000) activeMs += 1000;
        if (visibleMs % 60000 === 0) track("page_heartbeat", pageStats());
      }, 1000);

      watchToasts();
      watchImpressions();
      hookHistory();
    } catch (e) { }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  bootFirestore();

  window.PLDL = {
    version: VERSION,
    sessionId: sessionId,
    visitorId: visitorId,
    track: track,
    dbWrite: logWrite,
    identify: function (u) { manualUser = u && u.email ? { email: String(u.email).toLowerCase(), name: u.name || "", semester: u.semester || "", regNo: u.regNo || "", role: u.role || "student" } : null; },
    flush: flush
  };
})();
