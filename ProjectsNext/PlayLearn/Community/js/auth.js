// Session + profile. Uses the shop login (localStorage) and the shop /users record.
(function () {
  const shopApp = firebase.initializeApp(CFG.shop, "shop");
  const comApp = firebase.initializeApp(CFG.community, "community");
  const shopDb = shopApp.database();
  const db = comApp.database();

  const keyOf = (e) => String(e).trim().toLowerCase().replace(/\./g, ",");
  const https = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");


  // Public profile id: a one-way SHA-256 of the email key, shown in URLs instead of the email.
  // The database still stores everything under the email key; pages map the id back to it.
  function sha256(str) {
    const m = unescape(encodeURIComponent(str)), K = [], H = [];
    const rr = (v, n) => (v >>> n) | (v << (32 - n));
    for (let c = 2, n = 0; n < 64; c++) {
      let prime = true;
      for (let d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
      if (!prime) continue;
      if (n < 8) H[n] = (Math.pow(c, 1 / 2) % 1) * 4294967296 | 0;
      K[n++] = (Math.pow(c, 1 / 3) % 1) * 4294967296 | 0;
    }
    const w = [], bits = m.length * 8;
    for (let i = 0; i < m.length; i++) w[i >> 2] |= m.charCodeAt(i) << (24 - (i % 4) * 8);
    w[bits >> 5] |= 0x80 << (24 - (bits % 32));
    w[(((bits + 64) >> 9) << 4) + 15] = bits;
    for (let j = 0; j < w.length; j += 16) {
      const x = new Array(64);
      for (let i = 0; i < 16; i++) x[i] = w[j + i] | 0;
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        if (i >= 16) {
          const s0 = rr(x[i - 15], 7) ^ rr(x[i - 15], 18) ^ (x[i - 15] >>> 3);
          const s1 = rr(x[i - 2], 17) ^ rr(x[i - 2], 19) ^ (x[i - 2] >>> 10);
          x[i] = (x[i - 16] + s0 + x[i - 7] + s1) | 0;
        }
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + x[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      const o = [a, b, c, d, e, f, g, h];
      for (let i = 0; i < 8; i++) H[i] = (H[i] + o[i]) | 0;
    }
    return H.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
  }
  const pubId = (key) => sha256("outr-community|" + key).slice(0, 20);

  function session() {
    try {
      const u = JSON.parse(localStorage.getItem(CFG.sessionKey));
      return u && u.email ? u : null;
    } catch (e) { return null; }
  }

  // Name, reg. no., semester and photo for the signed-in student (null = not logged in).
  async function profile() {
    const s = session();
    if (!s) return null;
    let rec = {};
    try { rec = (await shopDb.ref("users/" + keyOf(s.email)).once("value")).val() || {}; } catch (e) {}
    return {
      id: keyOf(s.email),
      email: s.email,
      username: String(rec.name || s.name || "").trim() || s.email.split("@")[0],
      regNo: String(rec.regNo || s.regNo || ""),
      semester: String(rec.semester || s.semester || ""),
      photoUrl: https(rec.photoUrl || s.photoUrl)
    };
  }

  window.Auth = { db, shopDb, keyOf, https, pubId, session, profile };
})();
