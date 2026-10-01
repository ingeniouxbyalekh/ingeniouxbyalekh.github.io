// 24-hour stories: photo / video / text. Reactions, replies (sent to chat), viewers list, hold-to-pause.
// Also: text fonts + colours, draggable emoji stickers, share a post to your story, a personal archive
// (watch / share again), story rings on avatars, and a Stories tab on your profile.
// Data: /stories/<id>, /storyViews/<id>/<uid> = ts, /storyReacts/<id>/<uid> = emoji, /storyArchive/<uid>/<id> = copy of my story
(function () {
  const $ = (id) => document.getElementById(id);
  const { db, https } = Auth, TS = firebase.database.ServerValue.TIMESTAMP, DAY = 864e5, KEY = "OUTR_seen_stories", DUR = 5000;
  const EM = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
  const BG = ["linear-gradient(135deg,#667eea,#764ba2)", "linear-gradient(135deg,#f093fb,#f5576c)", "linear-gradient(135deg,#4facfe,#00c6fb)",
    "linear-gradient(135deg,#43e97b,#0f9b6e)", "linear-gradient(135deg,#fa709a,#fee140)", "linear-gradient(135deg,#232526,#414345)",
    "linear-gradient(135deg,#f7971e,#d9480f)", "linear-gradient(135deg,#2743e0,#0b1a6e)"];
  // text story fonts / colours and emoji stickers (stored as small numbers / emoji, see database.rules.json)
  const FONTS = ["var(--hf),system-ui,sans-serif", "Georgia,'Times New Roman',serif", "ui-monospace,Menlo,Consolas,monospace",
    "'Brush Script MT','Segoe Script','Comic Sans MS',cursive", "Impact,'Arial Narrow Bold',sans-serif"];
  const COL = ["#ffffff", "#111111", "#ffe066", "#ff8fab", "#8ce99a", "#74c0fc"];
  const STK = ["😀", "😂", "😍", "🔥", "❤️", "👍", "🎉", "✨", "😎", "🥳", "😭", "🤔", "💯", "📚", "🎓", "☕", "🎮", "🎵", "⭐", "🙌"];
  const SZ = [8, 13, 20], MAXSTK = 6;                      // sticker sizes in % of the story width
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const btn = (x, fn, c) => { const b = el("button", c || "btn sm", x); b.type = "button"; b.onclick = fn; return b; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? ((s / 60) | 0) + "m ago" : ((s / 3600) | 0) + "h ago"; };
  const when = (t) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const toast = (t) => { const d = el("div", "toast", t); document.body.append(d); setTimeout(() => d.remove(), 1800); };
  const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch (e) { return new Set(); } })();
  const saveSeen = () => { try { localStorage.setItem(KEY, JSON.stringify([...seen].slice(-300))); } catch (e) {} };
  const ok = (s) => !!s && (s.mediaType === "text" ? !!s.text : https(s.mediaUrl));
  const COLORS = ["#2743e0", "#c2410c", "#db2777", "#9333ea", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];
  const face = (e, name, photo) => {                       // UI.face lives on the home page; other pages get this fallback
    if (window.UI && UI.face) return UI.face(e, name, photo);
    let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    e.style.background = COLORS[h % COLORS.length]; e.textContent = "";
    const src = https(photo), letter = String(name || "?")[0].toUpperCase();
    if (!src) { e.textContent = letter; return; }
    const i = new Image(); i.alt = ""; i.referrerPolicy = "no-referrer"; i.onerror = () => { i.remove(); e.textContent = letter; }; i.src = src; e.append(i);
  };
  const stkOf = (s) => Object.values((s && s.stickers) || {}).filter((k) => k && typeof k.e === "string" && isFinite(k.x) && isFinite(k.y)).slice(0, MAXSTK);
  const textFx = (n, s) => { n.style.fontFamily = FONTS[s.font | 0] || FONTS[0]; n.style.color = COL[s.color | 0] || COL[0]; };

  let me, ctx, data = {}, arch = {}, loaded = false, shown = false, sig = "", pick, ov, cm, G, gi, si, raf = 0, last = 0, elapsed = 0, fill = null, vid = null, mutedPref = false, pendingSid = null, ringRaf = 0;
  const paused = new Set(), rings = new Set(), subs = [];
  const fire = () => subs.forEach((f) => { try { f(); } catch (e) {} });

  function groups() {                                  // one entry per person, you first
    const by = {};
    Object.entries(data).forEach(([id, s]) => {
      if (Date.now() - s.ts < DAY && ok(s) && !Safety.hidden(s.uid) && (s.uid === me.id || ctx.friends().has(s.uid))) (by[s.uid] = by[s.uid] || []).push([id, s]);
    });
    return Object.entries(by).map(([uid, list]) => ({ uid, list: list.sort((a, b) => a[1].ts - b[1].ts) }))
      .sort((a, b) => (a.uid === me.id ? -1 : b.uid === me.id ? 1 : b.list[b.list.length - 1][1].ts - a.list[a.list.length - 1][1].ts));
  }

  /* ---------- rings on avatars ---------- */
  // Stories.ring(avatarElement, uid): adds a coloured ring when that person has a story you can watch; tapping the avatar opens it.
  function refreshRings() {
    ringRaf = 0; if (!me || !ctx) return;
    const st = {}; groups().forEach((g) => (st[g.uid] = g.list.every(([id]) => seen.has(id)) ? "seen" : "new"));
    rings.forEach((e) => {
      const s = st[e._sr]; e.classList.toggle("sring", !!s); e.classList.toggle("sring-seen", s === "seen");
    });
    if (rings.size > 300) rings.forEach((e) => { if (!e.isConnected) rings.delete(e); });
  }
  const scheduleRings = () => { if (!ringRaf) ringRaf = requestAnimationFrame(refreshRings); };
  function ring(e, uid) {
    if (!e || !uid) return e;
    e._sr = uid;
    if (!e._srOn) {
      e._srOn = 1;
      e.addEventListener("click", (ev) => { if (e.classList.contains("sring")) { ev.stopImmediatePropagation(); ev.preventDefault(); openUser(e._sr); } }, true);
    }
    rings.add(e); scheduleRings(); return e;
  }

  function sticks(s) {                                 // read-only sticker layer for the viewer
    const L = el("div", "slayer");
    stkOf(s).forEach((k) => { const n = el("span", "stkr", k.e); n.style.left = clamp(+k.x, 0, 100) + "%"; n.style.top = clamp(+k.y, 0, 100) + "%"; n.style.fontSize = SZ[clamp(k.s | 0, 0, 2)] + "cqw"; L.append(n); });
    return L;
  }

  function paint(show) {
    if (show !== undefined) shown = show;
    tryPending();
    const box = $("stories"); if (!box) return;
    box.hidden = !shown; if (!shown) return;
    const gs = groups(), s2 = gs.map((g) => g.uid + g.list.map(([id]) => id + (seen.has(id) ? 1 : 0)).join()).join("|");
    if (s2 === sig) return;
    sig = s2; box.textContent = "";
    const add = el("button", "stile add"); add.type = "button"; add.append(el("div", "plus", "+"), el("div", "", "Add story"));
    add.onclick = chooser; box.append(add);
    gs.forEach((g, i) => {
      const last = g.list[g.list.length - 1][1], m = ctx.member(g.uid) || last, t = el("div", "stile" + (g.list.every(([id]) => seen.has(id)) ? " seen" : ""));
      let v;
      if (last.mediaType === "text") { v = el("div", "tbg", last.text); v.style.background = BG[last.bg | 0] || BG[0]; textFx(v, last); }
      else {
        v = document.createElement(last.mediaType === "video" ? "video" : "img"); v.src = last.mediaUrl;
        if (v.tagName === "VIDEO") { v.muted = true; v.preload = "metadata"; } else { v.alt = ""; v.referrerPolicy = "no-referrer"; v.loading = "lazy"; }
      }
      const a = el("span", "av"); face(a, m.username, m.photoUrl);
      t.append(v, a, el("b", "", g.uid === me.id ? "Your story" : m.username)); t.onclick = () => open(i); box.append(t);
    });
    scheduleRings();
  }

  /* ---------- viewer ---------- */
  function mount() { ov = el("div", "sv"); document.body.append(ov); document.addEventListener("keydown", key); view(); }
  function open(g, idx) {
    if (ov || cm) return;
    G = groups(); if (!G[g]) return; gi = g;
    si = idx != null ? idx : Math.max(0, G[gi].list.findIndex(([id]) => !seen.has(id))); mount();
  }
  function openUser(uid, idx) { const i = groups().findIndex((g) => g.uid === uid); if (i >= 0) open(i, idx); }
  function openStory(sid) {                            // jump straight to one story (notifications, chat rings)
    if (ov || cm) return false;
    const gs = groups(), i = gs.findIndex((g) => g.list.some(([id]) => id === sid)); if (i < 0) return false;
    G = gs; gi = i; si = G[i].list.findIndex(([id]) => id === sid); mount(); return true;
  }
  function watchArchive(list, idx) {                   // play my archived stories (oldest -> newest)
    if (ov || cm) return;
    G = [{ uid: me.id, list, archive: true }]; gi = 0; si = idx || 0; mount();
  }
  function tryPending() { if (pendingSid && loaded && !ov && !cm && openStory(pendingSid)) pendingSid = null; }
  function close() { cancelAnimationFrame(raf); if (ov) ov.remove(); ov = null; vid = null; document.removeEventListener("keydown", key); sig = ""; paint(); scheduleRings(); }
  function key(e) {
    if (e.key === "Escape") return close();
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") next(); else if (e.key === "ArrowLeft") prev();
  }
  function next() {
    if (si < G[gi].list.length - 1) { si++; view(); }
    else if (gi < G.length - 1) { gi++; si = Math.max(0, G[gi].list.findIndex(([id]) => !seen.has(id))); view(); }
    else close();
  }
  function prev() { if (si > 0) si--; else if (gi > 0) { gi--; si = 0; } view(); }
  function setPause(k, on) {
    on ? paused.add(k) : paused.delete(k);
    if (vid) paused.size ? vid.pause() : vid.play().catch(() => {});
  }
  function loop(t) {
    if (!ov) return;
    if (last && !paused.size) elapsed += t - last;
    last = t; fill.style.width = Math.min(100, (elapsed / DUR) * 100) + "%";
    if (elapsed >= DUR) return next();
    raf = requestAnimationFrame(loop);
  }

  async function react(id, s, e, b) {
    try {
      await db.ref(`storyReacts/${id}/${me.id}`).set(e);
      b.parentNode.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      window.Notify && Notify.push(s.uid, "story", { sid: id, emoji: e }, `sr_${id}_${me.id}`); toast(e + " sent");
    } catch (x) { toast("Couldn't send reaction"); }
  }
  async function reply(id, s, inp) {
    const t = inp.value.trim(); if (!t) return; inp.value = "";
    const cid = [me.id, s.uid].sort().join("__"), key2 = db.ref("chats/" + cid + "/messages").push().key;
    const snip = s.mediaType === "text" ? s.text : s.caption || (s.mediaType === "video" ? "🎬 Story" : "📷 Story");
    const payload = { from: me.id, text: t.slice(0, 2000), ts: TS, replyTo: { id: "story_" + id, text: ("Story · " + snip).slice(0, 300), fromName: (ctx.member(s.uid) || s).username || "Story" } };
    try {
      await db.ref().update({ [`chats/${cid}/messages/${key2}`]: payload, [`permanentChat/${cid}/messages/${key2}`]: payload });
      toast("Reply sent"); inp.blur();
    } catch (x) { inp.value = t; toast("Reply not sent. Try again."); }
  }
  function viewers(stage, id, views, reacts) {
    setPause("panel", true);
    const p = el("div", "spanel"), h = el("div", "row"), list = el("ul", "list");
    const done = () => { p.remove(); setPause("panel", false); };
    h.append(el("b", "grow", "Viewers"), btn("✕", done, "btn sm ghost")); p.append(h, list);
    const ids = [...new Set([...Object.keys(views), ...Object.keys(reacts)])].sort((a, b) => (views[b] || 0) - (views[a] || 0));
    if (!ids.length) list.append(el("li", "muted pad", "No views yet."));
    ids.forEach((u) => {
      const m = ctx.member(u) || {}, li = el("li", "member"), a = el("span", "av"), t = el("div", "grow");
      face(a, m.username, m.photoUrl); t.append(el("b", "", m.username || "Someone"), el("small", "", views[u] ? ago(views[u]) : ""));
      li.append(a, t); if (reacts[u]) li.append(el("span", "", reacts[u])); list.append(li);
    });
    p.onclick = (e) => e.stopPropagation(); stage.append(p);
  }
  async function repost(s) {                           // put an archived story back on my story (new 24 h)
    const rec = { uid: me.id, username: me.username, photoUrl: me.photoUrl, mediaType: s.mediaType, ts: TS };
    ["mediaUrl", "text", "bg", "font", "color", "caption", "shared"].forEach((k) => { if (s[k] != null) rec[k] = s[k]; });
    const k = stkOf(s); if (k.length) rec.stickers = k;
    try { await db.ref("stories").push(rec); toast("Shared to your story"); } catch (e) { toast("Couldn't share it again"); }
  }
  const openPost = (pid) => (ctx && ctx.openPost ? ctx.openPost(pid) : (location.href = "index.html?p=" + encodeURIComponent(pid)));

  function view() {
    cancelAnimationFrame(raf); paused.clear(); elapsed = 0; last = 0; vid = null; ov.textContent = "";
    const g = G[gi], [id, s] = g.list[si], mine = g.uid === me.id, isArch = !!g.archive, m = ctx.member(g.uid) || s, first = !seen.has(id);
    if (!isArch) { seen.add(id); saveSeen(); scheduleRings(); if (!mine && first) db.ref(`storyViews/${id}/${me.id}`).set(TS).catch(() => {}); }
    const st = el("div", "sst"), bars = el("div", "sbars"), fills = [];
    g.list.forEach((_, i) => { const b = el("i"), f = el("b"); if (i < si) f.style.width = "100%"; b.append(f); bars.append(b); fills.push(f); });
    fill = fills[si];
    const h = el("div", "shead"), a = el("span", "av sm"), t = el("div", "grow");
    face(a, m.username, m.photoUrl); t.append(el("b", "", m.username), el("small", "", isArch ? when(s.ts) : ago(s.ts))); h.append(a, t);
    let media;
    if (s.mediaType === "video") {
      media = vid = el("video"); media.src = s.mediaUrl; media.playsInline = true; media.autoplay = true; media.muted = mutedPref;
      media.onended = next; media.onerror = next;
      media.ontimeupdate = () => (fill.style.width = (media.currentTime / (media.duration || 1)) * 100 + "%");
      media.play().catch(() => { media.muted = true; media.play().catch(() => {}); });
      const mu = el("button", "sx", media.muted ? "🔇" : "🔊"); mu.title = "Sound";
      mu.onclick = () => { media.muted = !media.muted; mutedPref = media.muted; mu.textContent = media.muted ? "🔇" : "🔊"; }; h.append(mu);
    } else {
      if (s.mediaType === "text") { media = el("div", "stext"); media.style.background = BG[s.bg | 0] || BG[0]; textFx(media, s); media.append(el("span", "", s.text)); }
      else { media = el("img"); media.alt = ""; media.referrerPolicy = "no-referrer"; media.src = s.mediaUrl; }
      raf = requestAnimationFrame(loop);
    }
    if (mine) {
      const d = el("button", "sx", "🗑"); d.title = isArch ? "Remove from archive" : "Delete story";
      d.onclick = () => {
        if (!confirm(isArch ? "Remove this story from your archive?" : "Delete this story?")) return;
        const u = { [`storyArchive/${me.id}/${id}`]: null };
        if (!isArch) Object.assign(u, { ["stories/" + id]: null, ["storyViews/" + id]: null, ["storyReacts/" + id]: null });
        db.ref().update(u).then(close);
      };
      h.append(d);
    }
    const x = el("button", "sx", "✕"); x.onclick = close; h.append(x);
    // tap left/right to go back/forward; press and hold to pause
    const snap = el("div", "snap");
    [prev, next].forEach((fn) => {
      const z = el("span"); let held = false, tm = 0;
      z.onpointerdown = () => { held = false; tm = setTimeout(() => { held = true; setPause("hold", true); }, 220); };
      z.onpointerup = () => { clearTimeout(tm); const was = held; held = false; if (was) setPause("hold", false); else fn(); };
      z.onpointercancel = z.onpointerleave = () => { clearTimeout(tm); if (held) { held = false; setPause("hold", false); } };
      snap.append(z);
    });
    st.append(media, sticks(s), snap, bars, h);
    if (s.shared && s.shared.pid) {
      const c = btn("📌 Post by " + (s.shared.name || "someone") + " · View", () => { close(); openPost(s.shared.pid); }, "sshare");
      st.append(c);
    }
    if (s.caption) st.append(el("div", "scap" + (mine ? " m" : ""), s.caption));
    const bot = el("div", "sbot"); st.append(bot);
    if (mine && isArch) bot.append(btn("↻ Share again", () => { repost(s); close(); }, "sviews"));
    else if (mine) {
      const vb = el("button", "sviews", "👁 …");
      Promise.all([db.ref("storyViews/" + id).once("value"), db.ref("storyReacts/" + id).once("value")]).then(([v, r]) => {
        const views = v.val() || {}, reacts = r.val() || {}, n = new Set([...Object.keys(views), ...Object.keys(reacts)]).size;
        vb.textContent = "👁 " + n + (n === 1 ? " viewer" : " viewers") + (Object.keys(reacts).length ? " · " + Object.keys(reacts).length + " reactions" : "");
        vb.onclick = () => viewers(st, id, views, reacts);
      }).catch(() => (vb.textContent = "👁 Viewers"));
      bot.append(vb);
    } else {
      const rx = el("div", "srx"), rep = el("div", "srep"), inp = el("input");
      EM.forEach((e) => { const b = el("button", "", e); b.type = "button"; b.onclick = () => react(id, s, e, b); rx.append(b); });
      db.ref(`storyReacts/${id}/${me.id}`).once("value").then((v) => { const c = v.val(); if (c) [...rx.children].forEach((b) => b.classList.toggle("on", b.textContent === c)); }).catch(() => {});
      inp.placeholder = "Reply to " + String(m.username || "").split(" ")[0] + "…"; inp.maxLength = 300;
      inp.onfocus = () => setPause("typing", true); inp.onblur = () => setPause("typing", false);
      inp.onkeydown = (e) => { if (e.key === "Enter") reply(id, s, inp); };
      rep.append(inp, btn("Send", () => reply(id, s, inp))); bot.append(rx, rep);
    }
    ov.append(st);
  }

  /* ---------- create ---------- */
  async function upload(file) {
    const fd = new FormData(); fd.append("file", file); fd.append("upload_preset", CFG.cloud.preset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CFG.cloud.name}/auto/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("upload");
    const j = await r.json(), url = https(j.secure_url); if (!url) throw new Error("upload");
    return { url, type: j.resource_type === "video" ? "video" : "image" };
  }
  // o: { kind:"media", file | (url, type) } or { kind:"text", text? }; optional o.shared = { pid, name } for a shared post
  function compose(o) {
    if (cm || ov) return;
    const text = o.kind === "text";
    let bg = o.shared ? 1 : 0, font = 0, color = 0, sel = -1, busy = false, obj = "", stk = [], ta, cap, media;
    cm = el("div", "sv");
    const st = el("div", "sst comp"), layer = el("div", "slayer"), bar = el("div", "scbar");
    const dirty = () => stk.length || (ta && ta.value.trim()) || (cap && cap.value.trim());
    const finish = () => { document.removeEventListener("keydown", esc); if (obj) URL.revokeObjectURL(obj); cm.remove(); cm = null; };
    const cancel = () => { if (busy) return; if (dirty() && !confirm("Discard this story?")) return; finish(); };
    const esc = (e) => { if (e.key === "Escape") cancel(); };
    const mark = (box, i) => [...box.children].forEach((c, j) => c.classList.toggle("on", j === i));

    if (text) {
      media = el("div", "stext"); media.style.background = BG[bg];
      ta = el("textarea"); ta.maxLength = 200; ta.rows = 1; ta.placeholder = "Type something…"; ta.value = (o.text || "").slice(0, 200);
      const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
      ta.oninput = fit; media.append(ta); setTimeout(() => { fit(); ta.focus(); }, 0);
    } else {
      if (o.file) obj = URL.createObjectURL(o.file);
      const v = (o.file ? o.file.type.startsWith("video/") : o.type === "video");
      media = document.createElement(v ? "video" : "img"); media.src = obj || o.url;
      if (v) { media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true; media.play().catch(() => {}); } else { media.alt = ""; media.referrerPolicy = "no-referrer"; }
    }

    // stickers: tap one in the tray to add it, drag to move, then resize / delete it from the bar
    const selBox = el("div", "row");
    function tools() {
      selBox.textContent = "";
      if (sel < 0) return;
      const sz = (d) => { stk[sel].s = clamp(stk[sel].s + d, 0, 2); drawStk(); };
      selBox.append(btn("−", () => sz(-1), "ftn"), btn("＋", () => sz(1), "ftn"), btn("🗑", () => { stk.splice(sel, 1); sel = -1; drawStk(); tools(); }, "ftn"));
    }
    function drawStk() {
      layer.textContent = "";
      stk.forEach((k, i) => {
        const n = el("span", "stkr" + (i === sel ? " on" : ""), k.e);
        n.style.left = k.x + "%"; n.style.top = k.y + "%"; n.style.fontSize = SZ[k.s] + "cqw";
        n.onpointerdown = (ev) => {
          ev.preventDefault(); sel = i; mark(layer, i); tools(); n.setPointerCapture(ev.pointerId);
          const r = st.getBoundingClientRect();
          n.onpointermove = (e2) => { k.x = clamp(((e2.clientX - r.left) / r.width) * 100, 4, 96); k.y = clamp(((e2.clientY - r.top) / r.height) * 100, 8, 80); n.style.left = k.x + "%"; n.style.top = k.y + "%"; };
          n.onpointerup = n.onpointercancel = () => { n.onpointermove = null; };
        };
        layer.append(n);
      });
    }
    const addStk = (e) => {
      if (stk.length >= MAXSTK) return toast("Up to " + MAXSTK + " stickers");
      stk.push({ e, x: 36 + (stk.length % 3) * 14, y: 34 + (stk.length % 4) * 9, s: 1 }); sel = stk.length - 1; drawStk(); tools();
    };
    st.addEventListener("pointerdown", (e) => { if (sel >= 0 && !e.target.closest(".stkr,.scbar")) { sel = -1; mark(layer, -1); tools(); } });

    // options
    const opts = el("div", "scopts");
    if (text) {
      const sw = el("div", "swatches"), fr = el("div", "row"), cr = el("div", "swatches");
      BG.forEach((b, i) => { const s = el("button", "sw" + (i === bg ? " on" : "")); s.type = "button"; s.title = "Background"; s.style.background = b; s.onclick = () => { bg = i; media.style.background = b; mark(sw, i); }; sw.append(s); });
      FONTS.forEach((f, i) => { const b = el("button", "ftn" + (i === font ? " on" : ""), "Aa"); b.type = "button"; b.title = "Font"; b.style.fontFamily = f; b.onclick = () => { font = i; media.style.fontFamily = f; mark(fr, i); }; fr.append(b); });
      COL.forEach((c, i) => { const s = el("button", "sw" + (i === color ? " on" : "")); s.type = "button"; s.title = "Text colour"; s.style.background = c; s.onclick = () => { color = i; media.style.color = c; mark(cr, i); }; cr.append(s); });
      const r2 = el("div", "row"); r2.append(fr, cr); opts.append(sw, r2);
    } else {
      cap = el("input"); cap.placeholder = "Add a caption…"; cap.maxLength = 150; opts.append(cap);
    }
    const tray = el("div", "stray"); tray.hidden = true;
    STK.forEach((e) => { const b = el("button", "", e); b.type = "button"; b.onclick = () => addStk(e); tray.append(b); });

    const go = btn("Share to story", async () => {
      if (busy) return;
      const rec = { uid: me.id, username: me.username, photoUrl: me.photoUrl, ts: TS };
      if (text) { const t = ta.value.trim(); if (!t) return ta.focus(); Object.assign(rec, { mediaType: "text", text: t, bg, font, color }); }
      else { const c = cap.value.trim().slice(0, 150); if (c) rec.caption = c; }
      if (stk.length) rec.stickers = stk.map((k) => ({ e: k.e, x: Math.round(k.x * 10) / 10, y: Math.round(k.y * 10) / 10, s: k.s }));
      if (o.shared) rec.shared = o.shared;
      busy = true; go.disabled = true; go.textContent = text ? "Posting…" : "Uploading…";
      try {
        if (!text) { const up = o.file ? await upload(o.file) : { url: o.url, type: o.type }; rec.mediaUrl = up.url; rec.mediaType = up.type; }
        const id = db.ref("stories").push().key;
        await db.ref().update({ ["stories/" + id]: rec, [`storyArchive/${me.id}/${id}`]: rec });   // archive copy = watch / share again later
        finish(); toast("Story posted"); sig = ""; paint();
      } catch (e) { busy = false; go.disabled = false; go.textContent = "Share to story"; alert("Couldn't post your story. Try again."); }
    });
    const act = el("div", "row sact"), left = el("div", "row"), right = el("div", "row"), stb = btn("😊", () => (tray.hidden = !tray.hidden), "ftn"); stb.title = "Stickers";
    left.append(stb, selBox); right.append(btn("Cancel", cancel, "btn sm ghost"), go); act.append(left, right);
    bar.append(opts, tray, act);
    st.append(media, layer, bar); cm.append(st); document.body.append(cm); document.addEventListener("keydown", esc);
  }
  function startMedia(file) {
    const v = file.type.startsWith("video/");
    if (!v && !file.type.startsWith("image/")) return alert("Choose an image or video.");
    if (file.size > (v ? 30 : 10) * 1048576) return alert(v ? "Videos must be under 30 MB." : "Images must be under 10 MB.");
    compose({ kind: "media", file });
  }
  function chooser() {
    const { card, close } = Safety.dialog("Create a story");
    card.append(btn("📷  Photo or video", () => { close(); pick.click(); }, "btn full"), btn("✏️  Text story", () => { close(); compose({ kind: "text" }); }, "btn full ghost"));
  }
  function sharePost(k, p, name) {                     // "Story" button on a post
    if (!me) return;
    const shared = { pid: k, name: String(name || "").slice(0, 100) }, u = https(p.mediaUrl);
    if (u) compose({ kind: "media", url: u, type: p.mediaType === "video" ? "video" : "image", shared });
    else compose({ kind: "text", text: p.caption || "", shared });
  }

  /* ---------- profile "Stories" tab: live stories + archive ---------- */
  function thumb(s) {
    const t = el("div", "sth");
    if (s.mediaType === "text") { const v = el("div", "tbg", s.text); v.style.background = BG[s.bg | 0] || BG[0]; textFx(v, s); t.append(v); }
    else {
      const v = document.createElement(s.mediaType === "video" ? "video" : "img"); v.src = s.mediaUrl;
      if (s.mediaType === "video") { v.muted = true; v.preload = "metadata"; } else { v.alt = ""; v.referrerPolicy = "no-referrer"; v.loading = "lazy"; }
      t.append(v);
    }
    return t;
  }
  function pane(root) {
    if (!me) return;
    const live = Object.entries(data).filter(([, s]) => s.uid === me.id && Date.now() - s.ts < DAY && ok(s)).sort((a, b) => a[1].ts - b[1].ts);
    const asc = Object.entries(arch).filter(([, s]) => ok(s)).sort((a, b) => a[1].ts - b[1].ts), desc = asc.slice().reverse();
    const top = el("div", "box nomt"), r = el("div", "row");
    r.append(el("h3", "grow", "Your stories"), btn("＋ New story", chooser));
    top.append(r, el("p", "muted", "Stories disappear after 24 hours. Everything you post is kept in your archive so you can watch it again or share it again.")); root.append(top);
    const sec = (title, items, mk, empty) => {
      const b = el("div", "box"); b.append(el("h3", "", title));
      if (!items.length) b.append(el("p", "muted", empty));
      else { const g = el("div", "sgrid"); items.forEach((it, i) => g.append(mk(it, i))); b.append(g); }
      root.append(b);
    };
    sec("Live now", live, ([, s], i) => {
      const c = el("div", "sc2"), t = thumb(s); t.onclick = () => openUser(me.id, i);
      c.append(t, el("small", "muted", ago(s.ts))); return c;
    }, "No live stories. Share one and it will show up here for 24 hours.");
    sec("Archive", desc, ([id, s]) => {
      const c = el("div", "sc2"), t = thumb(s), i = asc.findIndex(([x]) => x === id), acts = el("div", "row");
      t.onclick = () => watchArchive(asc, i); if (data[id] && Date.now() - data[id].ts < DAY) t.append(el("span", "slive", "LIVE"));
      const re = btn("↻ Reshare", () => repost(s), "btn sm ghost"); re.title = "Share again to your story"; acts.append(re, btn("🗑", () => confirm("Remove this story from your archive?") && db.ref(`storyArchive/${me.id}/${id}`).remove(), "btn sm ghost"));
      c.append(t, el("small", "muted", when(s.ts)), acts); return c;
    }, "Nothing here yet. New stories you post are saved automatically.");
  }

  window.Stories = {
    paint, ring, pane, compose, sharePost, openStory, openUser,
    on: (f) => subs.push(f),
    sig: () => Object.keys(data).join() + "|" + Object.keys(arch).join(),
    // ctx: { friends: () => Set, member: (id) => user record, openPost?: (postId) => void }
    start(p, c) {
      me = p; ctx = c;
      pick = el("input"); pick.type = "file"; pick.accept = "image/*,video/*"; pick.hidden = true;
      pick.onchange = () => { if (pick.files[0]) startMedia(pick.files[0]); pick.value = ""; };
      document.body.append(pick);
      const u = new URLSearchParams(location.search), sid = u.get("s");           // ?s=<storyId>: open that story (from chat rings)
      if (sid) { pendingSid = sid; u.delete("s"); history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); setTimeout(() => (pendingSid = null), 8000); }
      db.ref("stories").orderByChild("ts").startAt(Date.now() - DAY).on("value", (s) => { data = s.val() || {}; loaded = true; sig = ""; paint(); scheduleRings(); fire(); });
      db.ref("storyArchive/" + me.id).limitToLast(60).on("value", (s) => { arch = s.val() || {}; fire(); }, () => {});
      db.ref("stories").orderByChild("ts").endAt(Date.now() - DAY).once("value")   // tidy up my own expired stories (they stay in the archive)
        .then((s) => s.forEach((c) => { if (c.val().uid === me.id) db.ref().update({ ["stories/" + c.key]: null, ["storyViews/" + c.key]: null, ["storyReacts/" + c.key]: null }); })).catch(() => {});
    }
  };
})();
