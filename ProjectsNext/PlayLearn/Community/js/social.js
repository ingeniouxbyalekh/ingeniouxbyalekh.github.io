// Home screen: nav panels, friends, suggestions, posts, likes, comments, saved.
(function () {
  const $ = (id) => document.getElementById(id);
  const { db, https } = Auth;
  const TS = firebase.database.ServerValue.TIMESTAMP;
  const members = new Map(), online = new Set(), friends = new Set(), incoming = new Set(), sent = new Set(), saved = new Set(), posts = new Map(), els = {};
  let likes = {}, comments = {}, reactions = {}, groups = {}, gmembers = {}, myInv = {}, invited = {}, gid = "", pid = "", me, tab = "", mode = "all", qv = "", lastSig = "", raf = 0;
  const RX = { like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢" }, RL = { like: "Like", love: "Love", haha: "Haha", wow: "Wow", sad: "Sad" };
  const GT = { semester: "Semester group", subject: "Subject group", club: "Club" };

  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const ava = (m, c) => { const a = el("span", c || "av"); UI.face(a, m.username, m.photoUrl); return a; };
  const btn = (x, fn, c) => { const b = el("button", c || "btn sm", x); b.onclick = fn; return b; };
  const people = () => [...members].map(([id, m]) => ({ id, ...m })).filter((m) => m.username && https(m.photoUrl) && !Safety.hidden(m.id));
  const run = (u) => db.ref().update(u).then(() => true, (e) => { alert("Something went wrong (" + ((e && (e.code || e.message)) || "unknown error") + "). If this says PERMISSION_DENIED, publish the new database.rules.json in Firebase. Otherwise check your connection."); return false; });
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? ((s / 60) | 0) + "m ago" : s < 86400 ? ((s / 3600) | 0) + "h ago" : ((s / 86400) | 0) + "d ago"; };
  const byOnline = (a, b) => (online.has(b.id) - online.has(a.id)) || a.username.localeCompare(b.username);

  const A = {
    add: (id) => run({ [`requests/${id}/${me.id}`]: TS, [`sent/${me.id}/${id}`]: true }).then((ok) => ok && Notify.push(id, "request", {}, "q_" + me.id)),
    cancel: (id) => run({ [`requests/${id}/${me.id}`]: null, [`sent/${me.id}/${id}`]: null, [`notifications/${id}/q_${me.id}`]: null }),
    accept: (id) => run({ [`friends/${me.id}/${id}`]: TS, [`friends/${id}/${me.id}`]: TS, [`requests/${me.id}/${id}`]: null, [`sent/${id}/${me.id}`]: null }).then((ok) => ok && Notify.push(id, "accept", {}, "a_" + me.id)),
    decline: (id) => run({ [`requests/${me.id}/${id}`]: null, [`sent/${id}/${me.id}`]: null }),
    unfriend: (id) => confirm("Remove this friend?") && run({ [`friends/${me.id}/${id}`]: null, [`friends/${id}/${me.id}`]: null })
  };
  function action(m) {
    if (friends.has(m.id)) return el("span", "tag", "Friends");
    if (incoming.has(m.id)) return btn("Accept", () => A.accept(m.id));
    if (sent.has(m.id)) return btn("Requested ✕", () => A.cancel(m.id), "btn sm ghost");
    return btn("Add friend", () => A.add(m.id));
  }
  function row(m, extra, stack) {                    // stack: put the buttons under the name so the full name fits
    const li = el("li", "member"), box = el("div", "grow"), a = ava(m), nm = el("b", "", m.username);
    Stories.ring(a, m.id); nm.title = m.username; nm.className = "lnk"; nm.onclick = a.onclick = (e) => { e.stopPropagation(); location.href = "profile.html?u=" + Auth.pubId(m.id); }; a.classList.add("lnk");
    box.append(nm, el("small", "", [m.regNo, m.semester].filter(Boolean).join(" · ")));
    if (online.has(m.id)) a.append(el("i", "dot"));
    if (stack) { const bar = el("div", "stk"); bar.append(...extra); box.append(bar); li.append(a, box); }
    else li.append(a, box, ...extra);
    if (!li.onclick) { li.classList.add("lnk"); li.onclick = (e) => { if (!e.target.closest("button,a")) location.href = "profile.html?u=" + Auth.pubId(m.id); }; }
    return li;
  }

  /* ---- views: home (feed) and the friends page ---- */
  let view = "home", sect = "home";
  const hl = document.querySelector(".hl");
  const suggested = () => people().filter((m) => m.id !== me.id && !friends.has(m.id) && !incoming.has(m.id))
    .sort((a, b) => ((b.semester === me.semester) - (a.semester === me.semester)) || byOnline(a, b));
  const frs = () => people().filter((m) => friends.has(m.id)).sort(byOnline);

  function mark() {
    const on = (sel, f) => document.querySelectorAll(sel).forEach((b) => b.classList.toggle("on", f));
    on('[data-go="home"]', view === "home" && mode === "all");
    on('[data-go="saved"]', view === "home" && mode === "saved");
    on('[data-go="groups"]', view === "groups" || (view === "home" && mode === "group"));
    on('[data-go="fr-home"]', view === "friends" && sect !== "req");
    on('[data-go="fr-req"]', view === "friends" && sect === "req");
    document.querySelectorAll("[data-s]").forEach((b) => b.classList.toggle("on", b.dataset.s === sect));
  }
  function go(t) {
    if (t === "home" || t === "saved") { view = "home"; mode = t === "saved" ? "saved" : "all"; }
    else if (t === "groups") view = "groups";
    else if (t.startsWith("g:")) { view = "home"; mode = "group"; gid = t.slice(2); }
    else if (t.startsWith("p:")) { view = "home"; mode = "post"; pid = t.slice(2); }
    else { view = "friends"; sect = t.slice(3); }
    if (mode !== "post" && mode !== "group" && /[?&][pg]=/.test(location.search)) history.replaceState(null, "", location.pathname);
    $("home").hidden = view !== "home"; $("friends").hidden = view !== "friends"; $("groups").hidden = view !== "groups";
    closeSearch(); $("menu").hidden = true;
    window.scrollTo(0, 0); mark(); paint();
  }

  /* ---- search: dropdown under the search box ---- */
  function closeSearch() { hl.classList.remove("open"); $("sres").hidden = true; $("hq").blur(); }
  function search() {
    if (!hl.classList.contains("open")) return;
    const box = $("sres"); box.hidden = false; box.textContent = "";
    const none = (t) => box.append(el("li", "muted pad", t));
    const q = $("hq").value.trim().toLowerCase();
    if (!q) return none("Search by name or registration number.");
    const r = people().filter((m) => m.id !== me.id && (m.username + " " + (m.regNo || "")).toLowerCase().includes(q)).slice(0, 8);
    r.length ? r.forEach((m) => box.append(row(m, [action(m)]))) : none("No people found.");
  }

  /* ---- friends page: photo cards ---- */
  function pcard(m, btns) {
    const c = el("div", "pc"), im = el("div", "pimg"), b = el("div", "pb");
    UI.face(im, m.username, m.photoUrl);
    const info = [m.regNo, m.semester].filter(Boolean).join(" · ") + (online.has(m.id) ? " · Active now" : "");
    b.append(el("b", "", m.username), el("small", "", info || "\u00a0"), ...btns);
    c.append(im, b);
    c.classList.add("lnk"); c.onclick = (e) => { if (!e.target.closest("button,a")) location.href = "profile.html?u=" + Auth.pubId(m.id); };
    return c;
  }
  function fpage() {
    if (view !== "friends") return;
    const root = $("fmain"); root.textContent = "";
    const reqs = people().filter((m) => incoming.has(m.id)), sg = suggested(), fr = frs();
    const sec = (title, list, mk, empty, more) => {
      const h = el("div", "fh"); h.append(el("h2", "", title));
      if (more) h.append(btn("See all", () => { sect = more; mark(); paint(); }, "link"));
      root.append(h);
      if (!list.length) return root.append(el("p", "muted", empty));
      const g = el("div", "fgrid"); list.forEach((m) => g.append(mk(m))); root.append(g);
    };
    const R = (m) => pcard(m, [btn("Confirm", () => A.accept(m.id), "btn full"), btn("Delete", () => A.decline(m.id), "btn ghost full")]);
    const S = (m) => pcard(m, [sent.has(m.id) ? btn("Cancel request", () => A.cancel(m.id), "btn ghost full") : btn("Add friend", () => A.add(m.id), "btn full")]);
    const F = (m) => pcard(m, [btn("Message", () => (location.href = "chat.html"), "btn full"), btn("Unfriend", () => A.unfriend(m.id), "btn ghost full")]);
    if (sect === "req") sec("Friend requests", reqs, R, "No friend requests right now.");
    else if (sect === "sugg") sec("People you may know", sg, S, "No suggestions right now.");
    else if (sect === "all") sec(fr.length + (fr.length === 1 ? " friend" : " friends"), fr, F, "No friends yet. Add some from People you may know.");
    else {
      sec("Friend requests", reqs.slice(0, 5), R, "No friend requests right now.", reqs.length > 5 ? "req" : "");
      sec("People you may know", sg.slice(0, 10), S, "No suggestions right now.", sg.length > 10 ? "sugg" : "");
    }
  }

  /* ---- sidebars ---- */
  function side() {
    const rq = people().filter((m) => incoming.has(m.id)), rl = $("rq");
    $("rq-wrap").hidden = !rq.length; rl.textContent = "";
    rq.slice(0, 3).forEach((m) => rl.append(row(m, [btn("Confirm", () => A.accept(m.id)), btn("Delete", () => A.decline(m.id), "btn sm ghost")], true)));
    const cl = $("contacts"), fr = people().filter((m) => friends.has(m.id)).sort(byOnline);
    cl.textContent = ""; $("contacts-empty").hidden = fr.length > 0;
    fr.forEach((m) => { const li = row(m, []); li.classList.add("click"); li.onclick = () => (location.href = "chat.html"); cl.append(li); });
  }
  function suggestions() {
    const r = suggested().slice(0, 10);
    $("sg-wrap").hidden = $("sugg-m-wrap").hidden = !r.length;
    const side = $("sugg"), mob = $("sugg-m"); side.textContent = mob.textContent = "";
    r.forEach((m) => {
      side.append(row(m, [action(m)], true));
      const c = el("div", "sc lnk"); c.append(ava(m, "av big"), el("b", "", m.username), el("small", "", m.regNo || m.semester || ""), action(m));
      c.onclick = (e) => { if (!e.target.closest("button,a")) location.href = "profile.html?u=" + Auth.pubId(m.id); }; mob.append(c);
    });
  }

  /* ---- feed ---- */
  let editing = null;                                // comment currently being edited: { k, id }
  function renderComments(k, force) {
    const e = els[k]; if (!e) return;
    if (editing && editing.k === k && !force) return; // don't wipe an edit in progress
    e.clist.textContent = "";
    const owner = (posts.get(k) || {}).uid === me.id;
    Object.entries(comments[k] || {}).filter(([, x]) => !Safety.hidden(x.uid)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([id, c]) => {
      const m = members.get(c.uid) || c, name = m.username || c.username, d = el("div", "cm"), w = el("div", "cw");
      const ca = ava({ username: name, photoUrl: m.photoUrl || c.photoUrl }, "av sm"); Stories.ring(ca, c.uid);
      d.append(ca, w); e.clist.append(d);
      if (editing && editing.k === k && editing.id === id) {          // inline editor
        const i = el("input"), r = el("div", "row");
        i.value = c.text; i.maxLength = 500;
        const done = () => { editing = null; renderComments(k, true); };
        const save = () => {
          const v = i.value.trim(); if (!v) return;
          if (v === c.text) return done();
          run({ [`comments/${k}/${id}/text`]: v, [`comments/${k}/${id}/editedAt`]: TS }); done();
        };
        i.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save(); else if (ev.key === "Escape") done(); });
        r.append(i, btn("Save", save), btn("Cancel", done, "btn sm ghost")); w.append(r);
        setTimeout(() => i.focus(), 0);
        return;
      }
      const t = el("div", "cb"); t.append(el("b", "", name), el("span", "", c.text));
      if (c.editedAt) t.append(el("span", "ed", " · edited"));
      w.append(t);
      const mine = c.uid === me.id, acts = el("div", "ca");
      if (mine) acts.append(btn("Edit", () => { editing = { k, id }; renderComments(k, true); }, "link"));
      else acts.append(btn("Report", () => Safety.report({ type: "comment", uid: c.uid, name, postId: k, commentId: id }), "link"));
      if (mine || owner) acts.append(btn("Delete", () => confirm("Delete this comment?") && run({ [`comments/${k}/${id}`]: null }), "link"));
      w.append(acts);
    });
  }
  function postEl(k, p) {
    const m = members.get(p.uid) || {};
    const a = { username: m.username || p.username || "?", photoUrl: m.photoUrl || p.photoUrl };
    const E = (els[k] = {});
    const d = el("article", "box"), h = el("div", "ph"), w = el("div", "grow"), when = el("small", "");
    w.append(el("b", "", a.username), when);
    const goP = () => (location.href = "profile.html" + (p.uid === me.id ? "" : "?u=" + Auth.pubId(p.uid)));
    const av0 = ava(a), nm0 = w.firstChild; av0.classList.add("lnk"); nm0.classList.add("lnk"); av0.onclick = nm0.onclick = goP; Stories.ring(av0, p.uid);
    h.append(av0, w);
    const cap = el("p", "cap"); cap.hidden = true;
    const editPost = () => {
      if (E.editing) return;
      E.editing = true; cap.hidden = true;
      const ed = el("div"), ta = el("textarea"), r = el("div", "row");
      ta.value = (posts.get(k) || p).caption || ""; ta.maxLength = 2000;
      const close = () => { E.editing = false; ed.remove(); paint(); };
      const save = () => {
        const cur = posts.get(k) || p, t = ta.value.trim();
        if (!t && !https(cur.mediaUrl)) return alert("A post needs a caption or a photo/video.");
        if (t === (cur.caption || "")) return close();
        run({ [`posts/${k}/caption`]: t || null, [`posts/${k}/editedAt`]: TS }); close();
      };
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Escape") close(); });
      r.append(btn("Save", save), btn("Cancel", close, "btn sm ghost")); ed.append(ta, r);
      cap.after(ed); ta.focus();
    };
    if (p.uid === me.id) {
      h.append(btn("Edit", editPost, "btn sm ghost"));
      h.append(btn("Delete", () => confirm("Delete this post?") && run({ ["posts/" + k]: null, ["likes/" + k]: null, ["reactions/" + k]: null, ["comments/" + k]: null }), "btn sm ghost"));
    } else h.append(btn("Report", () => Safety.report({ type: "post", uid: p.uid, name: a.username, postId: k }), "btn sm ghost"));
    d.append(h, cap);
    const u = https(p.mediaUrl);
    if (u) {
      const v = p.mediaType === "video", x = document.createElement(v ? "video" : "img");
      x.className = "media"; x.src = u;
      if (v) { x.controls = true; x.preload = "metadata"; x.playsInline = true; } else { x.loading = "lazy"; x.alt = ""; x.referrerPolicy = "no-referrer"; }
      d.append(x);
    }
    // like / comment / save
    const cbox = el("div", "cbox"), clist = el("div"), inp = el("input");
    cbox.hidden = true; inp.placeholder = "Write a comment…"; inp.maxLength = 500;
    const send = () => {
      const t = inp.value.trim(); if (!t) return; inp.value = "";
      const cr = db.ref("comments/" + k).push({ uid: me.id, username: me.username, photoUrl: me.photoUrl, text: t, ts: TS });
      Notify.push(p.uid, "comment", { postId: k, text: t.slice(0, 80) }, "c_" + cr.key);
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const r = el("div", "row"); r.append(inp, btn("Send", send)); cbox.append(clist, r);
    let lp = 0, lpHit = false, hov = 0;                // like button: tap = like/unlike, hover or long-press = pick a reaction
    const rw = el("div", "react"), pk = el("div", "rpick"); pk.hidden = true;
    const like = btn("", () => { if (lpHit) { lpHit = false; return; } setR(k, myR(k) ? "" : "like"); }, "act");
    Object.entries(RX).forEach(([t, em]) => { const b = btn(em, (ev) => { ev.stopPropagation(); pk.hidden = true; setR(k, t); }, "rp"); b.title = RL[t]; pk.append(b); });
    rw.onmouseenter = () => { clearTimeout(hov); hov = setTimeout(() => (pk.hidden = false), 350); };
    rw.onmouseleave = () => { clearTimeout(hov); hov = setTimeout(() => (pk.hidden = true), 300); };
    like.ontouchstart = () => { lp = setTimeout(() => { lpHit = true; pk.hidden = false; }, 450); };
    like.ontouchend = like.ontouchmove = () => clearTimeout(lp);
    like.oncontextmenu = (ev) => ev.preventDefault();
    rw.append(pk, like);
    const shr = btn("🔗 Share", () => share(k), "act");
    const cmt = btn("", () => {
      cbox.hidden = !cbox.hidden;
      if (cbox.hidden) { if (editing && editing.k === k) editing = null; }
      else { renderComments(k, true); inp.focus(); }
    }, "act");
    const sav = btn("", () => run({ [`saved/${me.id}/${k}`]: saved.has(k) ? null : true }), "act");
    const bar = el("div", "acts"); bar.append(rw, cmt, shr);
    if (!p.gid) bar.append(btn("📖 Story", () => Stories.sharePost(k, posts.get(k) || p, a.username), "act"));
    bar.append(sav);
    d.append(bar, cbox);
    Object.assign(E, { like, cmt, sav, cbox, clist, cap, when });
    return d;
  }
  function meta() {                                  // counts + button states, without rebuilding posts
    for (const k in els) {
      const e = els[k], l = likes[k] || {}, n = Object.keys(l).length, c = Object.values(comments[k] || {}).filter((x) => !Safety.hidden(x.uid)).length, p = posts.get(k);
      if (p) {
        e.when.textContent = ago(p.ts) + (p.gid && groups[p.gid] ? " · 👥 " + groups[p.gid].name : "") + (p.editedAt ? " · edited" : "");
        if (!e.editing) { e.cap.textContent = p.caption || ""; e.cap.hidden = !p.caption; }
      }
      const rs = allR(k), mine = myR(k), tops = [...new Set(rs)].sort((a, b) => rs.filter((x) => x === b).length - rs.filter((x) => x === a).length).slice(0, 3).map((t) => RX[t]).join("");
      e.like.textContent = (mine ? RX[mine] + " " + RL[mine] : "👍 Like") + (rs.length ? " · " + tops + " " + rs.length : "");
      e.like.classList.toggle("on", !!mine);
      e.cmt.textContent = "💬 Comment" + (c ? " · " + c : "");
      e.sav.textContent = saved.has(k) ? "🔖 Saved" : "🔖 Save";
      e.sav.classList.toggle("on", saved.has(k));
      if (!e.cbox.hidden) renderComments(k);
    }
  }
  function feed() {
    const show = (k, p) => mode === "saved" ? saved.has(k) : mode === "post" ? k === pid : mode === "group" ? !!groups[gid] && inG(gid) && p.gid === gid
      : p.gid ? !!groups[p.gid] && inG(p.gid) : p.uid === me.id || friends.has(p.uid);
    const vis = [...posts].filter(([k, p]) => !Safety.hidden(p.uid) && show(k, p)).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const sig = mode + gid + pid + vis.map(([k]) => k).join();
    if (sig === lastSig) return;                     // don't rebuild (and reset videos) when nothing changed
    lastSig = sig;
    for (const k in els) delete els[k];
    $("feed-title").textContent = { saved: "Saved posts", post: "Post", group: "Group posts" }[mode] || "Friends' posts";
    $("feed-empty").textContent = { saved: "You haven't saved any posts yet.", post: "This post was deleted or isn't available.", group: inG(gid) ? "No posts in this group yet." : "Join this group to see and share its posts." }[mode] || "No posts yet. Add friends or share the first post.";
    $("feed-empty").hidden = vis.length > 0;
    const box = $("feed"); box.textContent = "";
    vis.forEach(([k, p]) => box.append(postEl(k, p)));
  }

  /* ---- reactions, share link, toast ---- */
  const myR = (k) => (reactions[k] || {})[me.id] || ((likes[k] || {})[me.id] ? "like" : "");
  const allR = (k) => Object.values(Object.assign({}, ...Object.keys(likes[k] || {}).map((u) => ({ [u]: "like" })), reactions[k] || {}));
  function setR(k, t) {
    run({ [`reactions/${k}/${me.id}`]: t || null, [`likes/${k}/${me.id}`]: null });
    const p = posts.get(k); if (t && p) Notify.push(p.uid, "react", { postId: k, emoji: RX[t] }, `r_${k}_${me.id}`);
  }
  function toast(t) { const d = el("div", "toast", t); document.body.append(d); setTimeout(() => d.remove(), 2000); }
  async function share(k) {
    const u = location.href.split(/[?#]/)[0] + "?p=" + k;
    try { await navigator.clipboard.writeText(u); toast("Link copied"); } catch (e) { prompt("Copy this link:", u); }
  }
  function openPost(k) {
    if (!posts.has(k)) db.ref("posts/" + k).once("value").then((s) => { if (s.val()) { posts.set(k, s.val()); paint(); } });
    go("p:" + k);
  }

  /* ---- groups / clubs ---- */
  const inG = (g) => !!(gmembers[g] || {})[me.id];
  const joinG = (g) => run({ [`groupMembers/${g}/${me.id}`]: true });
  const leaveG = (g) => confirm("Leave this group?") && run({ [`groupMembers/${g}/${me.id}`]: null });
  function delG(g) {
    if (!confirm("Delete this group and its posts for everyone?")) return;
    const u = { ["groups/" + g]: null, ["groupMembers/" + g]: null, ["groupInvited/" + g]: null };
    posts.forEach((p, k) => { if (p.gid === g) { u["posts/" + k] = null; u["comments/" + k] = null; u["reactions/" + k] = null; u["likes/" + k] = null; } });
    run(u).then((ok) => ok && go("groups"));
  }
  function groupBox(id, g, link) {
    const b = el("div", "box gbox"), n = Object.keys(gmembers[id] || {}).length, t = el("b", "gt", g.name);
    if (link) { t.classList.add("lnk"); t.onclick = () => go("g:" + id); }
    b.append(t, el("p", "muted", (GT[g.type] || "Group") + " · " + n + (n === 1 ? " member" : " members")));
    if (g.desc) b.append(el("p", "", g.desc));
    const r = el("div", "row");
    if (link) r.append(btn("Open", () => go("g:" + id)));
    r.append(inG(id) ? btn("Leave", () => leaveG(id), "btn sm ghost") : btn("Join", () => joinG(id), link ? "btn sm ghost" : "btn sm"));
    if (inG(id)) r.append(btn("👥 Members", () => membersG(id), "btn sm ghost"), btn("🔗 Share link", () => shareG(id), "btn sm ghost"));
    if (g.createdBy === me.id) r.append(btn("Delete group", () => delG(id), "btn sm ghost"));
    if (!link) r.append(btn("All groups", () => go("groups"), "btn sm ghost"));
    b.append(r); return b;
  }
  let mdraw = null;
  async function shareG(id) {
    const u = location.href.split(/[?#]/)[0] + "?g=" + id;
    try { await navigator.clipboard.writeText(u); toast("Group link copied"); } catch (e) { prompt("Copy this group link:", u); }
  }
  function membersG(id) {
    const g = groups[id]; if (!g) return;
    const { card, close } = Safety.dialog("Members · " + g.name);
    const q = el("input"), res = el("ul", "list"), cur = el("ul", "list"), h1 = el("h2", "sec", "Invite people (they must accept to join)"), h2 = el("h2", "sec", "");
    q.type = "text"; q.placeholder = "Search people to invite (name or reg. no.)";
    const draw = () => {
      if (!card.isConnected) { mdraw = null; return; }
      const mem = gmembers[id] || {}, term = q.value.trim().toLowerCase();
      res.textContent = ""; cur.textContent = "";
      const cand = people().filter((m) => m.id !== me.id && !mem[m.id] && (!term || (m.username + " " + (m.regNo || "")).toLowerCase().includes(term)))
        .sort((a, b) => (friends.has(b.id) - friends.has(a.id)) || byOnline(a, b)).slice(0, 20);
      cand.forEach((m) => res.append(row(m, [(invited[id] || {})[m.id]
        ? btn("Invited ✕", (e) => { e.target.disabled = true; run({ [`groupInvites/${m.id}/${id}`]: null, [`groupInvited/${id}/${m.id}`]: null, [`notifications/${m.id}/g_${id}_${m.id}`]: null }); }, "btn sm ghost")
        : btn("Invite", async (e) => {
          e.target.disabled = true;
          if (await run({ [`groupInvites/${m.id}/${id}`]: { by: me.id, byName: me.username, ts: TS }, [`groupInvited/${id}/${m.id}`]: true })) Notify.push(m.id, "group", { gid: id, gname: g.name.slice(0, 60) }, `g_${id}_${m.id}`);
          else e.target.disabled = false;
        })])));
      if (!cand.length) res.append(el("li", "muted pad", term ? "No people found." : "Everyone is already in this group."));
      const ids = Object.keys(mem), mine = g.createdBy === me.id;
      h2.textContent = ids.length + (ids.length === 1 ? " member" : " members");
      ids.map((u) => ({ id: u, ...(members.get(u) || {}) })).filter((m) => m.username && !Safety.hidden(m.id))
        .sort((a, b) => (b.id === g.createdBy) - (a.id === g.createdBy) || a.username.localeCompare(b.username)).forEach((m) => {
          const ex = [];
          if (m.id === g.createdBy) ex.push(el("span", "tag", "Creator"));
          else if (mine) ex.push(btn("Remove", () => confirm("Remove " + m.username + " from the group?") && run({ [`groupMembers/${id}/${m.id}`]: null }), "btn sm ghost"));
          cur.append(row(m, ex));
        });
    };
    mdraw = draw; q.oninput = draw;
    card.append(q, h1, res, h2, cur, btn("Done", close, "btn sm ghost full")); draw(); q.focus();
  }
  function createG() {
    const { card, close } = Safety.dialog("Create a group");
    const n = el("input"), d = el("textarea"), t = el("select"), r = el("div", "row");
    n.type = "text"; n.maxLength = 60; n.placeholder = "Group name (e.g. DBMS Study Circle)";
    d.maxLength = 200; d.placeholder = "What is this group about? (optional)";
    Object.entries(GT).forEach(([v, l]) => { const o = el("option", "", l); o.value = v; t.append(o); });
    const go2 = btn("Create", async () => {
      const name = n.value.trim(); if (!name) return n.focus();
      go2.disabled = true;
      const id = db.ref("groups").push().key, rec = { name, type: t.value, createdBy: me.id, ts: TS };
      if (d.value.trim()) rec.desc = d.value.trim();
      if (await run({ ["groups/" + id]: rec, [`groupMembers/${id}/${me.id}`]: true })) { close(); go("g:" + id); } else go2.disabled = false;
    });
    card.append(n);
    if (me.semester) card.append(btn("Use “Semester " + me.semester + "”", () => { n.value = "Semester " + me.semester; t.value = "semester"; }, "btn sm ghost"));
    r.append(el("span", "grow"), btn("Cancel", close, "btn sm ghost"), go2);
    card.append(el("p", "", ""), t, d, r); n.focus();
  }
  const pendingInv = () => Object.entries(myInv).filter(([g, i]) => groups[g] && !inG(g) && !Safety.hidden(i.by));
  const answer = (g, ok) => run(Object.assign({ [`groupInvites/${me.id}/${g}`]: null, [`groupInvited/${g}/${me.id}`]: null }, ok ? { [`groupMembers/${g}/${me.id}`]: true } : {}));
  function gpage() {
    if (view !== "groups") return;
    const root = $("groups"); root.textContent = "";
    const h = el("div", "fh"); h.append(el("h2", "", "Groups"), btn("+ Create group", createG)); root.append(h);
    const inv = pendingInv();
    if (inv.length) {
      root.append(el("h2", "sec", "Invitations (" + inv.length + ")"));
      inv.forEach(([g, i]) => {
        const b = el("div", "box gbox"), r = el("div", "row");
        b.append(el("b", "gt", groups[g].name), el("p", "muted", (i.byName || "Someone") + " invited you to join this " + (GT[groups[g].type] || "group").toLowerCase()));
        if (groups[g].desc) b.append(el("p", "", groups[g].desc));
        r.append(btn("Accept", () => answer(g, true)), btn("Decline", () => answer(g, false), "btn sm ghost")); b.append(r); root.append(b);
      });
    }
    const list = Object.entries(groups).filter(([, g]) => g && g.name).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const sec = (title, l, empty) => {
      root.append(el("h2", "sec", title));
      l.length ? l.forEach(([id, g]) => root.append(groupBox(id, g, true))) : root.append(el("p", "muted", empty));
    };
    sec("Your groups", list.filter(([id]) => inG(id)), "You haven't joined any groups yet. Create one for your semester, a subject or a club.");
    sec("Discover", list.filter(([id]) => !inG(id)), "No other groups to discover right now.");
  }
  function ghead() {                                   // group header / "back" bar above the feed
    const h = $("ghead"); h.textContent = ""; h.hidden = view !== "home" || (mode !== "group" && mode !== "post");
    if (h.hidden) return;
    if (mode === "post") { const r = el("div", "row nomt"); r.append(btn("← Back to feed", () => go("home"), "btn sm ghost")); h.append(r); return; }
    const g = groups[gid];
    h.append(g ? groupBox(gid, g, false) : el("p", "muted pad", "This group doesn't exist (or was deleted)."));
  }
  function comp() { $("comp").hidden = !(mode === "all" || (mode === "group" && groups[gid] && inG(gid))); }

  /* ---- create post ---- */
  function composer() {
    let file = null;
    const f = $("pfile"), cap = $("pcap"), go = $("ppost"), pv = $("ppv"), err = $("perr");
    const sync = () => (go.disabled = !(file || cap.value.trim()));
    const reject = (m) => { err.textContent = m; file = null; f.value = ""; };
    cap.oninput = sync;
    f.onchange = () => {
      err.textContent = ""; pv.textContent = ""; file = f.files[0] || null;
      if (file) {
        const vid = file.type.startsWith("video/");
        if (!vid && !file.type.startsWith("image/")) reject("Choose an image or video.");
        else if (file.size > (vid ? 50 : 10) * 1048576) reject(vid ? "Videos must be under 50 MB." : "Images must be under 10 MB.");
        else { const m = document.createElement(vid ? "video" : "img"); m.className = "media"; m.src = URL.createObjectURL(file); if (vid) m.muted = true; pv.append(m); }
      }
      sync();
    };
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Posting…"; err.textContent = "";
      try {
        const rec = { uid: me.id, username: me.username, photoUrl: me.photoUrl, caption: cap.value.trim(), ts: TS };
        if (mode === "group" && gid) rec.gid = gid;
        if (file) {
          const fd = new FormData(); fd.append("file", file); fd.append("upload_preset", CFG.cloud.preset);
          const r = await fetch(`https://api.cloudinary.com/v1_1/${CFG.cloud.name}/auto/upload`, { method: "POST", body: fd });
          if (!r.ok) throw new Error("Upload failed (" + r.status + ").");
          const j = await r.json(); rec.mediaUrl = j.secure_url; rec.mediaType = j.resource_type === "video" ? "video" : "image";
        }
        await db.ref("posts").push(rec);
        file = null; f.value = ""; cap.value = ""; pv.textContent = "";
      } catch (e) { err.textContent = e.message || "Couldn't post. Try again."; }
      go.textContent = "Post"; sync();
    };
  }

  /* ---- realtime wiring ---- */
  function all() {
    const n = people().filter((m) => incoming.has(m.id)).length, b = $("b-req");
    b.hidden = !n; b.textContent = n;
    search(); fpage(); gpage(); ghead(); comp(); side(); suggestions(); feed(); meta(); Stories.paint(view === "home" && mode === "all"); Notify.repaint();
    const gb = $("b-grp"), gn = pendingInv().length; gb.hidden = !gn; gb.textContent = gn;
  }
  const paint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(all); };
  function watch(ref, put, del) {
    const f = (s) => { put(s.key, s.val()); paint(); };
    ref.on("child_added", f); ref.on("child_changed", f);
    ref.on("child_removed", (s) => { del(s.key); paint(); });
  }

  function start(p) {
    me = p; Safety.start(p, paint);
    document.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
    document.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { sect = b.dataset.s; window.scrollTo(0, 0); mark(); paint(); }));
    document.querySelectorAll("[data-menu]").forEach((b) => (b.onclick = () => { if (b.id === "me" && !matchMedia("(max-width:760px)").matches) return; $("menu").hidden = !$("menu").hidden; }));
    $("sopen").onclick = () => { hl.classList.add("open"); $("hq").focus(); };
    $("m-blocked").onclick = () => { $("menu").hidden = true; Safety.list(); };
    $("hq").onfocus = () => { hl.classList.add("open"); search(); };
    $("hq").oninput = search;
    $("sback").onclick = closeSearch;
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeSearch());
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".hl")) closeSearch();
      if (!e.target.closest("#menu,[data-menu]")) $("menu").hidden = true;
      if (!e.target.closest(".react")) document.querySelectorAll(".rpick").forEach((x) => (x.hidden = true));
    });
    $("pcap").placeholder = "What's on your mind, " + me.username.split(" ")[0] + "?";
    const sb = $("sb-me"), nm = el("div", "grow"); nm.append(el("b", "", me.username), el("small", "muted", me.regNo || ""));
    nm.firstChild.style.display = nm.lastChild.style.display = "block"; const mine0 = ava(me); Stories.ring(mine0, me.id); sb.append(mine0, nm);
    sb.classList.add("lnk"); sb.onclick = () => (location.href = "profile.html");
    composer(); mark();
    Notify.start(me, (n) => (n.postId ? openPost(n.postId) : n.type === "story" ? (n.sid && Stories.openStory(n.sid)) || go("home") : n.type === "group" ? go("groups") : go(n.type === "request" ? "fr-req" : "fr-home")));
    Stories.start(me, { friends: () => friends, member: (id) => members.get(id), openPost });
    const qs = new URLSearchParams(location.search), pp = qs.get("p"), gg = qs.get("g"); const vv = qs.get("v"); if (pp) openPost(pp); else if (gg) go("g:" + gg); else if (["home", "saved", "groups", "fr-home", "fr-req"].includes(vv)) go(vv);   // opened from a shared link
    watch(db.ref("users"), (k, v) => members.set(k, v), (k) => members.delete(k));
    watch(db.ref("presence"), (k) => online.add(k), (k) => online.delete(k));
    watch(db.ref("friends/" + me.id), (k) => friends.add(k), (k) => friends.delete(k));
    watch(db.ref("requests/" + me.id), (k) => incoming.add(k), (k) => incoming.delete(k));
    watch(db.ref("sent/" + me.id), (k) => sent.add(k), (k) => sent.delete(k));
    watch(db.ref("saved/" + me.id), (k) => saved.add(k), (k) => saved.delete(k));
    watch(db.ref("posts").limitToLast(100), (k, v) => posts.set(k, v), (k) => posts.delete(k));
    db.ref("likes").on("value", (s) => { likes = s.val() || {}; paint(); });
    db.ref("reactions").on("value", (s) => { reactions = s.val() || {}; paint(); });
    db.ref("groupInvites/" + me.id).on("value", (s) => { myInv = s.val() || {}; paint(); });
    db.ref("groupInvited").on("value", (s) => { invited = s.val() || {}; paint(); if (mdraw) mdraw(); });
    db.ref("groups").on("value", (s) => { groups = s.val() || {}; paint(); });
    db.ref("groupMembers").on("value", (s) => { gmembers = s.val() || {}; paint(); if (mdraw) mdraw(); });
    db.ref("comments").on("value", (s) => { comments = s.val() || {}; paint(); });
    db.ref(".info/connected").on("value", (s) => {
      if (!s.val()) return;
      const mine = db.ref("presence/" + me.id);
      mine.onDisconnect().remove(); mine.set(true);
    });
  }

  window.Social = { start };
})();
