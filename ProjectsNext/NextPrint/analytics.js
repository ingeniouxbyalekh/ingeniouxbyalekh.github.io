/* ============================================================
   NextPrint — visitor tracking
   ------------------------------------------------------------
   Logs a record for every page landing (IP address, ISP,
   city/region/country, page, device info, referrer) to the
   Firebase Realtime Database, and keeps simple visit counters.

   Data written:
     visitors/<push-id>   -> one record per landing
     stats/totalVisits    -> running total across all pages
     stats/pageViews/<page> -> running total for that page

   Include this AFTER firebase-app-compat.js, firebase-database-
   compat.js and config.js on any page you want tracked. It is
   safe to include on a page that has already called
   firebase.initializeApp() itself (e.g. printrequest.html) —
   it detects that and reuses the existing app/database instead
   of initializing a second time.

   Uses ipwho.is (no API key, HTTPS, CORS-enabled) to resolve
   the visitor's IP into ISP/location details. If that lookup
   fails (offline, blocked by an ad-blocker, etc.) the visit is
   still logged and counted, just without the geo fields.
   ============================================================ */

(function () {
  'use strict';

  function getPageName() {
    if (document.body && document.body.dataset && document.body.dataset.page) {
      return document.body.dataset.page;
    }
    var file = location.pathname.split('/').pop() || 'index.html';
    return file.replace(/\.html?$/i, '') || 'index';
  }

  function dig(obj, path) {
    try {
      return path.split('.').reduce(function (o, k) {
        return (o === null || o === undefined) ? undefined : o[k];
      }, obj);
    } catch (e) {
      return undefined;
    }
  }

  async function fetchGeoInfo() {
    try {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) return {};
      const data = await res.json();
      if (!data || data.success === false) return {};
      return {
        ip: data.ip || null,
        city: data.city || null,
        region: data.region || null,
        country: data.country || null,
        countryCode: data.country_code || null,
        isp: dig(data, 'connection.isp') || null,
        org: dig(data, 'connection.org') || null,
        asn: dig(data, 'connection.asn') || null,
        timezone: dig(data, 'timezone.id') || null,
        latitude: (data.latitude !== undefined) ? data.latitude : null,
        longitude: (data.longitude !== undefined) ? data.longitude : null,
      };
    } catch (err) {
      console.warn('NextPrint analytics: IP/location lookup failed, logging without it.', err);
      return {};
    }
  }

  async function trackVisit() {
    if (typeof firebase === 'undefined' || typeof CONFIG === 'undefined') {
      console.warn('NextPrint analytics: firebase or CONFIG not loaded, skipping visitor log.');
      return;
    }

    var db;
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(CONFIG.firebase);
      }
      db = firebase.database();
    } catch (err) {
      console.warn('NextPrint analytics: could not initialize Firebase.', err);
      return;
    }

    const page = getPageName();
    const geo = await fetchGeoInfo();

    const visit = Object.assign({
      page: page,
      url: location.href,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
      language: navigator.language || null,
      screen: (window.screen ? (window.screen.width + 'x' + window.screen.height) : null),
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    }, geo);

    db.ref('visitors').push(visit).catch(function (err) {
      console.warn('NextPrint analytics: failed to save visitor record.', err);
    });

    db.ref('stats/totalVisits').transaction(function (current) {
      return (current || 0) + 1;
    }).catch(function (err) {
      console.warn('NextPrint analytics: failed to update total visit counter.', err);
    });

    db.ref('stats/pageViews/' + page).transaction(function (current) {
      return (current || 0) + 1;
    }).catch(function (err) {
      console.warn('NextPrint analytics: failed to update per-page visit counter.', err);
    });
  }

  trackVisit();
})();
