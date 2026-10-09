// Block + report. Needs Auth (js/auth.js) and css/style.css. Used by index.html and profile.html.
(function () {
  const { db, https } = Auth, TS = firebase.database.ServerValue.TIMESTAMP;
  const COLORS = ["#2743e0", "#c2410c", "#db2777", "#9333ea", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];
  const colorFor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const btn = (x, fn, c) => { const b = el("button", c || "btn sm", x); b.type = "button"; b.onclick = fn; return b; };
  const fail = () => { alert("Something went wrong. Check your connection and try again."); return false; };
  function face(e, name, photo) {
    e.style.background = colorFor(name); e.textContent = "";
    const src = https(photo), letter = String(name || "?")[0].toUpperCase();
    if (!src) { e.textContent = letter; return; }
    const i = new Image(); i.alt = ""; i.referrerPolicy = "no-referrer";
    i.onerror = () => { i.remove(); e.textContent = letter; };
    i.src = src; e.append(i);
  }
  function dialog(title) {
    const ov = el("div", "overlay"), card = el("div", "card sf");
    card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "true");
    card.append(el("h2", "", title)); ov.append(card);
    const esc = (e) => e.key === "Escape" && close();
    const close = () => { ov.remove(); document.removeEventListener("keydown", esc); };
    document.addEventListener("keydown", esc);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    document.body.append(ov);
    return { card, close };
  }

  let me = null, mine = new Set(), theirs = new Set(), change = () => {};
  const S = (window.Safety = {
    dialog,
    hidden: (id) => mine.has(id) || theirs.has(id),   // blocked either way
    isBlocked: (id) => mine.has(id),                  // I blocked them
    blockedMe: (id) => theirs.has(id),                // they blocked me
    ready: null,
    start(p, cb) {
      me = p; change = cb || change;
      let n = 0, done; S.ready = new Promise((r) => (done = r));
      const watch = (path, set) => { let first = true; db.ref(path).on("value", (s) => { set(new Set(Object.keys(s.val() || {}))); if (first) { first = false; if (++n === 2) done(); } change(); }); };
      watch("blocks/" + me.id, (v) => (mine = v));
      watch("blockedBy/" + me.id, (v) => (theirs = v));
    },
    async block(id, name, quiet) {
      if (!quiet && !confirm(`Block ${name || "this person"}?\n\nYou won't see each other's posts or comments, and you'll be unfriended.`)) return false;
      try {
        await db.ref().update({
          [`blocks/${me.id}/${id}`]: TS, [`blockedBy/${id}/${me.id}`]: true,
          [`friends/${me.id}/${id}`]: null, [`friends/${id}/${me.id}`]: null,
          [`requests/${me.id}/${id}`]: null, [`requests/${id}/${me.id}`]: null,
          [`sent/${me.id}/${id}`]: null, [`sent/${id}/${me.id}`]: null
        });
        return true;
      } catch (e) { return fail(); }
    },
    async unblock(id) {
      try { await db.ref().update({ [`blocks/${me.id}/${id}`]: null, [`blockedBy/${id}/${me.id}`]: null }); return true; } catch (e) { return fail(); }
    },

    // o: { type: "user" | "post" | "comment", uid, name, postId?, commentId? }
    report(o) {
      const { card, close } = dialog(o.type === "user" ? "Report " + (o.name || "this profile") : "Report this " + o.type);
      card.append(el("p", "muted", "Tell us what's wrong. Reports are private."));
      let reason = ""; const send = btn("Submit report"), opts = el("div", "opts"); send.disabled = true;
      ["Spam", "Harassment or bullying", "Inappropriate content", "Hate speech", "Fake account or impersonation", "Something else"].forEach((r) => {
        const l = el("label", "opt"), i = el("input"); i.type = "radio"; i.name = "reason";
        i.onchange = () => { reason = r; send.disabled = false; };
        l.append(i, el("span", "", r)); opts.append(l);
      });
      const ta = el("textarea"); ta.maxLength = 300; ta.placeholder = "Add details (optional)";
      card.append(opts, ta);
      let also = null;
      if (o.uid !== me.id && !mine.has(o.uid)) {
        const l = el("label", "opt"); also = el("input"); also.type = "checkbox";
        l.append(also, el("span", "", "Also block " + (o.name || "this person"))); card.append(l);
      }
      const r = el("div", "row"); r.append(el("span", "grow"), btn("Cancel", close, "btn sm ghost"), send); card.append(r);
      send.onclick = async () => {
        send.disabled = true; send.textContent = "Sending…";
        const rec = { by: me.id, byName: me.username, type: o.type, target: o.uid, reason, ts: TS };
        if (o.postId) rec.postId = o.postId;
        if (o.commentId) rec.commentId = o.commentId;
        if (ta.value.trim()) rec.details = ta.value.trim();
        try { await db.ref("reports").push(rec); } catch (e) { send.disabled = false; send.textContent = "Submit report"; return fail(); }
        if (also && also.checked) await S.block(o.uid, o.name, true);
        card.textContent = "";
        card.append(el("h2", "", "Report sent"), el("p", "muted", "Thanks for letting us know. We'll review it."), btn("Done", close, "btn sm full"));
      };
    },

    // Blocked users list with Unblock
    async list() {
      const { card, close } = dialog("Blocked users");
      const note = el("p", "muted", "Loading…"), box = el("ul", "list");
      card.append(note, box, btn("Close", close, "btn sm ghost full"));
      const ids = [...mine];
      if (!ids.length) { note.textContent = "You haven't blocked anyone."; return; }
      const recs = await Promise.all(ids.map((id) => db.ref("users/" + id).once("value").then((s) => ({ id, ...(s.val() || {}) })).catch(() => ({ id }))));
      note.textContent = "Blocked people can't see your posts or comments, and you can't see theirs.";
      recs.sort((a, b) => String(a.username || "").localeCompare(String(b.username || ""))).forEach((m) => {
        const li = el("li", "member"), a = el("span", "av"), t = el("div", "grow");
        face(a, m.username, m.photoUrl);
        t.append(el("b", "", m.username || "Unknown user"), el("small", "", m.regNo || ""));
        li.append(a, t, btn("Unblock", async (e) => {
          e.target.disabled = true;
          if (await S.unblock(m.id)) { li.remove(); if (!box.children.length) note.textContent = "You haven't blocked anyone."; } else e.target.disabled = false;
        }, "btn sm ghost"));
        box.append(li);
      });
    }
  });
})();
