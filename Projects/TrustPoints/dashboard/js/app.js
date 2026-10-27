import { db, fs, waitForUser } from "./firebase.js";
import { BUILT_IN, CATS, CAT_OWN, compute } from "./engine.js";
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteDoc, collection, onSnapshot } = fs;
const $ = (id) => document.getElementById(id), SID = "tp_web_sid";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; };
let email, name, sid, contacts = [], acts = [], emos = [], open = null, view = "contacts", cat = null, loaded = 0;
const bounce = () => { localStorage.removeItem(SID); location.replace("../index.html"); };
const base = () => `users/${email}/backup`;

async function start() {
  const user = await waitForUser();
  sid = localStorage.getItem(SID);
  if (!sid) return bounce();
  const d = (await getDoc(doc(db, "webLogin", sid)).catch(() => null))?.data();
  if (!d || d.webUid !== user.uid || d.status !== "approved") return bounce();
  await setDoc(doc(db, "webSessions", user.uid), { sid, at: serverTimestamp() }).catch(() => {});
  email = d.email.toLowerCase(); name = d.name || email;
  $("meav").textContent = name[0].toUpperCase(); $("mename").textContent = name; $("memail").textContent = email;
  onSnapshot(doc(db, "webLogin", sid), (s) => { if (!s.exists() || ["revoked", "loggedout"].includes(s.data().status)) bounce(); });
  const err = (e) => say(/permission/i.test(e.message) ? "Your cloud backup could not be read. Publish the updated Firestore rules (see README.txt)." : "Could not read your data: " + e.message);
  const watch = (p, set) => onSnapshot(collection(db, base() + p), (s) => { set(s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() }))); loaded++; render(); }, err);
  watch("/contacts/list", (r) => (contacts = r)); watch("/activity/list", (r) => (acts = r)); watch("/emotions/list", (r) => (emos = r));
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const allEmotions = () => [...BUILT_IN, ...emos.map((e) => ({ ...e, category: CAT_OWN }))];
const noBackup = `<div class="empty"><b>Nothing backed up yet.</b><br>In the TrustPoints app open Settings, then Cloud backup, and tap Backup or turn on Automatic backup. This page updates by itself.</div>`;

