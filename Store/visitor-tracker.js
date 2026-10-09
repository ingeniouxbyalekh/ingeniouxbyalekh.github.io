/**
 * INGENIOUX Shop — visitor tracking (index.html only)
 * ---------------------------------------------------------------
 * Writes into the SHARED ingenioux-visitor Firestore (the same one
 * the main INGENIOUX site and Admin panel use) — NOT the store's
 * own ingenioux-store Realtime Database that auth.js talks to. Runs once per
 * browser tab/session, same guard pattern as the main site:
 *
 *   - Bumps the shared TotalVisitors/count (site-wide total, same
 *     counter the main site and Admin page also bump).
 *   - Bumps a store-only store/count counter, kept separate so you
 *     can see store traffic apart from the rest of the site.
 *   - Pushes a full visitor record into visitors/, same shape as
 *     everywhere else, so it shows up in the Admin panel's
 *     Visitors table alongside main-site and admin-page visits.
 *
 * Loaded as a plain (non-module) script, so it uses the
 * firebase-*-compat SDKs already on this page (app + firestore,
 * alongside the database/auth ones auth.js needs).
 */

(function () {
  if (typeof firebase === "undefined") {
    console.error("Visitor tracker: Firebase SDK not loaded — add the firebase-app-compat / firebase-firestore-compat <script> tags before visitor-tracker.js.");
    return;
  }

  const VISITOR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBFkN8erxsvRRAwMipQu7xZGLeXsQu9E_w",
    authDomain: "ingenioux-visitor.firebaseapp.com",
    projectId: "ingenioux-visitor",
    storageBucket: "ingenioux-visitor.firebasestorage.app",
    messagingSenderId: "426646415346",
    appId: "1:426646415346:web:38373322949588eb14ed6b",
  };

  // Named app so this doesn't collide with the store's own default
  // Firebase app (ingenioux-store) initialized by auth.js.
  const visitorApp = firebase.apps.some((a) => a.name === "ingeniouxVisitor")
    ? firebase.app("ingeniouxVisitor")
    : firebase.initializeApp(VISITOR_FIREBASE_CONFIG, "ingeniouxVisitor");
  const dbVisitor = firebase.firestore(visitorApp);

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }

  function parseUserAgent(ua) {
    let browser = "Unknown";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\//.test(ua)) browser = "Opera";
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

    let os = "Unknown";
    if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) os = "macOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Linux/.test(ua)) os = "Linux";

    let deviceType = "Desktop";
    if (/iPad|Tablet/.test(ua)) deviceType = "Tablet";
    else if (/Mobi|Android/.test(ua)) deviceType = "Mobile";

    return { browser, os, deviceType };
  }

  (async function logStoreVisit() {
    try {
      // Only once per browser tab/session — refreshes and in-page nav won't inflate the counts.
      if (sessionStorage.getItem("ingenioux_store_visit_logged")) return;

      let geo = {};
      try {
        const geoRes = await withTimeout(fetch("https://ipwho.is/"), 6000);
        const geoData = await geoRes.json();
        if (geoData && geoData.success !== false) {
          geo = {
            ip: geoData.ip || null,
            city: geoData.city || null,
            region: geoData.region || null,
            country: geoData.country || null,
            countryCode: geoData.country_code || null,
            postal: geoData.postal || null,
            latitude: geoData.latitude ?? null,
            longitude: geoData.longitude ?? null,
            timezone: (geoData.timezone && geoData.timezone.id) || null,
            isp: (geoData.connection && (geoData.connection.isp || geoData.connection.org)) || null,
          };
        }
      } catch (geoErr) {
        console.warn("Store visitor geolocation lookup failed:", geoErr);
      }

      const ua = navigator.userAgent;
      const device = parseUserAgent(ua);

      // Site-wide total — same counter the main site and Admin page bump.
      const visitorNumber = await withTimeout(
        dbVisitor.runTransaction(async (tx) => {
          const r = dbVisitor.collection("TotalVisitors").doc("count");
          const snap = await tx.get(r);
          const n = snap.exists ? (snap.data().count || 0) + 1 : 1; // rules: create at 1 or bump by exactly 1
          tx.set(r, { count: n });
          return n;
        }),
        10000
      );

      // Store-only tally, kept separate from the site-wide total.
      await withTimeout(
        dbVisitor.runTransaction(async (tx) => {
          const r = dbVisitor.collection("store").doc("count");
          const snap = await tx.get(r);
          tx.set(r, { count: snap.exists ? (snap.data().count || 0) + 1 : 1 });
        }),
        10000
      );

      await withTimeout(
        dbVisitor.collection("visitors").add({
          visitorNumber,
          ...geo,
          userAgent: ua,
          browser: device.browser,
          os: device.os,
          deviceType: device.deviceType,
          screen: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          language: navigator.language || null,
          referrer: document.referrer || "direct",
          page: (location.hostname + location.pathname).replace(/\/$/, '') + location.search,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }),
        10000
      );

      sessionStorage.setItem("ingenioux_store_visit_logged", "1");
    } catch (err) {
      // Never let visitor logging break the store page for a real visitor.
      console.warn("Store visitor logging failed:", err);
    }
  })();
})();
