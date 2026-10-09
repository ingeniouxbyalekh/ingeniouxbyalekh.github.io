// Session + profile. Uses the shop login (localStorage) and the shop /users record.
(function () {
  const shopApp = firebase.initializeApp(CFG.shop, "shop");
  const comApp = firebase.initializeApp(CFG.community, "community");
  const shopDb = shopApp.database();
  const db = comApp.database();

  const keyOf = (e) => String(e).trim().toLowerCase().replace(/\./g, ",");
  const https = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");

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

  window.Auth = { db, shopDb, keyOf, https, session, profile };
})();
