import { db, fs, waitForUser } from "./firebase.js";
import { BUILT_IN, CATS, CAT_OWN, compute } from "./engine.js";
const { doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteDoc, collection, onSnapshot } = fs;
const $ = (id) => document.getElementById(id), SID = "tp_web_sid", DAY = 864e5;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100);
const norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const sha1 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; };
const toast = (t) => { $("toast").textContent = t; $("toast").hidden = false; setTimeout(() => ($("toast").hidden = true), 1800); };
const guard = (f) => async (...a) => { try { await f(...a); } catch (e) { say(/permission/i.test(e.message) ? "Not allowed by the Firestore rules. Publish the updated firestore.rules." : e.message); } };
let email, name, sid, contacts = [], acts = [], emos = [], open = null, cat = null, loaded = 0;
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
  const err = (e) => say(/permission/i.test(e.message) ? "Your cloud backup could not be read. Publish the updated firestore.rules." : "Could not read your data: " + e.message);
  const watch = (p, set) => onSnapshot(collection(db, base() + p), (s) => { set(s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() }))); loaded++; render(); }, err);
  watch("/contacts/list", (r) => (contacts = r)); watch("/activity/list", (r) => (acts = r)); watch("/emotions/list", (r) => (emos = r));
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, b, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const allEmotions = () => [...BUILT_IN, ...emos.map((e) => ({ ...e, category: CAT_OWN }))];
const shut = () => { open = cat = null; $("pane").hidden = $("scrim").hidden = true; render(); };
function render() { if (!email) return; renderList(); if (open) renderDetail(); }

