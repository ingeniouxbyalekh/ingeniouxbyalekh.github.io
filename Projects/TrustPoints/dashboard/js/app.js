import { db, fs, waitForUser } from "./firebase.js";
import { BUILT_IN, CATS, CAT_OWN, compute } from "./engine.js";
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, getDocs, serverTimestamp } = fs;
const $ = (id) => document.getElementById(id), SID = "tp_web_sid";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const sha1 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; if (t) setTimeout(() => ($("msg").hidden = true), 6000); };
const guard = (f) => async (...a) => { try { await f(...a); } catch (e) { say(/PERMISSION|permission/.test(e.message) ? "Not allowed by the Firestore rules. See the note in README.txt." : e.message); } };

let email, sid, profile = {}, contacts = [], acts = [], emos = [], open = null, view = "contacts";
const bounce = () => { localStorage.removeItem(SID); location.replace("../index.html"); };
const base = () => `users/${email}/backup`;

async function start() {
  const user = await waitForUser();
  sid = localStorage.getItem(SID);
  if (!sid) return bounce();
  const d = (await getDoc(doc(db, "webLogin", sid))).data();
  if (!d || d.webUid !== user.uid || d.status !== "approved") return bounce();
  email = d.email;
  onSnapshot(doc(db, "webLogin", sid), (s) => { if (!s.exists() || ["revoked", "loggedout"].includes(s.data().status)) bounce(); });
  const err = (e) => say("Could not read your data: " + e.message);
  onSnapshot(doc(db, "users", email), (s) => { profile = s.data()?.details || {}; render(); }, err);
  onSnapshot(collection(db, base() + "/contacts/list"), (s) => { contacts = s.docs.map((x) => ({ key: x.id, ...x.data() })); render(); }, err);
  onSnapshot(collection(db, base() + "/activity/list"), (s) => { acts = s.docs.map((x) => ({ id: x.id, ...x.data() })); render(); }, err);
  onSnapshot(collection(db, base() + "/emotions/list"), (s) => { emos = s.docs.map((x) => ({ id: x.id, ...x.data() })); render(); }, err);
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const allEmotions = () => [...BUILT_IN, ...emos.map((e) => ({ ...e, category: CAT_OWN }))];

function render() {
  if (!email) return;
  if (view === "contacts") renderList();
  if (view === "stats") renderStats();
  if (view === "emotions") renderEmotions();
  if (view === "settings") renderSettings();
  if (open) renderDetail();
}
function renderList() {
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg)))
    .sort((a, b) => b.total - a.total || a.c.name.localeCompare(b.c.name));
  $("list").innerHTML = rows.map(({ c, total, t }) => `<div class="card" data-k="${esc(c.key)}"><div class="av">${esc((c.name || "?")[0].toUpperCase())}</div>
    <div class="grow"><div class="n">${esc(c.name)}</div><div class="muted">${esc(c.phone)} · ${fmt(total)} pts</div></div>
    <div style="text-align:right">${t ? `<div class="pct ${t.band[2]}">${Math.round(t.percent)}%</div><span class="chip ${t.band[2]}">${t.band[0]}</span>` : '<span class="muted">No data</span>'}</div></div>`).join("")
    || `<p class="muted">${contacts.length ? "No contact matches." : "No contacts yet. Add one, or back up the app so they appear here."}</p>`;
}
function spark(h, b) {
  if (!h.length) return "";
  const DAY = 864e5, end = Date.now(), pts = [];
  for (let i = 29; i >= 0; i--) pts.push(compute(h, b, end - i * DAY)?.percent ?? 50);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(i / 29 * 300).toFixed(1)},${(60 - p * .6 + 5).toFixed(1)}`).join("");
  return `<h3>Trust over the last 30 days</h3><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none"><path d="${d}"/></svg>`;
}
let cat = null;
function renderDetail() {
  const c = contacts.find((x) => x.key === open);
  if (!c) { $("sheet").hidden = true; open = null; return; }
  const { h, total, t } = stat(c), b = +c.basePoints || 0;
  const opts = cat ? allEmotions().filter((e) => e.category === cat).sort((a, b) => b.points - a.points) : [];
  $("detail").innerHTML = `<h2>${esc(c.name)}</h2><div class="muted">${esc(c.phone)}</div>
    <div class="row"><span class="big ${t ? t.band[2] : ""}">${t ? Math.round(t.percent) + "%" : "–"}</span>${t ? `<div><span class="chip ${t.band[2]}">${t.band[0]}</span><div class="muted">${t.band[1]}</div></div>` : ""}</div>
    ${t?.safety ? '<p class="bad">A serious betrayal was logged in the last 30 days, so trust is held down.</p>' : ""}
    <div class="muted">Total ${fmt(total)} points</div>${spark(h, b)}
    <h3>Default points (−10 to +10)</h3><div class="row"><input id="bp" type="number" step="0.5" min="-10" max="10" value="${b}"><button id="bps">Save</button></div>
    <h3>Add an action</h3><div class="muted">1. What kind of action?</div>
    <div class="row">${CATS.map((k) => `<button class="${cat === k ? "" : "ghost"}" data-cat="${esc(k)}">${esc(k.split(" (")[0])}</button>`).join("")}</div>
    ${cat ? `<div class="muted">2. What happened?</div><div class="row">${opts.map((e, i) => `<button class="opt" data-e="${esc(e.name)}">${esc(e.name)}<b>${fmt(e.points)}</b></button>`).join("") || '<span class="muted">No actions here yet. Add some under Emotions.</span>'}</div>` : ""}
    <h3>History</h3>${h.map((x) => `<div class="hist"><div>${esc(x.emotionName)} <b class="${x.points < 0 ? "bad" : "ok"}">${fmt(x.points)}</b><div class="muted">${new Date(x.timestamp).toLocaleString()}</div></div><button class="ghost" data-del="${x.id}">Delete</button></div>`).join("") || '<p class="muted">Nothing logged yet.</p>'}
    <h3>Danger zone</h3><button class="danger" id="delc">Delete this contact</button>`;
}
function renderStats() {
  const now = Date.now(), D = 864e5, pos = acts.filter((a) => a.points > 0).length, neg = acts.filter((a) => a.points < 0).length;
  const days = Array.from({ length: 14 }, (_, i) => acts.filter((a) => Math.floor((a.timestamp - new Date(a.timestamp).getTimezoneOffset() * 6e4) / D) === Math.floor((now - new Date(now).getTimezoneOffset() * 6e4) / D) - (13 - i)).length);
  const mx = Math.max(1, ...days), cnt = {}; acts.forEach((a) => (cnt[a.emotionName] = (cnt[a.emotionName] || 0) + 1));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8), tm = Math.max(1, ...top.map((x) => x[1]));
  const ranked = contacts.map((c) => ({ c, t: stat(c).t })).filter((x) => x.t).sort((a, b) => b.t.percent - a.t.percent);
  $("stats").innerHTML = `<h2>Statistics</h2><div class="stat">
    <div class="card"><span class="muted">Contacts</span><span class="pct">${contacts.length}</span></div>
    <div class="card"><span class="muted">Activities</span><span class="pct">${acts.length}</span></div>
    <div class="card"><span class="muted">Last 7 days</span><span class="pct">${acts.filter((a) => a.timestamp > now - 7 * D).length}</span></div>
    <div class="card"><span class="muted">Good vs hurtful</span><span class="pct">${pos + neg ? Math.round(pos / (pos + neg) * 100) : 0}% good</span></div></div>
    <h3>Entries per day (last 14 days)</h3><div class="bars">${days.map((n) => `<i title="${n}" style="height:${n / mx * 100}%"></i>`).join("")}</div>
    <h3>Most used emotions</h3>${top.map(([n, v]) => `<div class="br"><span>${esc(n)}</span><div style="width:${v / tm * 50}%"></div>${v}</div>`).join("") || '<p class="muted">Nothing here yet.</p>'}
    <h3>Highest and lowest trust</h3>${[...ranked.slice(0, 3), ...ranked.slice(-3).filter((r) => !ranked.slice(0, 3).includes(r))].map((r) => `<div class="hist"><span>${esc(r.c.name)}</span><b class="${r.t.band[2]}">${Math.round(r.t.percent)}%</b></div>`).join("") || '<p class="muted">Nothing here yet.</p>'}`;
}
function renderEmotions() {
  const f = document.activeElement?.closest?.("#emotions");
  if (f) return;                                               // do not wipe a form while typing
  $("emotions").innerHTML = `<h2>My emotions</h2><p class="muted">Past history keeps its name and points. Only the button is removed.</p>
    <div class="bar"><input id="en" placeholder="Name (e.g. Trust)"><input id="ep" type="number" step="0.05" min="-1" max="1" placeholder="Points (e.g. 0.1 or -0.2)"><button id="eadd">Add emotion</button></div>
    ${emos.sort((a, b) => b.points - a.points).map((e) => `<div class="hist"><span>${esc(e.name)} <b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></span><button class="ghost" data-edel="${e.id}">Delete</button></div>`).join("") || '<p class="muted">No emotions of your own yet.</p>'}
    <h3>Built-in actions</h3>${BUILT_IN.map((e) => `<div class="hist"><span>${esc(e.name)}</span><b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></div>`).join("")}`;
}
async function renderSettings() {
  const dev = (await getDocs(collection(db, `users/${email}/linkedDevices`)).catch(() => ({ docs: [] }))).docs.map((x) => ({ id: x.id, ...x.data() }));
  $("settings").innerHTML = `<h2>Settings</h2><h3>Account</h3><div class="hist"><span>Name</span><b>${esc(profile.name || "")}</b></div><div class="hist"><span>Email</span><b>${esc(email)}</b></div><div class="hist"><span>Phone</span><b>${esc(profile.phone || "")}</b></div>
    <h3>Linked devices</h3>${dev.map((d) => `<div class="hist"><span>${esc(d.browser || "Web browser")}${d.id === sid ? " (this browser)" : ""}<div class="muted">${d.linkedAt?.toDate ? d.linkedAt.toDate().toLocaleString() : ""}</div></span><button class="ghost" data-unlink="${d.id}">Unlink</button></div>`).join("") || '<p class="muted">None.</p>'}
    <h3>Backup file</h3><div class="row"><button id="exp">Export to file</button><button class="ghost" id="imp">Import from file</button><input id="file" type="file" accept=".json,application/json" hidden></div>`;
}
const setView = (v) => { view = v; document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== v)); document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === v)); if (v === "emotions") document.activeElement.blur?.(); render(); };
const addAct = (c, e) => addActRaw(c.key, c.name, e.name, e.points, Date.now());
async function addActRaw(key, cname, ename, points, ts) { await setDoc(doc(db, base() + "/activity/list", await sha1(`${key}|${ts}|${ename}`)), { phoneKey: key, contactName: cname, emotionName: ename, points, timestamp: ts }); }

