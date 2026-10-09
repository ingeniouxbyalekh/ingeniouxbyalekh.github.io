/* admin.js: Disclosure admin panel (polls, top articles, users).
   Login/session handling lives in admin-auth.js. */
import { db, $, toast, startAdminAuth } from "./admin-auth.js";
import { collection, doc, onSnapshot, query, orderBy, writeBatch, serverTimestamp, deleteDoc, getFirestore }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

// ingenioux-visitor Firestore: articles/<slug> {count,title} (written by ../visitor.js)
const visitorApp = getApps().find(a => a.name === "visitor") || initializeApp({
  apiKey: "AIzaSyBFkN8erxsvRRAwMipQu7xZGLeXsQu9E_w",
  authDomain: "ingenioux-visitor.firebaseapp.com",
  projectId: "ingenioux-visitor",
  storageBucket: "ingenioux-visitor.firebasestorage.app",
  messagingSenderId: "426646415346",
  appId: "1:426646415346:web:38373322949588eb14ed6b"
}, "visitor");
const dbVisitor = getFirestore(visitorApp);
let topArticles = null;   // null = loading, string = error, array = loaded
let usersList = null;     // null = loading, string = error, array = registered users (users collection)


const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const data = { polls: [] };
const istDate = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
const META = {
  polls:  { name: "Polls",  one: "poll",  icon: "☰", c: "var(--poll)",  desc: "The poll visitors can vote on from the home page (sign-in required). Results are saved here.", add: "Create a new poll" }
};
const TYPES = Object.keys(META);

/* ---------------- data actions ---------------- */
async function publish(col, item) {
  const b = writeBatch(db);
  data[col].forEach(d => { if (d.active) b.update(doc(db, col, d.id), { active: false }); });
  b.set(doc(collection(db, col)), { ...item, active: true, createdAt: serverTimestamp() });
  await b.commit();
}
async function makeLive(col, id) {
  const b = writeBatch(db);
  data[col].forEach(d => b.update(doc(db, col, d.id), { active: d.id === id }));
  await b.commit();
}
const when = d => d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "just now";
const counts = d => d.options.map((_, i) => (d.votes && d.votes[i]) || 0);
const total = d => counts(d).reduce((a, b) => a + b, 0);

/* ---------------- views (built once, so typing is never lost) ---------------- */
const FORMS = {
  polls:  `<label for="pQ">Question</label><input id="pQ" type="text" placeholder="What do you want to ask?" required>
           <label>Options <span class="meta">(2 to 6)</span></label><div id="pOpts"></div>
           <button type="button" class="ghost" id="addOpt" style="width:100%;margin-bottom:14px">+ Add option</button>
           <button type="submit">Publish poll</button>`
};
$("main").innerHTML = `<section data-view="overview" hidden>
    <div class="band" style="--accent:#1E293B"><div class="bi">◎</div><div><h1>Overview</h1></div></div>
    <div class="ov" id="ov"></div></section>` +
  TYPES.map(t => { const m = META[t]; return `<section data-view="${t}" hidden style="--accent:${m.c}">
    <div class="band"><div class="bi">${m.icon}</div><div><h1>${m.name}</h1></div><div class="cnt"><b id="cnt-${t}">0</b>saved</div></div>
    <div class="cols">
      <div class="card form sticky"><h3>${m.add}</h3><form id="f-${t}">${FORMS[t]}</form></div>
      <div class="stack"><div class="card"><h3>Live now</h3><div id="live-${t}"></div></div>
      <div class="card"><h3>Saved ${m.name.toLowerCase()}</h3><div class="lib" id="lib-${t}"></div></div></div>
    </div></section>`; }).join("");

const TA_C = "#10B981";
$("main").insertAdjacentHTML("beforeend", `<section data-view="toparticles" hidden style="--accent:${TA_C}">
  <div class="band"><div class="bi">▲</div><div><h1>Top Articles</h1><p>Most viewed articles, from the visitor database</p></div><div class="cnt"><b id="taTotal">0</b>total views</div></div>
  <div class="card"><h3>Top 10 articles</h3><div class="tlist" id="taList"></div></div></section>`);
const US_C = "#F59E0B";
$("main").insertAdjacentHTML("beforeend", `<section data-view="users" hidden style="--accent:${US_C}">
  <div class="band"><div class="bi">☺</div><div><h1>Users</h1><p>Everyone who signed in and completed registration</p></div><div class="cnt"><b id="usrTotal">0</b>signed-in users</div></div>
  <div class="card"><h3>All signed-in users</h3>
    <div class="usr-tools"><input id="usrSearch" type="search" placeholder="Search name, email, phone, country…" autocomplete="off"></div>
    <div id="usrList"></div></div></section>`);
