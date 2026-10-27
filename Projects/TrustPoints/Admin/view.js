import { db, fs, requireAdmin, logout } from "./fb.js";
import { compute } from "../dashboard/js/engine.js";
const { collection, getDocs, onSnapshot } = fs, DAY = 864e5, $ = (i) => document.getElementById(i);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n > 0 ? "+" : "") + (Math.round(n * 100) / 100), norm = (p) => { const d = String(p).replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const stamp = (t) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const tone = (p) => (p < 40 ? "low" : p < 65 ? "mid" : "high");
const wide = () => matchMedia("(min-width: 861px)").matches;
const say = (t) => { $("msg").textContent = t; $("msg").hidden = !t; };
const email = (new URLSearchParams(location.search).get("u") || "").toLowerCase();
let contacts = [], acts = [], emos = [], open = null, sheet = false, shown = null, loaded = 0, need = 3, ids = [];
const data = {};
const epoch = (id) => (id === email ? 1 : parseInt(id.slice(email.length + 1)) || 1);
function merge() {   // permanentData keeps one tree per sign-in; the union of them is the full history
  const m = { c: new Map(), a: new Map(), e: new Map() };
  [...ids].sort((x, y) => epoch(x) - epoch(y)).forEach((id) => { const d = data[id] || {}; (d.c || []).forEach((x) => m.c.set(x.key, x)); (d.a || []).forEach((x) => m.a.set(x.id, x)); (d.e || []).forEach((x) => m.e.set(x.id, x)); });
  contacts = [...m.c.values()]; acts = [...m.a.values()]; emos = [...m.e.values()];
}
const histOf = (k) => acts.filter((a) => a.phoneKey === k).sort((a, b) => b.timestamp - a.timestamp);
const stat = (c) => { const h = histOf(c.key), b = +c.basePoints || 0; return { h, b, total: b + h.reduce((s, x) => s + x.points, 0), t: compute(h, b) }; };
const shut = () => { sheet = false; open = null; render(); };
function render() {
  merge();
  const q = $("q").value.trim().toLowerCase(), dg = q.replace(/\D/g, "");
  const rows = contacts.map((c) => ({ c, ...stat(c) })).filter(({ c }) => !q || (c.name || "").toLowerCase().includes(q) || (dg && norm(c.phone).includes(dg))).sort((a, b) => b.total - a.total || (a.c.name || "").localeCompare(b.c.name || ""));
  if (!open && !sheet && loaded >= need && rows.length && wide()) open = rows[0].c.key;   // wide screens always show a contact
  $("count").textContent = loaded >= need ? `${rows.length} of ${contacts.length} contacts` : "";
  $("emos").innerHTML = emos.length ? `<div class="chips">${[...emos].sort((a, b) => b.points - a.points).map((e) => `<span class="chip">${esc(e.name)}<b class="${e.points < 0 ? "bad" : "ok"}">${fmt(e.points)}</b></span>`).join("")}</div>` : "";
  $("list").innerHTML = rows.map(({ c, t }) => {
    const p = t ? Math.round(t.percent) : null;
    return `<button class="row" type="button" data-k="${esc(c.key)}" aria-current="${open === c.key}"><div class="av">${esc((c.name || "?")[0].toUpperCase())}</div><div class="g"><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.phone)}</div></div>${t ? `<div class="score tone-${tone(t.percent)}"><b>${p}%</b><span class="mini"><i style="--v:${p}%"></i></span></div>` : '<span class="sub">No data</span>'}<i class="chev" aria-hidden="true"></i></button>`;
  }).join("") || `<div class="empty">${loaded >= need ? (contacts.length ? "No contacts match." : "No backup yet.") : "Loading…"}</div>`;
  $("split").classList.toggle("open", sheet);
  document.documentElement.classList.toggle("lock", sheet && !wide());
  detail();
}
function detail() {
  const c = open && contacts.find((x) => x.key === open);
  if (!c) { shown = null; $("detail").innerHTML = '<div class="empty">Select a contact to see their trust.</div>'; return; }
  const fresh = shown !== open; shown = open; if (fresh) $("pane").scrollTop = 0;
  const { h, b, total, t } = stat(c), pos = h.filter((x) => x.points > 0).length, neg = h.filter((x) => x.points < 0).length, pct = t ? Math.round(t.percent) : 0;
  const cnt = {}; h.forEach((x) => (cnt[x.emotionName] = (cnt[x.emotionName] || 0) + 1)); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4), tm = Math.max(1, ...top.map((x) => x[1]));
  const pts = []; if (h.length) for (let i = 29; i >= 0; i--) pts.push(compute(h, b, Date.now() - i * DAY)?.percent ?? 50);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${(i / 29 * 300).toFixed(1)},${(78 - p * .74).toFixed(1)}`).join("");
  $("detail").innerHTML = `<div class="dhead"><div class="av lg">${esc((c.name || "?")[0].toUpperCase())}</div><div class="g"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.phone)}</p></div></div>
  <section class="trust tone-${t ? tone(t.percent) : "none"}${fresh ? " fresh" : ""}"><div class="trow"><div class="big">${t ? pct + "<small>%</small>" : "–"}</div><div class="verdict"><span class="band">${t ? esc(t.band[0]) : "No data"}</span><span class="muted">${fmt(total)} points</span></div></div>
  ${t ? `<div class="meter" role="img" aria-label="Trust ${pct} percent"><i style="--v:${pct}%"></i></div>` : ""}</section>
  ${t?.safety ? '<p class="alert">Serious betrayal in the last 30 days.</p>' : ""}
  <dl class="stats"><div><dt>Entries</dt><dd>${h.length}</dd></div><div><dt>Last 7 days</dt><dd>${h.filter((x) => x.timestamp > Date.now() - 7 * DAY).length}</dd></div><div><dt>Positive</dt><dd>${pos + neg ? Math.round(pos / (pos + neg) * 100) : 0}%</dd></div><div><dt>Last entry</dt><dd>${h[0] ? new Date(h[0].timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "–"}</dd></div></dl>
  ${pts.length ? `<h3>Last 30 days</h3><svg class="spark" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Trust over the last 30 days"><path class="area" d="${line}L300,80L0,80Z"/><path class="line" d="${line}"/></svg><div class="axis"><span>30 days ago</span><span>Today</span></div>` : ""}
  ${top.length ? `<h3>Most logged</h3>${top.map(([n, v]) => `<div class="freq"><span>${esc(n)}</span><div class="track"><i style="--w:${v / tm * 100}%"></i></div><b>${v}</b></div>`).join("")}` : ""}
  <h3>History</h3>${h.length ? `<div>${h.map((x) => `<div class="entry"><div><div>${esc(x.emotionName)}</div><div class="sub">${stamp(x.timestamp)}</div></div><b class="delta ${x.points < 0 ? "bad" : "ok"}">${fmt(x.points)}</b></div>`).join("")}</div>` : '<p class="muted">No entries.</p>'}`;
}
requireAdmin().then(async (user) => {
  if (!user) return;
  if (!email) return location.replace("users.html");
  const err = (e) => say("Could not read this user: " + e.message);
  const all = await getDocs(collection(db, "permanentData")).catch((e) => (err(e), { docs: [] }));
  let name = "";
  all.docs.forEach((d) => { const x = d.data(), det = x.details || {}, e = String(x.baseEmail || det.email || d.id.replace(/-\d+$/, "")).toLowerCase(); if (e === email) { ids.push(d.id); name = det.name || name; } });
  $("mename").textContent = name || email; $("memail").textContent = email; $("meav").textContent = (name || email)[0].toUpperCase();
  need = Math.max(1, ids.length * 3); if (!ids.length) { loaded = need; return render(); }
  ids.forEach((id) => { data[id] = {}; const watch = (p, k) => onSnapshot(collection(db, `permanentData/${id}/backup/${p}/list`), (s) => { data[id][k] = s.docs.map((x) => ({ id: x.id, key: x.id, ...x.data() })); loaded++; render(); }, err); watch("contacts", "c"); watch("activity", "a"); watch("emotions", "e"); });
});
document.addEventListener("click", (ev) => { const t = ev.target.closest("button"); if (!t) return; if (t.id === "logout") return logout(); if (t.id === "back") return shut(); if (t.dataset.k) { open = t.dataset.k; sheet = true; render(); } });
$("q").addEventListener("input", render);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) shut(); });
render();