document.addEventListener("click", guard(async (ev) => {
  const t = ev.target.closest("button,.card"); if (!t) return;
  const c = contacts.find((x) => x.key === open);
  if (t.matches("#tabs button")) return setView(t.dataset.v);
  if (t.id === "logout") { await updateDoc(doc(db, "webLogin", sid), { status: "loggedout" }).catch(() => {}); return bounce(); }
  if (t.id === "close") { $("sheet").hidden = true; open = cat = null; return; }
  if (t.dataset.k) { open = t.dataset.k; cat = null; $("sheet").hidden = false; return renderDetail(); }
  if (t.dataset.cat) { cat = cat === t.dataset.cat ? null : t.dataset.cat; return renderDetail(); }
  if (t.dataset.e && c) { await addAct(c, allEmotions().find((e) => e.name === t.dataset.e)); cat = null; return; }
  if (t.dataset.del) return deleteDoc(doc(db, base() + "/activity/list", t.dataset.del));
  if (t.id === "bps") { const v = Math.max(-10, Math.min(10, parseFloat($("bp").value) || 0)); return setDoc(doc(db, base() + "/contacts/list", c.key), { basePoints: v }, { merge: true }); }
  if (t.id === "delc" && confirm(`Delete ${c.name} and all their history?`)) { await Promise.all(histOf(c.key).map((x) => deleteDoc(doc(db, base() + "/activity/list", x.id)))); await deleteDoc(doc(db, base() + "/contacts/list", c.key)); $("sheet").hidden = true; open = null; return; }
  if (t.id === "addc") { const name = prompt("Name"); if (!name) return; const phone = prompt("Phone number"); const k = norm(phone || ""); if (k.length < 5) return say("Enter a valid phone number."); const bp = parseFloat(prompt("Default points (−10 to +10)", "0")) || 0; return setDoc(doc(db, base() + "/contacts/list", k), { name: name.trim(), phone: phone.trim(), basePoints: Math.max(-10, Math.min(10, bp)) }); }
  if (t.id === "eadd") { const n = $("en").value.trim(), p = parseFloat($("ep").value); if (!n || isNaN(p)) return say("Enter a name and points."); if (BUILT_IN.some((e) => e.name.toLowerCase() === n.toLowerCase()) || emos.some((e) => e.name.toLowerCase() === n.toLowerCase())) return say(`"${n}" already exists. Please use another name.`); await setDoc(doc(db, base() + "/emotions/list", await sha1(n.toLowerCase())), { name: n, points: Math.max(-1, Math.min(1, p)), category: CAT_OWN }); $("en").value = $("ep").value = ""; return; }
  if (t.dataset.edel) return deleteDoc(doc(db, base() + "/emotions/list", t.dataset.edel));
  if (t.dataset.unlink) { await updateDoc(doc(db, "webLogin", t.dataset.unlink), { status: "revoked" }).catch(() => {}); await deleteDoc(doc(db, `users/${email}/linkedDevices`, t.dataset.unlink)); return t.dataset.unlink === sid ? bounce() : renderSettings(); }
  if (t.id === "exp") { const j = { contacts: contacts.map(({ key, name, phone, basePoints }) => ({ name, phone, phoneKey: key, basePoints: +basePoints || 0 })), emotions: emos.map(({ name, points, category }) => ({ name, points, category })), history: acts.map(({ phoneKey, emotionName, points, timestamp }) => ({ phoneKey, emotionName, points, timestamp })) };
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], { type: "application/json" })), download: "trustpoints-backup.json" }); a.click(); return; }
  if (t.id === "imp") return $("file").click();
}));
document.addEventListener("change", guard(async (ev) => {
  if (ev.target.id !== "file" || !ev.target.files[0]) return;
  const j = JSON.parse(await ev.target.files[0].text()), names = new Map(contacts.map((c) => [c.key, c.name]));
  for (const c of j.contacts || []) if (!names.has(c.phoneKey)) await setDoc(doc(db, base() + "/contacts/list", c.phoneKey), { name: c.name, phone: c.phone, basePoints: c.basePoints || 0 });
  for (const e of j.emotions || []) await setDoc(doc(db, base() + "/emotions/list", await sha1(e.name.toLowerCase())), { name: e.name, points: e.points, category: e.category || CAT_OWN }, { merge: true });
  for (const h of j.history || []) await addActRaw(h.phoneKey, names.get(h.phoneKey) || (j.contacts || []).find((c) => c.phoneKey === h.phoneKey)?.name || "", h.emotionName, h.points, h.timestamp);
  ev.target.value = ""; say("Import finished. Nothing was deleted.");
}));
$("q").addEventListener("input", renderList);
start().catch((e) => say(e.message));
