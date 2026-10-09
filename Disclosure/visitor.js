/* Disclosure visitor tracking -> ingenioux-visitor Firestore (same project as the main site, Blogs and Admin).
   On visit (once per browser tab session):
     - TotalVisitors/count  +1   (also becomes the visitor's sequential number)
     - visitors/<auto id>        (same record shape as every other page, read by the main Admin visitors table)
   On an article page (/Articles/<slug>.html), once per article per session:
     - articles/<slug> {count +1, title (write-once)}   (read by Disclosure Admin -> Top Articles)
   Article pages show the live count in #vc; listing pages feed window.ARTICLE_VIEWS to the cards.
   Logging never breaks the page. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, collection, addDoc, getDoc, onSnapshot, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const visitorFirebaseConfig = {
  apiKey: "AIzaSyBFkN8erxsvRRAwMipQu7xZGLeXsQu9E_w",
  authDomain: "ingenioux-visitor.firebaseapp.com",
  projectId: "ingenioux-visitor",
  storageBucket: "ingenioux-visitor.firebasestorage.app",
  messagingSenderId: "426646415346",
  appId: "1:426646415346:web:38373322949588eb14ed6b"
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

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

const fmtViews = n => n === 1 ? "1 view" : n.toLocaleString("en-IN") + " views";
const flag = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };

(async function trackDisclosureVisit() {
  try {
    const app = getApps().find(a => a.name === "visitor") || initializeApp(visitorFirebaseConfig, "visitor");
    const dbVisitor = getFirestore(app);

    // ---- 1. site-wide total + visitor record (once per tab session for the Disclosure site) ----
    const VISIT_FLAG = "ingenioux_disclosure_visit_logged";
    if (!flag(VISIT_FLAG)) {
      let geo = {};
      try {
        const geoData = await (await withTimeout(fetch("https://ipwho.is/"), 6000)).json();
        if (geoData && geoData.success !== false) {
          geo = {
            ip: geoData.ip || null, city: geoData.city || null, region: geoData.region || null,
            country: geoData.country || null, countryCode: geoData.country_code || null, postal: geoData.postal || null,
            latitude: geoData.latitude ?? null, longitude: geoData.longitude ?? null,
            timezone: (geoData.timezone && geoData.timezone.id) || null,
            isp: (geoData.connection && (geoData.connection.isp || geoData.connection.org)) || null
          };
        }
      } catch (e) { console.warn("Disclosure geolocation lookup failed:", e); }

      const ua = navigator.userAgent, device = parseUserAgent(ua);
      const visitorNumber = await withTimeout(runTransaction(dbVisitor, async tx => {
        const r = doc(dbVisitor, "TotalVisitors", "count");
        const snap = await tx.get(r);
        const n = snap.exists() ? (snap.data().count || 0) + 1 : 1;   // rules: create at 1 or bump by exactly 1
        tx.set(r, { count: n });
        return n;
      }), 10000);
      await withTimeout(addDoc(collection(dbVisitor, "visitors"), {
        visitorNumber, ...geo, userAgent: ua,
        browser: device.browser, os: device.os, deviceType: device.deviceType,
        screen: `${screen.width}x${screen.height}`, viewport: `${innerWidth}x${innerHeight}`,
        language: navigator.language || null, referrer: document.referrer || "direct",
        page: (location.hostname + location.pathname).replace(/\/$/, "") + location.search,
        createdAt: serverTimestamp()
      }), 10000);
      flag(VISIT_FLAG, "1");
    }

    // ---- 2. per-article count (article pages only, once per article per session) ----
    if (/\/Articles\/[^/]+\.html?$/i.test(location.pathname)) {
      const slug = decodeURIComponent(location.pathname.split("/").pop()).replace(/\.html?$/i, "");
      const ARTICLE_FLAG = "ingenioux_article_visit_logged_" + slug;
      const show = n => { const el = document.getElementById("vc"); if (el) { el.textContent = fmtViews(n); el.hidden = false; } };
      if (!flag(ARTICLE_FLAG)) {
        const h = document.querySelector("h1.title, .post-title, h1");
        const title = ((h && h.textContent.trim()) || document.title || slug).slice(0, 200);
        const n = await withTimeout(runTransaction(dbVisitor, async tx => {
          const r = doc(dbVisitor, "articles", slug);
          const snap = await tx.get(r);
          const count = snap.exists() ? (snap.data().count || 0) + 1 : 1;
          // title is write-once (rules): keep the stored one, only set it on first create
          tx.set(r, { count, title: snap.exists() ? snap.data().title : title });
          return count;
        }), 10000);
        flag(ARTICLE_FLAG, "1");
        show(n);
      } else {
        const snap = await withTimeout(getDoc(doc(dbVisitor, "articles", slug)), 10000);
        show(snap.exists() ? snap.data().count || 0 : 0);
      }
    } else if (document.getElementById("artAll") || document.getElementById("homeArts")) {
      // ---- 3. listing pages: live view counts for the article cards (script.js reads window.ARTICLE_VIEWS) ----
      onSnapshot(collection(dbVisitor, "articles"), s => {
        const m = {}; s.forEach(d => { m[d.id] = d.data().count || 0; });
        window.ARTICLE_VIEWS = m;
        window.dispatchEvent(new Event("articleviews"));
      }, e => console.warn("Article view counts unavailable:", e));
    }
  } catch (err) {
    console.warn("Disclosure visitor logging failed:", err);
  }
})();
