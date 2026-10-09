(function () {
  const $ = (id) => document.getElementById(id);
  const { db, shopDb, https } = Auth;
  const COLORS = ["#2743e0", "#c2410c", "#0f766e", "#9333ea", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];
  const colorFor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  let me = null;

  function face(el, name, photo) {
    el.style.background = colorFor(name);
    const letter = String(name || "?")[0].toUpperCase();
    el.textContent = "";
    const src = https(photo);
    if (!src) { el.textContent = letter; return; }
    const i = new Image();
    i.alt = ""; i.referrerPolicy = "no-referrer";
    i.onerror = () => { i.remove(); el.textContent = letter; };
    i.src = src; el.append(i);
  }

  /* ---------- Profile picture gate ---------- */
  async function square(file) {                      // centre-crop to 512x512 JPEG
    const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas"); c.width = c.height = 512;
    c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 512, 512);
    return new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  }
  async function upload(blob, name) {
    const f = new FormData();
    f.append("file", blob, name + ".jpg");
    f.append("upload_preset", CFG.cloud.preset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CFG.cloud.name}/image/upload`, { method: "POST", body: f });
    if (!r.ok) throw new Error("Upload failed (" + r.status + "). Try again.");
    return (await r.json()).secure_url;
  }
  function needPhoto(p) {                            // resolves with the new photo URL
    return new Promise((resolve) => {
      let pick = null;
      $("gate").hidden = false;
      $("file").onchange = () => {
        const f = $("file").files[0]; $("err").textContent = ""; $("go").disabled = true;
        if (!f) return;
        if (!f.type.startsWith("image/")) { $("err").textContent = "Please choose an image file."; return; }
        if (f.size > 8 * 1024 * 1024) { $("err").textContent = "Image must be under 8 MB."; return; }
        pick = f;
        $("prev").src = URL.createObjectURL(f); $("prev").hidden = false; $("pick-t").hidden = true;
        $("go").disabled = false;
      };
      $("go").onclick = async () => {
        $("go").disabled = true; $("go").textContent = "Uploading…"; $("err").textContent = "";
        try {
          const slug = p.email.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const url = await upload(await square(pick), slug + "-" + Date.now());
          // Also save to the shop profile so the picture shows on the main site too.
          try { await shopDb.ref("users/" + p.id).update({ photoUrl: url, updatedAt: Date.now() }); } catch (e) {}
          $("gate").hidden = true;
          resolve(url);
        } catch (e) {
          $("err").textContent = e.message || "Upload failed. Try again.";
          $("go").disabled = false; $("go").textContent = "Upload & join";
        }
      };
    });
  }

  /* ---------- Join: write this student into the community /users table ---------- */
  async function join(p) {
    const r = db.ref("users/" + p.id);
    await r.update({
      username: p.username, email: p.email, regNo: p.regNo, semester: p.semester,
      photoUrl: p.photoUrl, updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await r.child("joinedAt").transaction((v) => v || Date.now());
  }

  /* ---------- Realtime listeners ---------- */
  const members = new Map(), online = new Set();
  let raf = 0;
  const paint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

  function listen() {
    const u = db.ref("users");
    u.on("child_added", (s) => { members.set(s.key, s.val()); paint(); });
    u.on("child_changed", (s) => { members.set(s.key, s.val()); paint(); });
    u.on("child_removed", (s) => { members.delete(s.key); paint(); });
    const pr = db.ref("presence");
    pr.on("child_added", (s) => { online.add(s.key); paint(); });
    pr.on("child_removed", (s) => { online.delete(s.key); paint(); });
    db.ref(".info/connected").on("value", (s) => {
      if (!s.val()) return;
      const mine = db.ref("presence/" + me.id);
      mine.onDisconnect().remove(); mine.set(true);
    });
  }

  function render() {
    const q = $("q").value.trim().toLowerCase();
    const all = [...members].map(([id, m]) => ({ id, ...m })).filter((m) => m.username && https(m.photoUrl));
    const rows = all
      .filter((m) => !q || (m.username + " " + (m.regNo || "")).toLowerCase().includes(q))
      .sort((a, b) => (online.has(b.id) - online.has(a.id)) || a.username.localeCompare(b.username));
    $("count").textContent = all.length + " members · " + all.filter((m) => online.has(m.id)).length + " online";
    $("empty").hidden = rows.length > 0;
    const ul = $("list"); ul.textContent = "";
    for (const m of rows) {                           // textContent only: DB values are untrusted
      const li = document.createElement("li"); li.className = "member";
      const av = document.createElement("span"); av.className = "av"; face(av, m.username, m.photoUrl);
      if (online.has(m.id)) { const d = document.createElement("i"); d.className = "dot"; av.append(d); }
      const box = document.createElement("div");
      const n = document.createElement("b"); n.textContent = m.username + (m.id === me.id ? " (you)" : "");
      const s = document.createElement("small"); s.textContent = [m.regNo, m.semester].filter(Boolean).join(" · ");
      box.append(n, s); li.append(av, box); ul.append(li);
    }
  }

  /* ---------- Boot ---------- */
  (async function () {
    const p = await Auth.profile();
    if (!p) {
      $("boot").textContent = "Please log in to join the community…";
      setTimeout(() => location.replace(CFG.loginUrl), 700);
      return;
    }
    if (!p.photoUrl) {                                // fall back to a picture already in the community table
      try { p.photoUrl = https((await db.ref("users/" + p.id + "/photoUrl").once("value")).val()); } catch (e) {}
    }
    if (!p.photoUrl) p.photoUrl = await needPhoto(p); // blocks here until a picture is uploaded
    me = p;
    try { await join(p); } catch (e) {
      $("boot").textContent = "Couldn't join the community right now. Check your connection and reload.";
      return;
    }
    face($("me-av"), p.username, p.photoUrl); $("me-name").textContent = p.username; $("me").hidden = false;
    $("boot").hidden = true; $("hub").hidden = false;
    $("q").addEventListener("input", paint);
    listen();
  })();
})();
