// Notifications: /notifications/<uid>/<id>. Bell + dropdown in the header.
(function () {
  const $ = (id) => document.getElementById(id);
  const { db, https } = Auth, TS = firebase.database.ServerValue.TIMESTAMP;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? ((s / 60) | 0) + "m ago" : s < 86400 ? ((s / 3600) | 0) + "h ago" : ((s / 86400) | 0) + "d ago"; };
  const TXT = {
    react: (n) => "reacted " + (n.emoji || "👍") + " to your post",
    comment: (n) => "commented: “" + (n.text || "") + "”",
    request: () => "sent you a friend request",
    accept: () => "accepted your friend request",
    story: (n) => "reacted " + (n.emoji || "👍") + " to your story",
    group: (n) => "invited you to join the group “" + (n.gname || "") + "”"
  };
  let me, items = {}, onPick = () => {};
  const path = (id) => "notifications/" + me.id + (id ? "/" + id : "");

  function render() {
    const list = Object.entries(items).filter(([, n]) => TXT[n.type] && !Safety.hidden(n.from)).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    const unread = list.filter(([, n]) => !n.read);
    $("b-bell").hidden = !unread.length; $("b-bell").textContent = unread.length > 9 ? "9+" : unread.length;
    const p = $("npanel"); p.textContent = "";
    const h = el("div", "sh"); h.append(el("h3", "", "Notifications"));
    if (unread.length) { const m = el("button", "link", "Mark all read"); m.onclick = () => { const u = {}; unread.forEach(([id]) => (u[path(id) + "/read"] = true)); db.ref().update(u); }; h.append(m); }
    p.append(h);
    if (!list.length) return p.append(el("p", "muted pad", "No notifications yet."));
    list.forEach(([id, n]) => {
      const row = el("div", "nt" + (n.read ? "" : " un")), a = el("span", "av"), t = el("div", "grow"), b = el("b", "", n.fromName || "Someone");
      UI.face(a, n.fromName, n.photoUrl);
      t.append(b, el("span", "", " " + TXT[n.type](n)), el("small", "", ago(n.ts || Date.now())));
      row.append(a, t);
      row.onclick = () => { $("npanel").hidden = true; if (!n.read) db.ref(path(id) + "/read").set(true); onPick(n); };
      p.append(row);
    });
  }

  window.Notify = {
    start(p, pick) {
      me = p; onPick = pick;
      $("bell").onclick = (e) => { e.stopPropagation(); $("npanel").hidden = !$("npanel").hidden; $("menu").hidden = true; };
      document.addEventListener("click", (e) => { if (!e.target.closest("#npanel,#bell")) $("npanel").hidden = true; });
      db.ref(path()).orderByChild("ts").limitToLast(30).on("value", (s) => { items = s.val() || {}; render(); });
    },
    as: (p) => { me = p; },                         // pages without a bell (profile) can still send notifications
    repaint: () => me && render(),
    // to: uid. id: optional fixed id (re-sending replaces the old one instead of piling up)
    push(to, type, extra, id) {
      if (!me || !to || to === me.id || Safety.hidden(to)) return;
      const rec = Object.assign({ type, from: me.id, fromName: me.username, photoUrl: me.photoUrl, ts: TS, read: false }, extra || {});
      db.ref("notifications/" + to + "/" + (id || db.ref().push().key)).set(rec).catch(() => {});
    }
  };
})();