/* ---------------- forms ---------------- */
async function submit(e, type, build, ok) {
  e.preventDefault();
  const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
  try { await publish(type, await build()); e.target.reset(); if (type === "polls") resetOpts(); toast(ok); }
  catch (err) { toast(err.message || "Failed: " + err.code, true); }
  btn.disabled = false;
}
function optInput() { const i = document.createElement("input"); i.type = "text"; i.placeholder = "Option"; i.maxLength = 80; $("pOpts").append(i); }
function resetOpts() { $("pOpts").innerHTML = ""; optInput(); optInput(); }
resetOpts();
$("addOpt").onclick = () => { if ($("pOpts").children.length < 6) optInput(); };
$("f-polls").onsubmit = e => submit(e, "polls", async () => {
  const options = [...$("pOpts").querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean);
  if (options.length < 2) throw { message: "Add at least 2 options." };
  const votes = {}; options.forEach((_, i) => votes[i] = 0);
  return { question: $("pQ").value.trim(), options, votes };
}, "Poll is now live on the home page.");

/* ---------------- rendering ---------------- */
const bars = d => { const c = counts(d), tot = total(d);
  return d.options.map((o, i) => { const pc = tot ? Math.round(c[i] * 100 / tot) : 0; return `<div class="res"><span>${esc(o)}</span><span>${c[i]} · ${pc}%</span></div><div class="bar"><div style="width:${pc}%"></div></div>`; }).join("") + `<div class="meta" style="margin-top:8px">${tot} total vote${tot === 1 ? "" : "s"}</div>`; };
function preview(t, d) {
  return `<span class="qs">${esc(d.question)}</span>${bars(d)}`;
}
const empty = t => `<div class="empty">Nothing is live. Publish a ${META[t].one} using the form.</div>`;