function renderList() {
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg)))
    .sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  $("count").textContent = loaded >= 3 ? `${rows.length} of ${contacts.length} contacts` : "";
  $("list").innerHTML = rows.map(({ c, total, t }) => `<button class="row ${c.key === open ? "on" : ""}" data-k="${esc(c.key)}"><div class="av">${esc((c.name || "?")[0].toUpperCase())}</div>
    <div class="g"><div class="n">${esc(c.name)}</div><div class="muted">${esc(c.phone)} · ${fmt(total)} pts</div></div>
    ${t ? `<span class="pill ${t.band[2]}">${Math.round(t.percent)}%</span>` : '<span class="muted">No data</span>'}</button>`).join("")
    || (contacts.length ? '<p class="muted">No contact matches.</p>' : loaded >= 3 ? '<div class="empty"><b>Nothing backed up yet.</b><br>In the app open Settings, Cloud backup, then tap Backup or turn on Automatic backup.</div>' : '<p class="muted">Loading</p>');
}
function spark(h, b) {
  if (!h.length) return "";
  const pts = [], end = Date.now();
  for (let i = 29; i >= 0; i--) pts.push(compute(h, b, end - i * DAY)?.percent ?? 50);
  return `<h3>Trust, last 30 days</h3><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none"><path d="${pts.map((p, i) => `${i ? "L" : "M"}${(i / 29 * 300).toFixed(1)},${(65 - p * .6).toFixed(1)}`).join("")}"/></svg>`;
}
function renderDetail() {
  const c = contacts.find((x) => x.key === open);
  if (!c) return shut();
  const { h, b, total, t } = stat(c), pos = h.filter((x) => x.points > 0).length, neg = h.filter((x) => x.points < 0).length;
  const cnt = {}; h.forEach((x) => (cnt[x.emotionName] = (cnt[x.emotionName] || 0) + 1));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4), tm = Math.max(1, ...top.map((x) => x[1]));
  const opts = cat ? allEmotions().filter((e) => e.category === cat).sort((a, b) => b.points - a.points) : [];
  const pct = t ? t.percent : 0, cls = t ? t.band[2] : "";
  $("detail").innerHTML = `<h2>${esc(c.name)}</h2><div class="muted">${esc(c.phone)}</div>
    <div class="top"><div class="gauge ${cls}"><svg viewBox="0 0 120 120"><circle class="t" cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke-dasharray="${(pct / 100 * 326.7).toFixed(1)} 326.7"/></svg><b>${t ? Math.round(pct) + "%" : "–"}</b></div>
      <div class="facts"><span class="band ${cls}">${t ? t.band[0] : "No data yet"}</span><span class="muted">${t ? t.band[1] : "Add an emotion to start."}</span><span>${fmt(total)} points <span class="muted">(default ${fmt(b)})</span></span></div></div>
    ${t?.safety ? '<p class="bad">A serious betrayal was logged in the last 30 days, so trust is held down.</p>' : ""}
    <h3>Add an emotion</h3><div class="opts">${CATS.map((k) => `<button class="tab ${cat === k ? "on" : "ghost"}" data-cat="${esc(k)}">${esc(k.split(" (")[0])}</button>`).join("")}</div>
    ${cat ? `<div class="opts">${opts.map((e) => `<button class="opt" data-e="${esc(e.name)}">${esc(e.name)}<b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></button>`).join("") || '<span class="muted">No emotions in this group.</span>'}</div>` : '<p class="muted">Choose a kind, then tap what happened.</p>'}
    <h3>Statistics</h3><div class="tiles"><div class="tile"><span class="muted">Entries</span><b>${h.length}</b></div><div class="tile"><span class="muted">Last 7 days</span><b>${h.filter((x) => x.timestamp > Date.now() - 7 * DAY).length}</b></div>
      <div class="tile"><span class="muted">Good</span><b>${pos + neg ? Math.round(pos / (pos + neg) * 100) : 0}%</b></div><div class="tile"><span class="muted">Last entry</span><b>${h[0] ? new Date(h[0].timestamp).toLocaleDateString() : "–"}</b></div></div>
    ${spark(h, b)}${top.length ? `<h3>Most logged</h3>${top.map(([n, v]) => `<div class="br"><span>${esc(n)}</span><i style="width:${v / tm * 40}%"></i>${v}</div>`).join("")}` : ""}
    <h3>History</h3>${h.map((x) => `<div class="hist"><div>${esc(x.emotionName)} <b class="${x.points < 0 ? "bad" : "ok"}">${fmt(x.points)}</b><div class="muted">${new Date(x.timestamp).toLocaleString()}</div></div><button class="ghost" data-del="${esc(x.id)}">Delete</button></div>`).join("") || '<p class="muted">Nothing logged yet.</p>'}
    <p class="muted">Entries added here save to your cloud backup. The next Backup from the app can remove them unless you restore them to the phone first.</p>`;
}
document.addEventListener("click", guard(async (ev) => {
  const t = ev.target.closest("button"); if (!t) return;
  const c = contacts.find((x) => x.key === open);
  if (t.id === "logout") { await updateDoc(doc(db, "webLogin", sid), { status: "loggedout" }).catch(() => {}); await deleteDoc(doc(db, "webSessions", (await waitForUser()).uid)).catch(() => {}); return bounce(); }
  if (t.id === "back") return shut();
  if (t.dataset.k) { open = t.dataset.k; cat = null; $("pane").hidden = $("scrim").hidden = false; $("pane").scrollTop = 0; return render(); }
  if (t.dataset.cat) { cat = cat === t.dataset.cat ? null : t.dataset.cat; return renderDetail(); }
  if (t.dataset.e && c) {
    const e = allEmotions().find((x) => x.name === t.dataset.e), ts = Date.now();
    await setDoc(doc(db, base() + "/activity/list", await sha1(`${c.key}|${ts}|${e.name}`)), { phoneKey: c.key, contactName: c.name || "", emotionName: e.name, points: e.points, timestamp: ts });
    cat = null; return toast("Emotion added");
  }
  if (t.dataset.del && confirm("Delete this entry?")) return deleteDoc(doc(db, base() + "/activity/list", t.dataset.del));
}));
$("q").addEventListener("input", renderList);
$("scrim").addEventListener("click", shut);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) shut(); });
start().catch((e) => say(e.message));
