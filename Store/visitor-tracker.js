/**
 * INGENIOUX Shop — visitor tracking (index.html only)
 * ---------------------------------------------------------------
 * Writes into the SHARED ingenioux-visitor database (the same one
 * the main INGENIOUX site and Admin panel use) — NOT the store's
 * own ingenioux-store database that auth.js talks to. Runs once per
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
 * Loaded as a plain (non-module) script, so it uses the same
 * firebase-*-compat SDK already on this page for auth.js — no
 * extra <script> tags needed beyond this file itself.
 */

(function () {
  if (typeof firebase === "undefined") {
    console.error("Visitor tracker: Firebase SDK not loaded — add the firebase-app-compat / firebase-database-compat <script> tags before visitor-tracker.js.");
    return;
  }

  const VISITOR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBFkN8erxsvRRAwMipQu7xZGLeXsQu9E_w",
    authDomain: "ingenioux-visitor.firebaseapp.com",
    databaseURL: "https://ingenioux-visitor-default-rtdb.firebaseio.com",
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
  const dbVisitor = firebase.database(visitorApp);

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
      const totalResult = await withTimeout(
        dbVisitor.ref("TotalVisitors/count").transaction((current) => (current || 0) + 1),
        10000
      );
      const visitorNumber = totalResult.committed ? totalResult.snapshot.val() : null;

      // Store-only tally, kept separate from the site-wide total.
      await withTimeout(
        dbVisitor.ref("store/count").transaction((current) => (current || 0) + 1),
        10000
      );

      await withTimeout(
        dbVisitor.ref("visitors").push({
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
          page: location.pathname + location.search,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
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