function render() {
  // sidebar
  const v = view();
  $("nav").innerHTML = `<a href="#overview" class="${v === "overview" ? "on" : ""}" style="--c:#fff"><span class="ic" style="background:#334155">◎</span>Overview</a>` +
    TYPES.map(t => `<a href="#${t}" class="${v === t ? "on" : ""}" style="--c:${META[t].c}"><span class="ic" style="background:${META[t].c}">${META[t].icon}</span>${META[t].name}<span class="n">${data[t].length}</span></a>`).join("");
  document.querySelectorAll("[data-view]").forEach(s => s.hidden = s.dataset.view !== v);
  $("nav").insertAdjacentHTML("beforeend", `<a href="#toparticles" class="${v === "toparticles" ? "on" : ""}" style="--c:${TA_C}"><span class="ic" style="background:${TA_C}">▲</span>Top Articles<span class="n">${Array.isArray(topArticles) ? topArticles.length : 0}</span></a>`);
  $("nav").insertAdjacentHTML("beforeend", `<a href="#users" class="${v === "users" ? "on" : ""}" style="--c:${US_C}"><span class="ic" style="background:${US_C}">☺</span>Users<span class="n">${Array.isArray(usersList) ? usersList.length : 0}</span></a>`);
  renderTopArticles();
  renderUsers();

  // overview cards
  $("ov").innerHTML = TYPES.map(t => { const live = data[t].find(d => d.active), m = META[t];
    return `<div class="card ovc" style="--accent:${m.c}"><div class="top"><span>${m.icon}</span><h3>${m.name}</h3><span class="pill ${live ? "live" : ""}">${live ? "LIVE" : "EMPTY"}</span></div>
      <div class="body">${live ? preview(t, live) : empty(t)}</div>
      <div class="foot"><a href="#${t}"><button>Manage</button></a><span class="meta">${data[t].length} saved</span></div></div>`; }).join("");

  // per-section
  TYPES.forEach(t => {
    const live = data[t].find(d => d.active);
    $("cnt-" + t).textContent = data[t].length;
    $("live-" + t).innerHTML = live ? `${preview(t, live)}<div class="meta" style="margin-top:12px">Published ${when(live)}</div>` : empty(t);
    $("lib-" + t).innerHTML = data[t].map(d => {
      const title = d.question, thumb = "";
      const extra = `<div class="meta">${d.options.length} options · ${total(d)} votes</div>${bars(d)}`;
      return `<div class="item ${d.active ? "isLive" : ""}">${thumb}<div><b>${esc(title)}</b> ${d.active ? '<span class="pill live">LIVE</span>' : ""}<div class="meta">${when(d)}</div></div>${extra}
        <div class="acts">${d.active ? "" : `<button class="ghost" data-live="${t}:${d.id}">Make live</button>`}<button class="danger" data-del="${t}:${d.id}">Delete</button></div></div>`;
    }).join("") || '<div class="empty" style="grid-column:1/-1">No saved items yet.</div>';
  });
  document.querySelectorAll("[data-live]").forEach(b => b.onclick = async () => { const [t, id] = b.dataset.live.split(":"); try { await makeLive(t, id); toast("Updated. It is now live."); } catch (e) { toast("Failed: " + e.code, true); } });
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { const [t, id] = b.dataset.del.split(":"); if (!confirm("Delete this item permanently?")) return; try { await deleteDoc(doc(db, t, id)); toast("Deleted."); } catch (e) { toast("Failed: " + e.code, true); } });
}
function renderUsers() {
  const el = $("usrList");
  if (usersList === null) { el.innerHTML = '<div class="empty">Loading users…</div>'; return; }
  if (typeof usersList === "string") { el.innerHTML = `<div class="empty">${esc(usersList)}</div>`; return; }
  $("usrTotal").textContent = usersList.length;
  const q = ($("usrSearch").value || "").trim().toLowerCase();
  const rows = usersList
    .filter(u => !q || [u.name, u.email, u.phone, u.country, u.region, u.zip].some(x => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  if (!rows.length) { el.innerHTML = `<div class="empty">${usersList.length ? "No users match your search." : "No signed-in users yet."}</div>`; return; }
  el.innerHTML = `<div class="twrap"><table class="utbl"><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Country</th><th>State / Region</th><th>Zip</th><th class="act"></th></tr></thead><tbody>` +
    rows.map((u, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone || "–")}</td><td>${esc(u.country)}</td><td>${esc(u.region || "–")}</td><td>${esc(u.zip)}</td><td class="act"><button type="button" class="udel" data-udel="${esc(u.id)}" title="Delete user" aria-label="Delete user ${esc(u.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button></td></tr>`).join("") +
    `</tbody></table></div>`;
  el.querySelectorAll("[data-udel]").forEach(b => b.onclick = async () => {
    const u = usersList.find(x => x.id === b.dataset.udel); if (!u) return;
    if (!confirm("Delete user \"" + (u.name || u.email || "this user") + "\" permanently?")) return;
    try { await deleteDoc(doc(db, "users", u.id)); toast("User deleted."); }
    catch (e) { toast("Failed: " + (e.code || e.message) + (e.code === "permission-denied" ? " (allow admin to delete in the users Firestore rules)" : ""), true); }
  });
}
$("usrSearch").addEventListener("input", renderUsers);
function renderTopArticles() {
  const el = $("taList");
  if (topArticles === null) { el.innerHTML = '<div class="empty">Loading top articles…</div>'; return; }
  if (typeof topArticles === "string") { el.innerHTML = `<div class="empty">${esc(topArticles)}</div>`; return; }
  $("taTotal").textContent = topArticles.reduce((a, b) => a + b.count, 0);
  if (!topArticles.length) { el.innerHTML = '<div class="empty">No article views recorded yet.</div>'; return; }
  const max = Math.max(1, topArticles[0].count);
  el.innerHTML = topArticles.map((a, i) => `<div class="tile"><span class="rk">#${i + 1}</span><div class="info"><b title="${esc(a.slug)}">${esc(a.title || a.slug)}</b><span class="meta">${a.count} view${a.count === 1 ? "" : "s"}</span><div class="tbar"><div style="width:${Math.round(a.count * 100 / max)}%"></div></div></div><a class="visit" href="../Articles/${encodeURIComponent(a.slug)}.html" target="_blank" rel="noopener">Visit</a></div>`).join("");
}
const view = () => { const h = location.hash.slice(1); return TYPES.includes(h) || h === "toparticles" || h === "users" ? h : "overview"; };
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
render();

/* ---------------- start (data loads only after admin auth succeeds) ---------------- */
let unsubs = [];
startAdminAuth({
  onLeave() { unsubs.forEach(f => f()); unsubs = []; },
  onEnter() {
    TYPES.forEach(c => unsubs.push(onSnapshot(query(collection(db, c), orderBy("createdAt", "desc")),
      s => { data[c] = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
      e => toast("Could not load " + c + ": " + e.code, true))));
    unsubs.push(onSnapshot(collection(dbVisitor, "articles"),
      s => { topArticles = s.docs.map(d => ({ slug: d.id, title: d.data().title || null, count: d.data().count || 0 })).sort((a, b) => b.count - a.count).slice(0, 10); render(); },
      e => { topArticles = "Could not load top articles: " + (e.code || e.message); render(); }));
    unsubs.push(onSnapshot(collection(db, "users"),
      s => { usersList = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.profileComplete === true); render(); },
      e => { usersList = "Could not load users: " + (e.code || e.message) + (e.code === "permission-denied" ? ". Allow the admin to read the users collection in Firestore rules." : ""); render(); }));
  }
});