function render() {
  if (!email) return;
  ({ contacts: renderList, stats: renderStats, emotions: renderEmotions, settings: renderSettings })[view]();
  if (open) renderDetail();
}
function renderList() {
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg)))
    .sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  $("list").innerHTML = rows.map(({ c, total, t }) => `<button class="card" data-k="${esc(c.key)}"><div class="av">${esc((c.name || "?")[0].toUpperCase())}</div>
    <div class="grow"><div class="n">${esc(c.name)}</div><div class="muted">${esc(c.phone)} · ${fmt(total)} pts</div></div>
    <div style="text-align:right">${t ? `<div class="pct ${t.band[2]}">${Math.round(t.percent)}%</div><span class="chip ${t.band[2]}">${t.band[0]}</span>` : '<span class="muted">No data</span>'}</div></button>`).join("")
    || (contacts.length ? '<p class="muted">No contact matches.</p>' : loaded >= 3 ? noBackup : '<p class="muted">Loading</p>');
}
function spark(h, b) {
  if (!h.length) return "";
  const DAY = 864e5, end = Date.now(), pts = [];
  for (let i = 29; i >= 0; i--) pts.push(compute(h, b, end - i * DAY)?.percent ?? 50);
  return `<h3>Trust over the last 30 days</h3><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none"><path d="${pts.map((p, i) => `${i ? "L" : "M"}${(i / 29 * 300).toFixed(1)},${(65 - p * .6).toFixed(1)}`).join("")}"/></svg>`;
}
function renderDetail() {
  const c = contacts.find((x) => x.key === open);
  if (!c) { $("sheet").hidden = true; open = null; return; }
  const { h, total, t } = stat(c), b = +c.basePoints || 0;
  $("detail").innerHTML = `<h2>${esc(c.name)}</h2><div class="muted">${esc(c.phone)}</div>
    <div class="row"><span class="big ${t ? t.band[2] : ""}">${t ? Math.round(t.percent) + "%" : "–"}</span>${t ? `<div><span class="chip ${t.band[2]}">${t.band[0]}</span><div class="muted">${t.band[1]}</div></div>` : ""}</div>
    ${t?.safety ? '<p class="bad">A serious betrayal was logged in the last 30 days, so trust is held down.</p>' : ""}
    <div class="muted">Total ${fmt(total)} points · default points ${fmt(b)}</div>${spark(h, b)}
    <h3>History</h3>${h.map((x) => `<div class="hist"><div>${esc(x.emotionName)} <b class="${x.points < 0 ? "bad" : "ok"}">${fmt(x.points)}</b><div class="muted">${new Date(x.timestamp).toLocaleString()}</div></div></div>`).join("") || '<p class="muted">Nothing logged yet.</p>'}
    <p class="muted">To add or change actions, use the TrustPoints app and back up.</p>`;
}
function renderStats() {
  const now = Date.now(), D = 864e5, pos = acts.filter((a) => a.points > 0).length, neg = acts.filter((a) => a.points < 0).length;
  const di = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / D);
  const days = Array.from({ length: 14 }, (_, i) => acts.filter((a) => di(a.timestamp) === di(now) - (13 - i)).length);
  const mx = Math.max(1, ...days), cnt = {}; acts.forEach((a) => (cnt[a.emotionName] = (cnt[a.emotionName] || 0) + 1));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8), tm = Math.max(1, ...top.map((x) => x[1]));
  const ranked = contacts.map((c) => ({ c, t: stat(c).t })).filter((x) => x.t).sort((a, b) => b.t.percent - a.t.percent);
  const ends = [...ranked.slice(0, 3), ...ranked.slice(-3).filter((r) => !ranked.slice(0, 3).includes(r))];
  $("stats").innerHTML = `<h2>Statistics</h2><div class="stat">
    <div class="card"><span class="muted">Contacts</span><span class="pct">${contacts.length}</span></div>
    <div class="card"><span class="muted">Activities</span><span class="pct">${acts.length}</span></div>
    <div class="card"><span class="muted">Last 7 days</span><span class="pct">${acts.filter((a) => a.timestamp > now - 7 * D).length}</span></div>
    <div class="card"><span class="muted">Good vs hurtful</span><span class="pct">${pos + neg ? Math.round(pos / (pos + neg) * 100) : 0}% good</span></div></div>
    <h3>Entries per day (last 14 days)</h3><div class="bars">${days.map((n) => `<i title="${n}" style="height:${n / mx * 100}%"></i>`).join("")}</div>
    <h3>Most used emotions</h3>${top.map(([n, v]) => `<div class="br"><span>${esc(n)}</span><div style="width:${v / tm * 50}%"></div>${v}</div>`).join("") || '<p class="muted">Nothing here yet.</p>'}
    <h3>Highest and lowest trust</h3>${ends.map((r) => `<div class="hist"><span>${esc(r.c.name)}</span><b class="${r.t.band[2]}">${Math.round(r.t.percent)}%</b></div>`).join("") || '<p class="muted">Nothing here yet.</p>'}`;
}
function renderEmotions() {
  const row = (e) => `<div class="hist"><span>${esc(e.name)}</span><b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></div>`;
  $("emotions").innerHTML = `<h2>Emotions</h2><h3>My own</h3>${[...emos].sort((a, b) => b.points - a.points).map(row).join("") || '<p class="muted">No emotions of your own yet.</p>'}` +
    CATS.slice(0, 2).map((k) => `<h3>${esc(k)}</h3>${BUILT_IN.filter((e) => e.category === k).map(row).join("")}`).join("");
}
function renderSettings() {
  $("settings").innerHTML = `<h2>Settings</h2><h3>Account</h3><div class="hist"><span>Name</span><b>${esc(name)}</b></div><div class="hist"><span>Email</span><b>${esc(email)}</b></div>
    <h3>This browser</h3><p class="muted">Linked to your phone. Unlink it from the app any time under Settings, Linked devices.</p><div class="row"><button class="ghost" id="exp">Download backup file</button><button class="danger" id="logout">Log out</button></div>`;
}
const setView = (v) => { view = v; document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== v)); document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === v)); render(); };
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button"); if (!t) return;
  if (t.matches("#tabs button")) return setView(t.dataset.v);
  if (t.id === "close") { $("sheet").hidden = true; open = null; return; }
  if (t.dataset.k) { open = t.dataset.k; $("sheet").hidden = false; return renderDetail(); }
  if (t.id === "logout") { await updateDoc(doc(db, "webLogin", sid), { status: "loggedout" }).catch(() => {}); await deleteDoc(doc(db, "webSessions", (await waitForUser()).uid)).catch(() => {}); return bounce(); }
  if (t.id === "exp") {
    const j = { contacts: contacts.map(({ key, name, phone, basePoints }) => ({ name, phone, phoneKey: key, basePoints: +basePoints || 0 })), emotions: emos.map(({ name, points, category }) => ({ name, points, category })), history: acts.map(({ phoneKey, emotionName, points, timestamp }) => ({ phoneKey, emotionName, points, timestamp })) };
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], { type: "application/json" })), download: "trustpoints-backup.json" }).click();
  }
});
$("q").addEventListener("input", renderList);
start().catch((e) => say(e.message));
